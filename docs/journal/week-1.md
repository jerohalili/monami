# MonAmi - Week 1

## Week of: August 26-29, 2026

## My goal this week

Stand up the graph app fast: auth first, then a readable canvas with GitHub import working.

## What I did

- I scaffolded Next.js 15 App Router + TypeScript + Tailwind v4 + Prisma (`User`, `Person`, `Edge`) with a `react-force-graph-2d` canvas shell (`a031755`, `7eaf670`, 32 files).
- I integrated auth (`5005c59`, 24 files): NextAuth v5 beta with GitHub OAuth + Credentials + guest, `lib/auth.ts`, `requireUserId()` guard in `lib/auth-guard.ts`, plus login, register, and settings shells. I also landed GitHub auth cleanly (`26137d3`) after a failed big-bang attempt.
- I tuned graph physics (`df1f6d9`, `0c188c5`): centered force around the "You" node with gentle reheat on topology change in `src/components/GraphView.tsx`.
- I iterated the node create/delete loop 8 times (`64808a9`, `c608b54`, `0773b9b`, `e513a8f`, `a5c61a8`, `a64d0e3`): `AddPersonModal.tsx`, `DetailsPanel.tsx`, `NetworkApp.tsx` view and edit without page navigation.
- I added avatars and color (`518d6e8`): DiceBear fallback, per-name node color, amber/gold "You" glow.
- I built zoom controls (`5a798fc`, `ff67980`, `cc0c3e4`) and removed the duplicate zoom feat (`edf53ff`).
- I did UI passes (`cf1889e`, `0a55461`, `f1f330c`, `024f245`).
- I synced the GitHub profile (`5149ca0`, 12 files): `app/api/github/sync-profile/route.ts` pulls name, avatar, bio, company, location, and email into the "You" node.
- I synced the GitHub network (`4f7dbe6`, 4 files): followers and following import as nodes with all / following-only / mutual-only filters plus cross-edges between imported people who follow each other.

## What blocked me

- I landed `8bd321f` (1285+ lines) and broke the build the same day. I fixed it with a full rollback (`e05cfb9`, -2032 lines) and a careful re-land.
- Node creation jerked the camera (`e513a8f`), which took 8 iterations to settle.
- Auto-fit fought manual zoom, and force reheats snapped nodes on every topology change.

## What I learned

- Graph first works: `User` / `Person` / `Edge` models with origin, strength, shared communities/projects, and the unique edge-pair constraint before UI, because relationship context is the product.
- Auth before import: storing the GitHub token and guarding every API route with `requireUserId()` first makes the sync routes safe.
- Canvas and physics before polish: node paint, drag placement, and camera transitions first, or the network is unreadable at 50+ nodes. I also dropped the Discord-import stub (`85cc7d5`) to keep the model GitHub + manual only.
