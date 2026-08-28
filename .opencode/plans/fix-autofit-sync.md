# Fix: Auto-Fit Off-Center (Final)

## Evidence

The user confirms:
- Manual fit button (`zoomToFit(400, 90)`) always works correctly
- Auto-fit after place/delete is always off-center

## Root Cause

The manual fit button calls `zoomToFit` **synchronously** — the graph has already rendered and d3 has positioned nodes. Our auto-fit wraps `zoomToFit` in `requestAnimationFrame`, which fires **before** the library's canvas has finished rendering the new data. The bounding box is computed from partially-rendered positions → off-center fit.

## Fix

**Remove `requestAnimationFrame` from the fit effect.** Call `zoomToFit` directly — same mechanism as the manual fit button.

### File: `src/components/GraphView.tsx`

Replace the fit effect with:

```tsx
useEffect(() => {
  if (graphData.nodes.length > prevCount.current) {
    if (!pendingPinRef.current) {
      try { fgRef.current?.zoomToFit(400, 90); } catch { /* noop */ }
    }
  } else if (prevCount.current !== null && graphData.nodes.length < prevCount.current) {
    try { fgRef.current?.zoomToFit(400, 90); } catch { /* noop */ }
  }
  prevCount.current = graphData.nodes.length;
}, [graphData]);
```

Key changes:
- Removed `requestAnimationFrame` wrapper
- Changed padding from `100` to `90` (matches manual button)
- Same duration (`400`) as manual button

## Why This Works

With `warmupTicks={50}`, d3 positions nodes synchronously during the library's `update()` call. By the time React effects run, nodes have real positions. `zoomToFit` computes the correct bounding box — same as when the manual button is clicked.

## Files Changed

| File | Change |
|------|--------|
| `src/components/GraphView.tsx` | Remove requestAnimationFrame from fit effect, change padding to 90 |
