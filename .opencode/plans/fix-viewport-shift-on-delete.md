# Fix: Viewport / Camera Shift on Node Deletion

## Root Cause

The library's `onFinishUpdate` callback (force-graph.js:509-517) auto-zooms the camera on every data change when the user hasn't manually zoomed:

```js
.onFinishUpdate(() => {
  if (d3ZoomTransform(state.canvas).k === state.lastSetZoom && state.graphData.nodes.length) {
    state.zoom.scaleTo(state.zoom.__baseElem,
      state.lastSetZoom = ZOOM2NODES_FACTOR / Math.cbrt(state.graphData.nodes.length)
    );
  }
});
```

Formula: `zoom = 4 / Math.cbrt(nodeCount)`. Deleting a node changes `nodeCount`, which changes the zoom level. Since `lastSetZoom` is initialized to `1` and updated to the auto-calculated value, the condition matches on every data change until the user manually zooms.

**Our existing code does NOT call `zoomToFit` on deletion** — the camera shift is entirely caused by this internal library behavior.

## Solution

Capture the camera state (center + zoom) before deletion, then force-restore it after the library processes the change. The library's auto-zoom is synchronous during the kapsule data update, so restoring in a React effect (after commit) overrides it.

## Files to Modify

### 1. `src/components/GraphView.tsx`

**Add ref for pending camera restore:**
```ts
const pendingCameraRestore = useRef<{ cx: number; cy: number; k: number } | null>(null);
```

**Add effect to restore camera after data change:**
```ts
useEffect(() => {
  const restore = pendingCameraRestore.current;
  if (!restore || !fgRef.current) return;
  pendingCameraRestore.current = null;
  // Double-rAF: first frame lets the library finish processing the data change
  // (including its auto-zoom), second frame ensures the canvas has re-rendered.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const g = fgRef.current;
      if (!g) return;
      g.centerAt(restore.cx, restore.cy, 0);
      g.zoom(restore.k, 0);
    });
  });
}, [graphData]);
```

**Expose `saveCamera` / `restoreCamera` via `apiRef`:**
```ts
apiRef.current = {
  zoomIn: ...,
  zoomOut: ...,
  fit: ...,
  saveCamera: () => {
    const g = fgRef.current;
    if (!g) return;
    pendingCameraRestore.current = { cx: g.centerAt().x, cy: g.centerAt().y, k: g.zoom() };
  },
  restoreCamera: () => {
    const restore = pendingCameraRestore.current;
    if (!restore || !fgRef.current) return;
    pendingCameraRestore.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const g = fgRef.current;
        if (!g) return;
        g.centerAt(restore.cx, restore.cy, 0);
        g.zoom(restore.k, 0);
      });
    });
  },
};
```

### 2. `src/components/NetworkApp.tsx`

**Update `GraphApi` type** (imported from GraphView) to include `saveCamera` and `restoreCamera`.

**Call `saveCamera` before deletion, `restoreCamera` after data refresh:**

In DetailsPanel's person delete handler (line 418-423):
```tsx
onDelete={async () => {
  if (!(await confirm(`Remove ${person.name} and all their connections?`))) return;
  apiRef.current?.saveCamera();        // <-- ADD
  await fetch(`/api/people/${person.id}`, { method: "DELETE" });
  onClearedSelection();
  await onChanged();
  apiRef.current?.restoreCamera();     // <-- ADD
}}
```

In DetailsPanel's edge delete handlers (lines 371-377 and 299-305):
```tsx
// Before DELETE fetch:
apiRef.current?.saveCamera();
// After onChanged():
apiRef.current?.restoreCamera();
```

**Problem:** `apiRef` lives in NetworkApp, but the delete handlers are inside DetailsPanel. DetailsPanel doesn't have access to `apiRef`.

**Solution:** Pass `apiRef` to DetailsPanel as a prop, OR move the save/restore logic into NetworkApp's `onChanged` wrapper.

**Cleaner approach — wrap `onChanged` in NetworkApp:**
```tsx
const wrapOnChanged = useCallback(async () => {
  apiRef.current?.saveCamera();
  await load();
  apiRef.current?.restoreCamera();
}, [load]);
```

Then pass `wrapOnChanged` as `onChanged` to DetailsPanel. This way every data refresh (including deletion) automatically saves/restores camera.

**But this would also restore camera on non-deletion changes (edits, adds).** For adds, the fit-on-add logic in GraphView already handles camera. So restoring camera after an add would fight with the fit logic.

**Better approach — only save/restore on deletion, not all changes:**

Pass `saveCamera` and `restoreCamera` as separate props to DetailsPanel:

```tsx
<DetailsPanel
  ...
  onSaveCamera={() => apiRef.current?.saveCamera()}
  onRestoreCamera={() => apiRef.current?.restoreCamera()}
/>
```

DetailsPanel calls `onSaveCamera()` before DELETE fetch and `onRestoreCamera()` after `onChanged()`.

### 3. `src/components/DetailsPanel.tsx`

**Add props:**
```ts
onSaveCamera?: () => void;
onRestoreCamera?: () => void;
```

**Person delete handler (line 418-423):**
```tsx
onDelete={async () => {
  if (!(await confirm(`Remove ${person.name} and all their connections?`))) return;
  onSaveCamera?.();
  await fetch(`/api/people/${person.id}`, { method: "DELETE" });
  onClearedSelection();
  await onChanged();
  onRestoreCamera?.();
}}
```

**Edge delete handlers (lines 371-377 and 299-305):**
```tsx
onSaveCamera?.();
await fetch(`/api/edges/${edge.id}`, { method: "DELETE" });
await onChanged();
onRestoreCamera?.();
```

## Summary of All Changes

| File | Change |
|------|--------|
| `GraphView.tsx` | Add `pendingCameraRestore` ref, camera restore effect, `saveCamera`/`restoreCamera` methods on apiRef |
| `NetworkApp.tsx` | Pass `onSaveCamera`/`onRestoreCamera` props to DetailsPanel |
| `DetailsPanel.tsx` | Accept new props, call save before DELETE and restore after onChanged |

## Expected Behavior

| Scenario | Before | After |
|----------|--------|-------|
| Delete node | Viewport jumps (library auto-zoom recalculates) | Viewport stays exactly where it was |
| Delete edge | Viewport jumps (same auto-zoom) | Viewport stays exactly where it was |
| Add node | Fit-on-add works correctly | Unchanged (no save/restore on add) |
| Edit node | No camera change | Unchanged |
| Manual "Fit view" button | Works correctly | Unchanged |
