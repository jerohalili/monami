# Fix: zoomToFit Reads Invalid Node Coordinates

## Root Cause

The `onFinishUpdate` callback in `force-graph.js:509-517` fires **synchronously** during React's commit phase (inside the library's `update()` at line 555). This happens BEFORE d3-force runs any simulation ticks:

1. Library reheats simulation (`.alpha(1)`) — line 498
2. Warmup ticks (line 550-552) — default `warmupTicks=0`, so **zero ticks**
3. `onFinishUpdate` fires (line 555) — auto-zoom using node-count formula on **initial un-positioned coordinates**
4. React effects run — our `zoomToFit` fires, but d3 hasn't ticked yet, so nodes are at default positions

**Result:** Both auto-zoom and `zoomToFit` compute wrong bounding boxes from nodes clustered near origin. The fit appears broken.

## Fix

**Wrap `zoomToFit` in `requestAnimationFrame`** so it fires after the next d3 simulation tick, when nodes have real positions.

### File: `src/components/GraphView.tsx`

Replace the fit effect (lines 184-201) with:

```tsx
// Fit when new nodes are added or removed.
const prevCount = useRef(graphData.nodes.length);
const didInitialFit = useRef(false);
const didMarkEngineReady = useRef(false);
useEffect(() => {
  if (graphData.nodes.length > prevCount.current) {
    // New node added — skip fit if user click-placed (they positioned it intentionally).
    if (!pendingPinRef.current) {
      requestAnimationFrame(() => {
        try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
      });
    }
  } else if (prevCount.current !== null && graphData.nodes.length < prevCount.current) {
    // Node deleted — wait for d3 to tick so bounding box is valid.
    requestAnimationFrame(() => {
      try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
    });
  }
  prevCount.current = graphData.nodes.length;
}, [graphData]);
```

**Why `requestAnimationFrame`:**
- The library's `update()` reheats the simulation and starts the engine
- On the next animation frame, d3-force runs its first tick, positioning nodes
- Our `requestAnimationFrame` fires AFTER that tick, so `zoomToFit` reads valid (x, y) coordinates
- The `onFinishUpdate` auto-zoom still fires (instant, wrong zoom), but our zoomToFit overrides it with the correct animated fit

## Files Changed

| File | Change |
|------|--------|
| `src/components/GraphView.tsx` | Wrap zoomToFit calls in requestAnimationFrame |
