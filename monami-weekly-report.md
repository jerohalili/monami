# MonAmi Weekly Increment Report

Project: MonAmi — Interactive Networking Constellation
Repo: https://github.com/jerohalili/monami
Live: https://monami-one.vercel.app/
Status: Feature-complete, polish / pre-final mode.


---

## Week 1 — August 26-29, 2026: init + auth + graph + GitHub sync (26 commits)

### What changed this week

#### Base + auth

- Initial skeleton (`a031755 Initial commit`, `7eaf670 chore: initial commit` — 32 files, 6058 insertions): Next.js 15 App Router + TypeScript + Tailwind v4 + Prisma (`User`, `Person`, `Edge`) + `react-force-graph-2d` canvas shell.
- Auth integration (`5005c59 feat: auth integration` — 24 files, 895+/474-): NextAuth v5 beta (GitHub OAuth + Credentials + guest), `lib/auth.ts`, `requireUserId()` guard in `lib/auth-guard.ts`, login/register/settings shells.
- Auth + GitHub attempt then rollback (`8bd321f feat: auth and github integration` — 1285+, `e05cfb9 chore: rollback integrations` — 2032 deletions across 36 files): landed too much at once, reverted, then re-landed cleanly via `5005c59` + `26137d3 feat: github auth`.
- Cleanup (`85cc7d5 fix: remove discord and clean up`): dropped Discord-import stub to keep the graph model GitHub + manual only.

#### Graph visualization + node UX

- Physics tuning (`df1f6d9 fix: graph attraction and jolting`, `0c188c5 fix: initial physics`): centered force around the "You" node, gentle reheat on topology change in `src/components/GraphView.tsx`.
- Node create/delete loop (8 fixes Aug 28: `64808a9`, `c608b54`, `0773b9b`, `e513a8f fix: attempt fix on screen sudden panning`, `a5c61a8 fix: complete fix UX adding node`, `a64d0e3 fix: semi final add and delete node UX`): `AddPersonModal.tsx`, `DetailsPanel.tsx`, `NetworkApp.tsx` view/edit without page navigation.
- Avatars + color (`518d6e8 feat: add avatar url and color consistency` — 8 files): DiceBear fallback, per-name node color, amber/gold "You" glow.
- Zoom controls (`5a798fc fix: auto zoom to fit`, `ff67980 fix: working zooms`, `cc0c3e4 fix: better initial start and fix zoomfit`, `edf53ff fix: remove redundant feat zoom`): zoom in/out/fit in `GraphView.tsx`, removed duplicate zoom feat.
- UI passes (`cf1889e feat: better UI and UX`, `0a55461 feat: better UX to add and performance`, `f1f330c feat: better UI`, `024f245 fix: polished and better performance`).

#### GitHub integration

- Profile sync (`5149ca0 feat: github profile integration` — 12 files, 524+): `app/api/github/sync-profile/route.ts` pulls name/avatar/bio/company/location/email into the "You" node.
- Network sync (`4f7dbe6 feat: github network sync` — 4 files, 317+): followers/following import as nodes with filters (all / following-only / mutual-only) plus cross-edges between imported people who follow each other.

### Why

- I went graph-first: I designed the `User` / `Person` / `Edge` Prisma models with origin, strength, shared communities/projects, and the unique edge-pair constraint before any UI, because for me relationship context is the product.
- I put auth before import: I stored the GitHub OAuth token and enforced `requireUserId()` on every API route first, so my profile/sync routes could run safely.
- I put canvas + physics before polish: I tuned node paint (avatars, labels, origin-colored links), drag placement, and camera transitions first, because I knew the network would feel unreadable at 50+ nodes otherwise.

### What broke or what I got stuck on

- **Land-then-revert:** I landed `8bd321f` (1285+) and broke the build the same day; I fixed it with a full rollback `e05cfb9` (-2032) and a careful re-land (`5005c59`, `26137d3`).
- **Screen panning on node add:** my node creation jerked the camera (`e513a8f`, `GraphView.tsx`); I needed 8 iterations (`64808a9` through `a64d0e3`) to settle add/delete UX.
- **Zoom thrash:** my auto-fit fought manual zoom (`5a798fc`, `ff67980`, `cc0c3e4`, then I deleted the redundant zoom feat in `edf53ff`).
- **Graph jolt:** my force reheats snapped nodes on every topology change (`df1f6d9 fix: graph attraction and jolting`, `0c188c5`).

### What is left

- I still had to build mobile layout, Neon deploy + account management, recommenders, and deploy fixes (I did them in Week 2), then lock the design system (I did it in Week 3).


---

## Week 2 — August 30 - September 5, 2026: mobile + persistence + recommenders (27 commits)

### What changed this week

#### Mobile + deploy

- Mobile friendly (`808be41 feat: mobile friendly` — 7 files, `dad0b83 fix: header panels mobile friendly` — 5 files, `1a89230 fix: better UX` — 8 files, 807+/145-): DetailsPanel becomes a bottom-sheet overlay, overflow menu, graph pan/fit on small screens.
- Neon DB + account management (`b31eb48 feat: neon db and account management` — 14 files, 561+): Neon Postgres + Prisma push, `app/settings/page.tsx` (+333: view account, change email/password, link/unlink GitHub, cascade delete), `app/api/account/route.ts` (+105), `app/api/account/github/route.ts` (+45).
- Cleanup + deploy (`c4e1e3c feat: clean up` — 49 deletions, `befc7f9 fix: clean and deploy` — 14 files, 444 deletions, `025c7d9 fix: switch middleware to nodejs runtime to fix 1MB edge limit` — `src/middleware.ts:4` `export const runtime = "nodejs"`).
- Tab identity (`fa6538b feat: tab logo and name`, `17501bf fix: favicon`).

#### Network expansion

- `aacddfb feat: network expansion` (6 files, 641+): new `app/api/github/sync-indirect/route.ts` (+273) for second-degree discovery (followers/following of direct connections), `lib/github.ts` (+59) helpers, cross-edge creation in `sync-connections/route.ts` (+120), `scripts/cleanup-indirect.ts` (+49).

#### Graph interaction fixes

- Node/edge hitbox + placement (`eca0c83 fix: node place bug`, `c3d8b0e fix: edge placement jolt`, `5811bc7 fix: edge UX`, `27842c3 fix: edge delete UX`, `df12504 fix: node and edge hitbox`, `8ce5744 fix: better selection UX`): canvas hit areas, dashed-weak / solid-normal / double-strong link painting, custom confirm dialog replacing `window.confirm`.
- Sidebar + polish (`ec7ecd6 fix: sidebar covered`, `e532901 fix: bugs and better experience` — `GraphView.tsx` +47, `a69f6be fix: update readme`).

#### Recommender system

- People recommender v1 (`8bac171 feat: better highlight and people recommender implementation` — 5 files, 597+/137-: new `app/api/recommendations/route.ts` (+257), `DiscoverView.tsx` rework +416, `lib/model.ts` +23): scores by shared contributors, mutual follows, skills/interests overlap, company/location match, with reasons + expandable breakdown + pre-filled Add form.
- Expansion (`215cdce feat: expanded people recommender system` — 4 files, 169+/48-).
- Skill extraction (`b70f1bd feat: incomplete skill extraction functionality` — 5 files, 476+/70-, `6dae967 fix: complete skill extraction and people recommender` — 30+/92-): `lib/skills.ts` repo-language to skill mapping feeding people scores.
- Repo recommender (`a9bad81 feat: complete repo recommender` — 4 files, 408+/59-: `app/api/github/recommendations/route.ts` +185, `DiscoverView.tsx` +250): Recommended (starred-by-connections, `connections x 2 + language match x 3`), Starred, Your Repos sub-tabs with search + empty/loading/error states.
- Algo tuning (`bdba6ff fix: better algo for people recommender` — 3 files, 239+/187-, `597775e fix: people recommender improvements`): rebalanced weights after early picks over-ranked mutuals.
- Docs (`9b30c3c fix: update readme` — +170/-20): full README with build order, setup, features.

### Why

- I treated recommenders as the payoff for my structured graph: without scored people + repo suggestions, I knew MonAmi would just be a contact viewer. I built skill extraction from GitHub languages so my scores adapt as the network evolves.
- I landed account management + Neon persistence before the final because I wanted guest-to-registered flows and cascade deletes to be real, not mocked.
- I fixed the mobile bottom-sheet + hitboxes because I found the canvas graph unusable on phones without them.

### What broke or what I got stuck on

- **Edge middleware limit:** I blew the 1MB function limit on deploy with the default edge runtime; I fixed it with one line (`025c7d9`, `src/middleware.ts:4`).
- **Deploy leftovers:** I deleted 444 lines of my own local-only paths in `befc7f9` the same week as my Neon switch: the same class of mistake as my EasyDev Vercel loop, which I caught faster here.
- **Edge placement jolt:** my new edges snapped the graph (`c3d8b0e`, `5811bc7`, `GraphView.tsx`); my node-place bug (`eca0c83`) and tiny hitboxes (`df12504`) made connecting nodes fiddly until I tuned them together.
- **Sidebar covering graph:** my detail panel occluded nodes on narrow layouts (`ec7ecd6`); I needed a separate mobile pass for my header panels (`dad0b83`).
- **Recommender overweighting:** my early algo over-ranked mutual follows over skill/company signals; I rebalanced it in `bdba6ff` (`app/api/recommendations/route.ts`).

### What is left

- I still had to lock the design system to stop my per-component CSS drift (I did it in Week 3), then polish messages/explanations (I did it in Week 4).


---

## Week 3 — September 6-12, 2026: design system (3 commits)

### What changed this week

- `0b8f2e4 feat: design system` — new `DESIGN-SYSTEM.html` (+923 lines): tokens (`--bg-main`, `--text-primary`, `--primary-accent`), `data-theme` dark/light contract with star-field dark background, app shell, graph legend, cards, badges, buttons, focus ring, animations.
- `8652e7e feat: update design system` (34+/24-) — condensed verbose sections into compact code blocks.
- `b3b9c99 fix: settings background inconsistency` — 1-line `src/app/globals.css` fix so Settings respects the theme contract.

### Why

- After two weeks of my own per-component graph/sidebar/mobile fixes, I needed one file to lock spacing, theme, and component states so I could check every screen (graph, Discover, settings) against a single contract before the final.

### What broke or what I got stuck on

- First spec ran long; I cut 24 lines in 8652e7e the same week.
- I let my Settings page drift off-theme (`b3b9c99`) — exactly the kind of drift I built the spec to prevent.

### What is left

- I still had to polish messages/explanations across my API + UI (I did it in Week 4), then verify prod.


---

## Week 4 — September 13-19, 2026: consistency + messages (2 commits)

### What changed this week

- `20561a1 fix: design system consistency` — `DESIGN-SYSTEM.html` (18+/1-): token and component-state wording aligned with `src/app/globals.css`.
- `dd98ab4 fix: better messages and explanations` (266+/314-, 41 files): rewrote user-facing copy and server error strings across all API routes (`people`, `edges`, `graph`, `github/*`, `recommendations`, `account`, `auth/*`), plus `DetailsPanel.tsx`, `DiscoverView.tsx`, `GraphView.tsx` (-131/+~50 net: removed dead canvas code while clarifying labels), `NetworkApp.tsx` (-101 net), `lib/dto.ts`, `lib/github.ts`, `lib/model.ts`, `lib/skills.ts`; added `src/types/d3-force-3d.d.ts` typing shim.

### Why

- I validate auth via `requireUserId()` on every API route and check `res.ok` before parsing on every fetch — but I knew my terse/generic errors read as unfinished. In this pass I gave each failure a human explanation with toast feedback, matching what I promised in my Week 2 README about resilient handling.
- I slimmed ~314 lines of my own dead comments and duplicated canvas logic so my codebase reads as one style before the final.

### What broke or what I got stuck on

- Small pass on purpose. Touching 41 files risks regressions, so a clean build + typecheck + graph smoke (add person/edge, sync, Discover) is still needed.

### What is left

- Left to check on monami-one: GitHub link/unlink and cascade delete on prod, plus a last responsive pass. Nothing blocking.
