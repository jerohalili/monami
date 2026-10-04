# MonAmi - Week 4

## Week of: September 13-19, 2026

## My goal this week

Make every message human and the codebase one style before the final.

## What I did

- I aligned token and component-state wording between `DESIGN-SYSTEM.html` and `src/app/globals.css` (`20561a1`).
- I rewrote copy and server error strings (`dd98ab4`, 266+/314- across 41 files): all API routes (`people`, `edges`, `graph`, `github/*`, `recommendations`, `account`, `auth/*`) plus `DetailsPanel.tsx`, `DiscoverView.tsx`, `GraphView.tsx`, `NetworkApp.tsx` (about 101 lines net removed), `lib/dto.ts`, `lib/github.ts`, `lib/model.ts`, `lib/skills.ts`. I also added the `src/types/d3-force-3d.d.ts` typing shim and removed dead canvas code.

## What blocked me

- Touching 41 files is risky on purpose. A clean build plus typecheck plus a graph smoke test (add person/edge, sync, Discover) is still needed.

## What I learned

- I already validate auth with `requireUserId()` on every route and check `res.ok` before parsing on every fetch, but terse and generic errors still read as unfinished. Each failure needs a human explanation with toast feedback.
- Slimming ~314 lines of dead comments and duplicated canvas logic was worth it: the codebase finally reads as one style. What is left is checking GitHub link/unlink and cascade delete on monami-one prod, plus a last responsive pass.
