# Fix: Node Drag / Pan Interaction Conflicts

Three issues cause erratic behavior when interacting with nodes on the force graph:

1. **Mouse Event Capture Conflict** — `enablePanInteraction` defaults to `true`, so canvas drag listeners intercept mouse movements and pan the camera even when the user intends to interact with a node.
2. **Pointer Coordinates Mismatch** — Screen pixel coordinates (e.g., `event.clientX`) passed directly into `fx`/`fy` cause a massive offset because react-force-graph operates in an internal graph coordinate space affected by pan offset and zoom level.
3. **Simulation Reheat During Drag** — State updates that trigger `d3ReheatSimulation()` while the user's cursor is down cause d3-force to reconcile locked `fx`/`fy` values with active drag velocity, resulting in viewport drift.

## File to modify

`src/components/GraphView.tsx`

---

## Current state

The library (react-force-graph-2d v1.29.1) supports these props — **none are currently used**:

| Prop | Type | Purpose |
|------|------|---------|
| `onNodeDrag` | `(node, translate: {x,y}) => void` | Fires during node drag. `translate` is cumulative screen-space offset from drag start. |
| `onNodeDragEnd` | `(node, translate: {x,y}) => void` | Fires when drag ends. |
| `enableNodeDrag` | `boolean` | Enable/disable built-in node dragging (default: `true`). |
| `enablePanInteraction` | `boolean \| ((event) => boolean)` | Enable/disable background pan (default: `true`). |
| `screen2GraphCoords` | `(x, y) => {x, y}` | Convert screen pixels to graph-space coordinates. |

The library's built-in drag handler:
- On mousedown on a node: captures the node, sets `fx`/`fy` to pin it
- On mousemove: updates `fx`/`fy` by adding zoom-adjusted mouse delta
- On mouseup: clears `fx`/`fy` (releases the node)
- Fires `onNodeDrag` / `onNodeDragEnd` callbacks with cumulative `translate`

---

## Change 1: Add drag state tracking refs

### What
Track when a node is being dragged and which node it is, so other logic (pan, reheat, useMemo) can cooperate.

### Where
~Line 81 (with the other refs)

### Code to add

```ts
const isDraggingRef = useRef(false);
const dragNodeIdRef = useRef<string | null>(null);
```

---

## Change 2: Add `onNodeDrag` and `onNodeDragEnd` handlers

### What
Intercept the library's built-in drag to:
1. Set `isDraggingRef` / `dragNodeIdRef` flags
2. Ensure `fx`/`fy` are set in **graph space** (the library handles this, but we guard against外部代码 setting screen coords)
3. Prevent `Object.assign` in useMemo from overwriting `fx`/`fy` during an active drag

### Where
On the `<ForceGraph2D>` props block, after `onNodeHover` (line 536)

### Code to add

```tsx
onNodeDrag={(n: object) => {
  const node = n as GNode;
  isDraggingRef.current = true;
  dragNodeIdRef.current = node.id;
}}
onNodeDragEnd={(n: object) => {
  isDraggingRef.current = false;
  dragNodeIdRef.current = null;
  // Library clears fx/fy internally — no action needed.
}}
```

---

## Change 3: Guard `Object.assign` against active drags

### What
During a drag, the library continuously sets `node.fx` / `node.fy`. If a React re-render triggers the `useMemo`, `Object.assign(existing, { ...p, degree })` overwrites those values, causing the node to snap back. Skip the update for the actively dragged node.

### Where
Lines 121-128 (the `if (existing)` branch inside the useMemo)

### Current code

```ts
if (existing) {
  Object.assign(existing, { ...p, degree: degree[p.id] ?? 0 });
  // Re-apply pin if this node was just placed (Object.assign overwrites fx/fy)
  const pin = pendingPinRef.current;
  if (pin && pin.id === p.id) {
    existing.fx = pin.x;
    existing.fy = pin.y;
  }
}
```

### Replacement code

```ts
if (existing) {
  // Skip metadata update for the actively dragged node — the library is
  // continuously setting fx/fy and Object.assign would overwrite them,
  // causing the node to snap back.
  if (!(isDraggingRef.current && existing.id === dragNodeIdRef.current)) {
    Object.assign(existing, { ...p, degree: degree[p.id] ?? 0 });
  }
  // Re-apply pin if this node was just placed (Object.assign overwrites fx/fy)
  const pin = pendingPinRef.current;
  if (pin && pin.id === p.id) {
    existing.fx = pin.x;
    existing.fy = pin.y;
  }
}
```

---

## Change 4: Disable pan during node drag

### What
When a node is being dragged, disable background pan to prevent the viewport from shifting.

### Where
On the `<ForceGraph2D>` props block

### Code to add

```tsx
enablePanInteraction={(e: MouseEvent) => {
  // During a node drag, suppress pan to prevent viewport drift.
  if (isDraggingRef.current) return false;
  return true;
}}
```

---

## Change 5: Skip reheat during active drag

### What
If a topology change triggers `d3ReheatSimulation()` while the user is mid-drag, d3-force reconciles the locked `fx`/`fy` with the new force layout, causing viewport drift. Defer the reheat until the drag ends.

### Where
Inside the reheat guard (the `if (nodeSig !== ... || linkSig !== ...)` block), before calling `g.d3ReheatSimulation()`

### Current code (end of the block)

```ts
g.d3ReheatSimulation();
```

### Replacement code

```ts
// Defer reheat if a node is being dragged — reheating mid-drag causes
// d3-force to fight the locked fx/fy, resulting in viewport drift.
if (!isDraggingRef.current) {
  g.d3ReheatSimulation();
} else {
  // Flag that a reheat is pending; will fire when drag ends.
  // (The next onNodeDragEnd will pick this up.)
  // Use a simple ref rather than state to avoid extra renders.
  pendingReheatRef.current = true;
}
```

And add the ref declaration near the other refs:

```ts
const pendingReheatRef = useRef(false);
```

Then in `onNodeDragEnd`, after clearing the drag state:

```ts
onNodeDragEnd={(n: object) => {
  isDraggingRef.current = false;
  dragNodeIdRef.current = null;
  // Fire any deferred reheat now that the drag is complete.
  if (pendingReheatRef.current) {
    pendingReheatRef.current = false;
    const g = fgRef.current;
    if (g) g.d3ReheatSimulation();
  }
}}
```

---

## Summary of all edits

| Location | Edit |
|----------|------|
| Refs (~line 81) | Add `isDraggingRef`, `dragNodeIdRef`, `pendingReheatRef` |
| useMemo (lines 121-128) | Guard `Object.assign` against actively dragged node |
| ForceGraph2D props | Add `onNodeDrag`, `onNodeDragEnd`, `enablePanInteraction` |
| Reheat guard (line 270) | Skip `d3ReheatSimulation()` during drag, set `pendingReheatRef` |

## Expected behavior after changes

| Scenario | Before | After |
|----------|--------|-------|
| Drag a node | Viewport pans or node snaps back | Node follows cursor, viewport stable |
| Drag then release | Viewport drifts from deferred reheat | Clean release, reheat fires if topology changed |
| Drag during data refresh | `Object.assign` overwrites fx/fy, node jumps | Dragged node skipped from update |
| Background pan | Works correctly | Works correctly (only suppressed during node drag) |
