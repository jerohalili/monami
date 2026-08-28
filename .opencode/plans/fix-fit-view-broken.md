# Fix: Fit View After Place and Delete

## Root Cause

The fit effect at GraphView.tsx:188-212 has two bugs:

1. **`setTimeout` gets cancelled by subsequent `graphData` changes.** React's effect cleanup runs `clearTimeout(t)` when `graphData` changes again before the timeout fires (e.g., selection change, data reload). `zoomToFit` never executes.

2. **`pendingPinRef` check creates a race with the unpin effect.** Both the fit effect and unpin effect run on `[graphData]`. If graphData changes again, the unpin timer gets cancelled, so the pin persists longer than expected and blocks the fit.

## Fix

**Remove `setTimeout` from both branches.** Call `zoomToFit` directly inside the effect. The effect only fires when `graphData` actually changes (topology signature differs), so the bounding box is always valid. No timing coordination needed.

### File: `src/components/GraphView.tsx`

Replace the fit effect (lines 184-212) with:

```tsx
// Fit when new nodes are added or removed.
const prevCount = useRef(graphData.nodes.length);
const didInitialFit = useRef(false);
const didMarkEngineReady = useRef(false);
useEffect(() => {
  if (graphData.nodes.length > prevCount.current) {
    // New node added — fit to show all nodes including the new one.
    // Skip if the user click-placed the node: they positioned it intentionally
    // and don't want the camera to re-center.
    if (!pendingPinRef.current) {
      try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
    }
  } else if (prevCount.current !== null && graphData.nodes.length < prevCount.current) {
    // Node deleted — fit to frame the remaining nodes.
    try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
  }
  prevCount.current = graphData.nodes.length;
}, [graphData]);
```

**Key changes:**
- Removed `setTimeout` from both branches — `zoomToFit` fires synchronously inside the effect
- Removed `return () => clearTimeout(t)` cleanup (no timers to clean up)
- Added `pendingPinRef.current` check directly in the add branch (not inside a setTimeout callback)
- Delete branch always fires `zoomToFit` — no conditions

## Why This Works

| Scenario | Before (broken) | After (fixed) |
|----------|-----------------|---------------|
| Click-place node | setTimeout(250) → pin check → sometimes fires, sometimes cancelled | Direct check: skip if pin set, otherwise fit |
| Add via data load | setTimeout(250) → often cancelled by next graphData change | Direct fit — fires once, immediately |
| Delete node | setTimeout(100) → often cancelled by selection/data reload | Direct fit — fires once, immediately |
| Library onFinishUpdate | Fires before fit, causes brief jump | Still fires, but our zoomToFit overrides it in the same frame |

## Files Changed

| File | Change |
|------|--------|
| `src/components/GraphView.tsx` | Replace fit effect: remove setTimeout, call zoomToFit directly |
