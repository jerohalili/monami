# Fix: Force Graph Layout Stability

Three issues cause the force graph to reshuffle on every edit:

1. **Object Identity Breaking** - `links` array is recreated every render, causing react-force-graph-2d to reinitialize
2. **Unplaced Node Gravity** - Already mitigated (line 115 skips pending nodes), but link reinit can still cause jolts
3. **Global Layout Reshuffle** - New node additions reheat the simulation, pushing all nodes around

## File to modify

`src/components/GraphView.tsx`

---

## Change 1: Persist link objects across renders

### What
Add a `linkMapRef` (parallel to existing `nodeMapRef`) and reuse link objects across renders.

### Where
- **Line 75**: Add `linkMapRef`, `linkSigRef`, `pinnedByAddRef` refs
- **Lines 131-137**: Replace `links: data.edges.map(...)` with persistent link logic

### Code (refs to add near line 75)

```ts
const linkMapRef = useRef(new Map<string, Relationship & { source: string; target: string }>());
const linkSigRef = useRef<string>("");
const pinnedByAddRef = useRef<Set<string>>(new Set());
```

### Code (replace lines 131-137)

```ts
// Garbage-collect removed links from map
for (const key of linkMapRef.current.keys()) {
  if (!data.edges.find((e) => `${e.sourceId}->${e.targetId}` === key)) {
    linkMapRef.current.delete(key);
  }
}
// Build links: reuse existing objects to preserve identity
const links: (Relationship & { source: string; target: string })[] = [];
for (const e of data.edges) {
  const key = `${e.sourceId}->${e.targetId}`;
  let existing = linkMapRef.current.get(key);
  if (existing) {
    Object.assign(existing, { ...e, source: e.sourceId, target: e.targetId });
  } else {
    existing = { ...e, source: e.sourceId, target: e.targetId };
    linkMapRef.current.set(key, existing);
  }
  links.push(existing);
}
return { nodes, links };
```

---

## Change 2: Add link signature guard

### What
Prevent re-heating when only link properties change (not topology).

### Where
- **Lines 207-219**: Extend the reheat guard to also check link topology

### Code (replace lines 207-219)

```ts
// Only reheat when the actual topology changed (nodes or links added/removed) —
// not on every referential change of `graphData`.
const nodeSig = graphData.nodes.map((n) => n.id).sort().join(",");
const linkSig = graphData.links
  .map((l) => `${lid(l.source)}->${lid(l.target)}`)
  .sort()
  .join(",");
if (nodeSig !== nodeSigRef.current || linkSig !== linkSigRef.current) {
  nodeSigRef.current = nodeSig;
  linkSigRef.current = linkSig;

  // When a new node was just added, pin existing nodes temporarily so the
  // new node settles without dragging the whole layout.  (Unpinned after
  // 1.5 s — see the effect below.)
  if (addedNodeRef.current) {
    addedNodeRef.current = false;
    const pinned = new Set<string>();
    for (const n of graphData.nodes) {
      if (n.fx === undefined && n.fy === undefined) {
        pinned.add(n.id);
        n.fx = n.x;
        n.fy = n.y;
      }
    }
    pinnedByAddRef.current = pinned;
    setTimeout(() => {
      for (const n of graphData.nodes) {
        if (pinned.has(n.id)) {
          n.fx = undefined;
          n.fy = undefined;
        }
      }
      pinnedByAddRef.current = new Set();
    }, 1500);
  }

  g.d3ReheatSimulation();
}
```

---

## Change 3: Track new node additions

### What
Set a flag when a new node enters the simulation, so the reheat effect can pin existing nodes.

### Where
- **Line 125-128** (the `else` branch in useMemo where new nodes are created)

### Code (add one line inside the else branch, after line 127)

```ts
} else {
  existing = { ...p, degree: degree[p.id] ?? 0 } as GNode;
  map.set(p.id, existing);
  addedNodeRef.current = true;  // <-- ADD THIS
}
```

---

## Change 4: Add addedNodeRef declaration

### Where
- Near line 77 (with the other refs)

### Code

```ts
const addedNodeRef = useRef(false);
```

---

## Summary of all edits in GraphView.tsx

| Line(s) | Edit |
|---------|------|
| ~75 | Add `linkMapRef`, `linkSigRef`, `pinnedByAddRef`, `addedNodeRef` declarations |
| 127 | Add `addedNodeRef.current = true;` in the new-node branch |
| 131-137 | Replace links creation with persistent link logic |
| 207-219 | Extend reheat guard with link signature + pin-on-add logic |

## Expected behavior after changes

| Action | Before | After |
|--------|--------|-------|
| Edit node metadata | Graph jolts (new link objects trigger reinit) | No movement (links persist, no reheat) |
| Add node | All nodes scatter (reheat + new node at 0,0) | Only new node moves into place (existing pinned 1.5s) |
| Delete node | Full reshuffle | Minor rebalance (unavoidable, but positions preserved) |
| Toggle pending placement | Jolt from link reinit | No jolt (link topology unchanged) |
