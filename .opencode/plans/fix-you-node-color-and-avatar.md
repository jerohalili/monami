# Fix: "You" Node Color Inconsistency + Avatar URL Auto-Generator

## Problem 1: Color Inconsistency

The "You" node gets **amber `#fbbf24`** in the graph canvas but a **palette hash color** in the sidebar and connection modal:

| Location | Current Color | Source |
|----------|--------------|--------|
| Graph canvas (`GraphView.tsx:442`) | `#fbbf24` (amber) | Hardcoded `isY ? "#fbbf24" : colorForName(n.name)` |
| DetailsPanel `Avatar` (`DetailsPanel.tsx:24-36`) | `colorForName("You")` | No `isYou` check |
| AddConnectionModal (`AddConnectionModal.tsx:158-167`) | `colorForName(p.name)` | No `isYou` check |

## Problem 2: No Avatar URL Auto-Generation

The "You" node is auto-created with `avatarUrl: null`. All people without a manually-entered `avatarUrl` show as colored initials circles. The user wants a dicebear-based auto-generator: `https://api.dicebear.com/9.x/notionists/svg?seed=${name}&backgroundColor=334155`.

---

## Implementation Plan

### File: `src/lib/model.ts`

**Add two utility functions:**

```ts
/** Color for a node: amber for the "You" node, palette hash for everyone else. */
export function nodeColor(name: string): string {
  return name === "You" ? "#fbbf24" : colorForName(name);
}

/** Auto-generated avatar URL using Dicebear notionists style. */
export function autoAvatarUrl(name: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}&backgroundColor=334155`;
}
```

### File: `src/lib/dto.ts`

**Apply auto-avatar in `personDTO`:** When `avatarUrl` is null, generate one from the person's name.

```ts
avatarUrl: p.avatarUrl ?? autoAvatarUrl(p.name),
```

This ensures every person returned from the API always has an avatar URL, eliminating null-avatar fallback rendering everywhere.

### File: `src/components/DetailsPanel.tsx`

**Update `Avatar` component to use `nodeColor`:** Replace `colorForName(p.name)` with `nodeColor(p.name)` in the fallback circle.

### File: `src/components/AddConnectionModal.tsx`

**Replace `colorForName(p.name)` with `nodeColor(p.name)`** in the inline avatar fallback (line ~162).

### File: `src/components/GraphView.tsx`

**Replace inline `isY ? "#fbbf24" : colorForName(n.name)` with `nodeColor(n.name)`** at line 442. This consolidates the color logic into one place.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/model.ts` | Add `nodeColor()` and `autoAvatarUrl()` |
| `src/lib/dto.ts` | Apply `autoAvatarUrl` when `avatarUrl` is null |
| `src/components/GraphView.tsx` | Use `nodeColor()` instead of inline ternary |
| `src/components/DetailsPanel.tsx` | Use `nodeColor()` in `Avatar` fallback |
| `src/components/AddConnectionModal.tsx` | Use `nodeColor()` in inline avatar fallback |

## Expected Result

- "You" node is amber `#fbbf24` everywhere (canvas, sidebar, connection modal)
- All people get a dicebear avatar automatically when no custom `avatarUrl` is set
- Canvas `paintNode` no longer has inline color logic — uses `nodeColor()` from model.ts
