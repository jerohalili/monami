# Fix: Auto-Fit After Place and Delete

## Root Cause

The library's `onFinishUpdate` callback (`force-graph.js:509-517`) fires **during React's commit phase** — before our effects run. On every data change, it auto-zooms to `4/cbrt(N)` instantly. Then our fit effect fires and calls `zoomToFit(400, 100)` which animates from that wrong zoom level to the correct one. The user sees a jarring jump.

The fit button works because it calls `zoomToFit` directly — no competing `onFinishUpdate` fires.

## Fix

**Break the `onFinishUpdate` condition after the initial fit** by calling `zoom(currentZoom * 1.001)`. This makes `d3ZoomTransform(canvas).k !== lastSetZoom`, so `onFinishUpdate` never fires again. Our `zoomToFit` becomes the only zoom call.

### File: `src/components/GraphView.tsx`

**Change 1: Break onFinishUpdate after initial fit** (in `onEngineTick`, line 618-621):

```tsx
onEngineTick={() => {
  if (!didMarkEngineReady.current) {
    didMarkEngineReady.current = true;
    setEngineReady(true);
  }
  if (!didInitialFit.current && graphData.nodes.length > 0) {
    didInitialFit.current = true;
    try {
      fgRef.current?.zoomToFit(0, 110);
      // Break onFinishUpdate condition so it never auto-zooms again.
      const k = fgRef.current?.zoom();
      if (k) fgRef.current?.zoom(k * 1.001);
    } catch { /* noop */ }
  }
}}
```

Same change in `onEngineStop` (line 628-631).

**Change 2: Simplify fit effect** (lines 184-203) — remove `requestAnimationFrame`, call `zoomToFit` directly:

```tsx
useEffect(() => {
  if (graphData.nodes.length > prevCount.current) {
    // Skip fit if user click-placed (they positioned it intentionally).
    if (!pendingPinRef.current) {
      try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
    }
  } else if (prevCount.current !== null && graphData.nodes.length < prevCount.current) {
    try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
  }
  prevCount.current = graphData.nodes.length;
}, [graphData]);
```

## Why This Works

| Step | Before (broken) | After (fixed) |
|------|-----------------|---------------|
| Initial fit | `zoomToFit(0, 110)` | `zoomToFit(0, 110)` + `zoom(k * 1.001)` |
| `lastSetZoom` | `4/cbrt(N)` | `4/cbrt(N) * 1.001` (different from auto-zoom) |
| Next data change → `onFinishUpdate` | Fires: `k === lastSetZoom` → auto-zooms | Skipped: `k !== lastSetZoom` |
| Fit effect | Animates from wrong zoom (jolt) | Animates from correct zoom (smooth) |

## Files Changed

| File | Change |
|------|--------|
| `src/components/GraphView.tsx` | Break `onFinishUpdate` condition in `onEngineTick`/`onEngineStop`. Simplify fit effect (remove requestAnimationFrame). |
