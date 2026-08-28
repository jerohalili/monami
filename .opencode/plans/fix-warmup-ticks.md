# Fix: zoomToFit Inaccurate Positioning

## Root Cause (Confirmed)

The library's `update()` method (`canvas-force-graph.js:496-555`) runs `warmupTicks` loop (line 550-552) BEFORE calling `onFinishUpdate` (line 555). But `warmupTicks` defaults to **0**, so d3 never positions nodes before the auto-zoom fires. Both the library's auto-zoom AND our `zoomToFit` compute bounding boxes from un-positioned nodes → wrong fit in all directions.

Additionally, the `zoom(k * 1.001)` hack in `onEngineTick`/`onEngineStop` slightly shifts the zoom after the initial fit, breaking accuracy.

## Fix (3 changes)

### 1. Set `warmupTicks={50}` on ForceGraph2D

**File:** `src/components/GraphView.tsx`, ForceGraph2D props

This makes d3 run 50 simulation ticks synchronously during `update()`, BEFORE `onFinishUpdate` fires. Nodes get real positions. The auto-zoom and our `zoomToFit` both compute correct bounding boxes.

### 2. Remove `zoom(k * 1.001)` hack from `onEngineTick`/`onEngineStop`

**File:** `src/components/GraphView.tsx`, lines 618-641

No longer needed. With `warmupTicks=50`, `onFinishUpdate` fires with correctly positioned nodes. The auto-zoom formula `4/cbrt(N)` produces a reasonable zoom, and our `zoomToFit` overrides it with the exact bounding box.

### 3. Keep `requestAnimationFrame` in fit effect

**File:** `src/components/GraphView.tsx`, fit effect

Still necessary — ensures `zoomToFit` fires after the browser paints and d3 has settled.

## Files Changed

| File | Change |
|------|--------|
| `src/components/GraphView.tsx` | Add `warmupTicks={50}` prop. Remove `zoom(k*1.001)` from onEngineTick/onEngineStop. Keep requestAnimationFrame in fit effect. |
