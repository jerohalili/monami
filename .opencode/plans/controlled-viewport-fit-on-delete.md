# Fix: Controlled Viewport Transitions on Delete

## Current State vs. User's Architecture

### What's Already Correct
1. **`lid()` function** (line 41-43): Already handles both string IDs and object references correctly — no change needed.
2. **Link garbage collection** (lines 180-184): Uses composite key `"sourceId->targetId"` (always strings), not the d3-mutated `source`/`target`. Orphaned links are properly cleaned up.
3. **Prisma cascade deletes**: Edges are removed from the DB when a person is deleted, so `data.edges` never contains orphaned references.
4. **Link signature computation**: Uses `lid()` consistently at both line 203 (memo) and line 310 (effect), so signatures are stable regardless of d3-force mutation.

### What Needs to Change
The user proposes replacing the save/restore camera mechanism with controlled `zoomToFit(400, padding)` transitions. Currently:
- `saveCamera()` / `restoreCamera()` fight the library's auto-zoom with a double-rAF hack
- This causes unpredictable viewport shifts because the restore happens at the wrong time relative to the library's own processing
- The user's approach is cleaner: let the library settle, then smoothly animate to the correct view

---

## Implementation Plan

### File: `src/components/GraphView.tsx`

#### Change 1: Remove `pendingCameraRestore` ref
**Line 91** — delete the ref declaration.

#### Change 2: Remove `saveCamera` / `restoreCamera` from `GraphApi` and `apiRef`
**Lines 28-29** — remove from interface.
**Lines 115-139** — remove the `saveCamera` and `restoreCamera` methods from the apiRef effect.

#### Change 3: Remove the camera restore effect
**Lines 248-263** — delete the entire `useEffect` that restores camera on `graphData` change.

#### Change 4: Add deletion-aware `zoomToFit` in the existing fit effect
**Lines 215-229** — extend the existing fit effect to also handle deletions:

```tsx
useEffect(() => {
  const prevLen = prevCount.current;
  if (graphData.nodes.length > prevLen) {
    // Node added — fit after physics settles (skip if user click-placed)
    const t = setTimeout(() => {
      if (pendingPinRef.current) return;
      try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
    }, 250);
    prevCount.current = graphData.nodes.length;
    return () => clearTimeout(t);
  } else if (graphData.nodes.length < prevLen) {
    // Node deleted — smooth animated reframe over 400ms.
    // The library's onFinishUpdate auto-zoom fires first (based on node count
    // formula), then this zoomToFit overrides it with a bounding-box-based
    // fit that produces the correct final viewport.
    const t = setTimeout(() => {
      try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
    }, 50);
    prevCount.current = graphData.nodes.length;
    return () => clearTimeout(t);
  }
  prevCount.current = graphData.nodes.length;
}, [graphData]);
```

The 50ms delay ensures the library's `onFinishUpdate` auto-zoom has fired and the simulation has ticked at least once, so `zoomToFit` computes the correct bounding box from the updated node positions.

#### Change 5: Update delete handlers in DetailsPanel
**File:** `src/components/DetailsPanel.tsx`

Remove `onSaveCamera` / `onRestoreCamera` from:
- Props interface (lines 348-349)
- EdgeView delete handler (lines 381, 384)
- PersonView delete handler (lines 428, 432)
- RelationshipEditor props (lines 280-281)
- RelationshipEditor remove function (lines 305, 307)
- RelationshipEditor usage (line 368)

#### Change 6: Update NetworkApp.tsx
**File:** `src/components/NetworkApp.tsx`

Remove `onSaveCamera` / `onRestoreCamera` props from DetailsPanel usage (lines 245-246).

---

## Summary of All Changes

| File | Action |
|------|--------|
| `GraphView.tsx` | Remove `pendingCameraRestore` ref, `saveCamera`/`restoreCamera` from interface + apiRef, camera restore effect. Add deletion `zoomToFit` to fit effect. |
| `DetailsPanel.tsx` | Remove `onSaveCamera`/`onRestoreCamera` props from function signature, delete handlers, and RelationshipEditor. |
| `NetworkApp.tsx` | Remove `onSaveCamera`/`onRestoreCamera` from DetailsPanel props. |

## Expected Behavior

| Scenario | Before | After |
|----------|--------|-------|
| Delete node | Viewport jumps unpredictably (save/restore fights auto-zoom) | Smooth 400ms animated reframe to bounding box of remaining nodes |
| Delete edge | Same jump | Same smooth reframe |
| Add node | Smooth 400ms fit (unchanged) | Unchanged |
| Manual "Fit view" | Works correctly | Unchanged |
