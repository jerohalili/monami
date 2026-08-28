# Fix: Auto-Fit After Place and Delete (Final)

## Evidence from Screenshots

- Image 1 (after place): 4 nodes, scattered, view NOT fitted
- Image 2 (manual fit): Same 4 nodes, properly centered
- Image 3 (after delete): 3 nodes, scattered, view NOT fitted
- Image 4 (manual fit): Same 3 nodes, properly centered

**Conclusion:** The auto-fit effect fires but `zoomToFit` produces wrong results because it runs before d3 has positioned nodes.

## Root Cause

The library's `onFinishUpdate` fires during React's commit phase (line 555 of canvas-force-graph.js), BEFORE:
1. d3 simulation ticks (nodes are at initial positions)
2. React effects run (our zoomToFit)

Our `zoomToFit` in the effect computes a bounding box from un-positioned nodes → wrong fit.

The `requestAnimationFrame` we removed earlier was actually necessary — it delays `zoomToFit` until after d3's first tick, when nodes have real positions.

## Fix

**Restore `requestAnimationFrame` in the fit effect** — `zoomToFit` must fire after d3 has ticked.

### File: `src/components/GraphView.tsx`

Replace the fit effect (lines 188-203) with:

```tsx
useEffect(() => {
  if (graphData.nodes.length > prevCount.current) {
    if (!pendingPinRef.current) {
      requestAnimationFrame(() => {
        try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
      });
    }
  } else if (prevCount.current !== null && graphData.nodes.length < prevCount.current) {
    requestAnimationFrame(() => {
      try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
    });
  }
  prevCount.current = graphData.nodes.length;
}, [graphData]);
```

**Keep the `onEngineTick`/`onEngineStop` changes** (zoom(k * 1.001)) — these prevent the library from auto-zooming on future data changes, so our zoomToFit is the only zoom call.

## Why This Works

| Step | Timing | What happens |
|------|--------|-------------|
| Data changes | React commit | Library `onFinishUpdate` fires (auto-zoom, but condition broken after initial fit) |
| React effects | Commit phase | Fit effect fires, schedules `requestAnimationFrame` |
| Browser paints | After commit | Canvas renders |
| rAF callback | Next frame | d3 has ticked, nodes have real positions → `zoomToFit(400, 100)` computes correct bounding box |

## Files Changed

| File | Change |
|------|--------|
| `src/components/GraphView.tsx` | Restore `requestAnimationFrame` wrapper in fit effect |
