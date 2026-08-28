# Comprehensive Refactoring Plan: Force Graph Layout Stability

## Executive Summary

Four classes of layout instability remain in `GraphView.tsx`. Previous rounds added persistent maps, link identity, drag guards, and reheat deferral — but significant gaps remain against the architectural requirements. This plan addresses every remaining gap.

---

## Gap Analysis: Requirements vs. Current State

### Problem A — Graph Jolts & Reshuffles on State Changes

| Requirement | Status | Gap |
|-------------|--------|-----|
| Persistent node map (mutate in-place) | ✅ Done | — |
| Persistent link map (mutate in-place) | ✅ Done | — |
| Reheat guard (only on topology change) | ✅ Done | — |
| **Stable `graphData` reference** | ❌ **Missing** | useMemo returns a new `{ nodes, links }` object every render. react-force-graph sees a new reference and reinitializes its internal data pipeline even when nodes/links are the same objects. This is the primary remaining cause of jolts on metadata edits. |

### Problem B — Unplaced Nodes Influence Layout

| Requirement | Status | Gap |
|-------------|--------|-----|
| Pending node filtered from graphData | ✅ Done | — |
| **Pending node rendered as React overlay** | ❌ **Missing** | The pending node is only shown as a static banner ("Click anywhere to place X"). No cursor-following visual indicator exists. The spec requires a detached cursor tracker / overlay. |

### Problem C — Screen/Camera Jumps

| Requirement | Status | Gap |
|-------------|--------|-----|
| screen2GraphCoords for placement | ✅ Done | — |
| **Disable pan during placement mode** | ❌ **Missing** | `enablePanInteraction` only suppresses pan during node drag (`isDraggingRef`). During pending placement, pan is still active — if the user accidentally drags the background while placement is active, the viewport shifts. |
| **Auto-fit camera after placement** | ⚠️ Fragile | The fit effect (line 173-187) uses `pendingPinRef` as a guard, but the 400ms delay may race with the unpin timeout (1500ms). If the fit fires while the node is still pinned, the bounding box includes the pinned position — which may differ from where the node settles after unpin. |
| **Mandatory ~200ms unpin** | ❌ Wrong value | Current timeout is 1500ms (line 197). Spec requires ~200ms. |

### Problem D — Nodes Get Permanently "Stuck"

| Requirement | Status | Gap |
|-------------|--------|-----|
| Pin existing nodes before state change | ✅ Done (add only) | — |
| **Pin existing nodes before deletion** | ❌ **Missing** | When a node is deleted, the node signature changes, triggering a reheat. Existing nodes are NOT pinned, so they all shift simultaneously. |
| **Mandatory ~200ms unpin cleanup** | ❌ Wrong value | 1500ms is too long — nodes remain frozen and non-interactive for 1.5s. |
| **Unpin cleanup not cancelled by re-renders** | ⚠️ Risk | The unpin effect depends on `[graphData]`. If graphData changes before the timeout fires, the effect re-runs and the `clearTimeout` cancels the pending unpin. This can permanently freeze nodes if data refreshes frequently. |

---

## Implementation Plan

### File: `src/components/GraphView.tsx`

---

### Change 1: Stabilize `graphData` reference with `useRef` caching

**Problem:** useMemo returns a new object every render. react-force-graph detects the new reference and reinitializes.

**Solution:** Store the `graphData` result in a ref. Only create a new object when the actual content (node IDs + link topology) has changed. Return the cached reference otherwise.

**Location:** Replace the `useMemo` at lines 113-167.

**Approach:**
- Keep the existing memo logic (degree computation, node map, link map, garbage collection)
- After building `nodes` and `links`, compare against the previous result's node IDs and link topology
- If identical, return the previous `graphData` object (same reference)
- If different, create a new object and store it in the ref

**New ref:** `const graphDataRef = useRef<{ nodes: GNode[]; links: (Relationship & { source: string; target: string })[] }>({ nodes: [], links: [] });`

**Logic inside useMemo:**
```ts
const nodeIds = nodes.map(n => n.id).sort().join(",");
const linkKeys = links.map(l => `${lid(l.source)}->${lid(l.target)}`).sort().join(",");
const prev = graphDataRef.current;
if (nodeIds === prev._nodeSig && linkKeys === prev._linkSig) {
  // Content unchanged — return same reference to prevent react-force-graph reinit
  return prev;
}
const result = { nodes, links, _nodeSig: nodeIds, _linkSig: linkKeys };
graphDataRef.current = result;
return result;
```

This preserves the `_nodeSig` and `_linkSig` on the object itself for next-comparison, without affecting react-force-graph (it ignores unknown properties).

---

### Change 2: Reduce unpin timeout from 1500ms to 200ms

**Problem:** Nodes remain frozen for 1.5s after placement/add, violating the "mandatory ~200ms cleanup" requirement.

**Location:** Two timeouts to change:
1. **Line 197** — unpin placed node: change `1500` → `200`
2. **Line 275** — unpin pinned-by-add nodes: change `1500` → `200`

**Also:** The fit effect delay at line 181 (`400ms`) should be reduced to `250ms` so it fires after the unpin (200ms) but before significant drift.

---

### Change 3: Make unpin cleanup immune to re-renders

**Problem:** The unpin `useEffect` depends on `[graphData]`. If graphData changes before the timeout, `clearTimeout` cancels the pending unpin, permanently freezing nodes.

**Solution:** Use a ref to track the timeout ID instead of relying on effect cleanup. The timeout should fire regardless of re-renders.

**Location:** Replace the unpin effect at lines 189-199.

**Approach:**
```ts
// Unpin placed node after physics settles.
// Uses a ref for the timeout so it survives re-renders — the cleanup
// must fire even if graphData changes again before the timeout.
const unpinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => {
  const pin = pendingPinRef.current;
  if (!pin) return;
  // Clear any previous pending unpin
  if (unpinTimerRef.current) clearTimeout(unpinTimerRef.current);
  unpinTimerRef.current = setTimeout(() => {
    const n = nodeMapRef.current.get(pin.id);
    if (n) { n.fx = undefined; n.fy = undefined; }
    pendingPinRef.current = null;
    unpinTimerRef.current = null;
  }, 200);
  // No cleanup — the timer must fire even if graphData changes
}, [graphData]);
```

Similarly for the pinnedByAdd timeout inside the force-config effect (line 267-275), extract it to a ref-based timer.

---

### Change 4: Pin existing nodes during deletion

**Problem:** When a node is deleted, the node signature changes, triggering a reheat. All unpinned nodes shift simultaneously.

**Solution:** In the force-config effect, when the node signature shrinks (a node was removed), pin all remaining unpinned nodes temporarily, same as the add logic.

**Location:** Inside the reheat guard (lines 249-284), after the `addedNodeRef` block.

**Approach:**
```ts
// Detect deletion: node count decreased
const prevNodeCount = prevNodeCountRef.current;
prevNodeCountRef.current = graphData.nodes.length;
if (graphData.nodes.length < prevNodeCount && !addedNodeRef.current) {
  // Node deleted — pin remaining nodes so only the deleted node's
  // absence causes a localized rebalance, not a global reshuffle.
  const pinned = new Set<string>();
  for (const n of graphData.nodes) {
    if (n.fx === undefined && n.fy === undefined) {
      pinned.add(n.id);
      n.fx = n.x;
      n.fy = n.y;
    }
  }
  setTimeout(() => {
    for (const n of graphData.nodes) {
      if (pinned.has(n.id)) {
        n.fx = undefined;
        n.fy = undefined;
      }
    }
  }, 200);
}
```

**New ref:** `const prevNodeCountRef = useRef(0);` — initialized in the effect on first run.

---

### Change 5: Suppress pan during pending placement

**Problem:** `enablePanInteraction` only suppresses pan during node drag. During pending placement, background pan is still active.

**Location:** Line 563 — `enablePanInteraction` prop.

**Change from:**
```ts
enablePanInteraction={(e: MouseEvent) => !isDraggingRef.current}
```

**To:**
```ts
enablePanInteraction={(e: MouseEvent) => !isDraggingRef.current && !pendingPlacement}
```

This disables pan both during node drag AND during pending placement mode.

---

### Change 6: Render pending node as a cursor-following overlay (Problem B)

**Problem:** The pending node is only shown as a static banner. The spec requires a React overlay that follows the cursor.

**Location:** After the `ForceGraph2D` component (around line 603), replace the existing pending placement banner.

**Approach:**
1. Add a `cursorPos` state: `const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);`
2. Track mouse position on the wrapper div (already done via `onMouseMove` → `tipPos` — reuse this)
3. Render a small node preview (circle with initials) at the cursor position when `pendingPlacement` is active
4. The overlay is pure React/CSS — completely outside the force graph canvas, so it has zero effect on d3-force

**New JSX (replaces the existing banner at lines 645-649):**
```tsx
{pendingPlacement && (
  <>
    {/* Banner */}
    <div className="pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-medium shadow-lg backdrop-blur"
      style={{ top: 80, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}>
      Click anywhere to place <span className="font-semibold text-violet-400">{pendingPlacement.name}</span>
    </div>
    {/* Cursor-following node preview */}
    <div className="pointer-events-none absolute z-50 flex items-center justify-center rounded-full shadow-lg"
      style={{
        left: tipPos.x - 14,
        top: tipPos.y - 14,
        width: 28,
        height: 28,
        background: colorForName(pendingPlacement.name),
        border: "2px solid #8b5cf6",
        boxShadow: "0 0 12px rgba(139,92,246,0.5)",
      }}>
      <span className="text-[10px] font-semibold" style={{ color: "#0b101d" }}>
        {initialsOf(pendingPlacement.name)}
      </span>
    </div>
  </>
)}
```

This shows the node's initials circle following the cursor, giving the user a clear visual preview of where the node will land.

---

## Summary of All Changes

| # | Change | Lines Affected | Problem |
|---|--------|---------------|---------|
| 1 | Stabilize `graphData` reference with ref caching | 113-167 (useMemo) | A — Jolts |
| 2 | Reduce unpin timeout 1500ms → 200ms | 197, 275 | C — Camera jumps, D — Stuck nodes |
| 3 | Make unpin cleanup immune to re-renders | 189-199 (effect) | D — Stuck nodes |
| 4 | Pin existing nodes during deletion | 249-284 (reheat guard) | A — Jolts on delete |
| 5 | Suppress pan during pending placement | 563 (enablePanInteraction) | C — Camera jumps |
| 6 | Render cursor-following node overlay | 645-649 (JSX) | B — Unplaced node visual |

## Files Modified

| File | Changes |
|------|---------|
| `src/components/GraphView.tsx` | All 6 changes |

## Expected Behavior After Changes

| Scenario | Before | After |
|----------|--------|-------|
| Edit node metadata | Graph jolts (new graphData ref) | No movement (same reference) |
| Add node | All nodes scatter for 1.5s | Only new node moves; others pin 200ms |
| Delete node | Full reshuffle | Remaining nodes pin 200ms, localized rebalance |
| Pending placement | Static banner only, pan active | Cursor-following preview, pan disabled |
| Click to place | Camera may jump from auto-fit | Stable — fit fires after unpin at 250ms |
| Drag during placement | Viewport pans | Pan suppressed |
| Data refresh during unpin | Timeout cancelled, nodes freeze | Timeout survives re-renders |
