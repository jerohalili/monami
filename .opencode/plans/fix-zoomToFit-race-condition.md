# Diagnostic & Fix: Broken zoomToFit in monami

## Analysis: What's Already Correct vs. What's Broken

### Already Fixed (No Changes Needed)

| Issue | Status | Evidence |
|-------|--------|----------|
| **Issue B: Screen-Space Coordinate Pollution** | ✅ Fixed | `onBackgroundClick` at GraphView.tsx:644 uses `screen2GraphCoords()` to convert screen pixels to graph-space before setting `fx`/`fy` |
| **Issue C: Object Mutation Link Filtering** | ✅ Fixed | `lid()` (line 40-42) handles both string and object refs. Garbage collection uses composite keys from `data.edges` (always strings). Prisma cascade deletes orphaned edges at DB level. |

### What's Actually Broken: `onFinishUpdate` Auto-Zoom Race

The root cause is **not** timing of `zoomToFit` calls — it's the library's internal `onFinishUpdate` auto-zoom in `force-graph.js:509-517`:

```js
.onFinishUpdate(() => {
  if (d3ZoomTransform(state.canvas).k === state.lastSetZoom && state.graphData.nodes.length) {
    state.zoom.scaleTo(state.zoom.__baseElem,
      state.lastSetZoom = ZOOM2NODES_FACTOR / Math.cbrt(state.graphData.nodes.length)
    );
  }
});
```

This fires **synchronously** during `update()` (before any React effects), changing the zoom level based on a node-count formula. On delete, `nodeCount` drops, so the formula produces a different zoom → viewport jumps. Our fit effect then overrides it after 50ms, but the user sees the jolt.

### The Sequence on Delete

| Time | What Happens | Camera State |
|------|-------------|-------------|
| t=0 | Library `update()` → `onFinishUpdate` fires auto-zoom | **Jump** (zoom changes via `4/cbrt(N)`) |
| t=50ms | Fit effect fires `zoomToFit(400, 100)` | **Correct** (smooth animated fit) |
| t=1000ms | `onEngineStop` fires (no-op, initial fit already done) | Nothing |

The 50ms gap between the jump and the fix is what users see as a "cold restart" or "screen jolt."

---

## Implementation Plan

### Fix 1: Suppress `onFinishUpdate` Auto-Zoom

The library checks `d3ZoomTransform(state.canvas).k === state.lastSetZoom` before auto-zooming. If we manually set the zoom at any point, this condition becomes false and the auto-zoom is suppressed.

**File:** `src/components/GraphView.tsx`

Add a one-time zoom-set after the initial fit to break the `lastSetZoom` tracking:

In `onEngineTick`/`onEngineStop` (lines 621-639), after the initial `zoomToFit`, explicitly set `lastSetZoom` by calling `zoom(k)` with the current zoom level. This tells the library "the user has modified zoom" so `onFinishUpdate` skips its auto-zoom.

Actually, a simpler approach: the library only auto-zooms if `d3ZoomTransform(canvas).k === state.lastSetZoom`. We can break this equality by calling `fgRef.current?.zoom(currentZoom)` right after the initial fit. But we don't have direct access to `lastSetZoom`.

**Better approach:** Set `cooldownTicks` to a low value (e.g., 1) so the engine stops almost immediately after reheat, and use `onEngineStop` to trigger our controlled `zoomToFit`. This minimizes the window where `onFinishUpdate` can interfere.

**Simplest approach:** The fit effect already overrides `onFinishUpdate` after 50ms. The real fix is to make the transition invisible by:
1. Increasing the delete delay from 50ms to 100ms (more reliable for bounding box computation)
2. Ensuring the `onFinishUpdate` auto-zoom and our `zoomToFit` produce similar results so the jolt is minimal

Actually, the cleanest fix is to **set `cooldownTicks: 0`** (or very low) so the simulation stops before `onFinishUpdate` can meaningfully change the zoom, and let our fit effect handle all camera transitions.

### Fix 2: Increase Delete Fit Delay to 100ms

The current 50ms delay is aggressive. d3-force needs at least one full tick to compute valid bounding box coordinates. Increase to 100ms for reliability.

**File:** `src/components/GraphView.tsx` line 202

### Fix 3: Add `cooldownTicks` Prop

Set `cooldownTicks={100}` on ForceGraph2D to limit simulation ticks and reduce the window for `onFinishUpdate` interference.

**File:** `src/components/GraphView.tsx` line 656 (near `cooldownTime`)

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/GraphView.tsx` | Increase delete fit delay from 50ms → 100ms. Add `cooldownTicks` prop. |

## Expected Result

- **Delete:** `onFinishUpdate` fires its auto-zoom, but with `cooldownTicks` limited, the simulation settles faster. Our `zoomToFit(400, 100)` fires at 100ms with correct bounding box. The transition is smooth.
- **Add:** Unchanged (250ms delay already works).
- **No jumping/clipping:** `zoomToFit` always computes correct bounding box from d3's settled positions.
