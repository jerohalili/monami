# AI-USAGE — MonAmi

Started week 1, kept alongside work. Full 6 + 3 + who-wrote-what for finals badge; this is the current log.

## 1. How I used AI

- 2026-08-26, Claude — Prisma models (`User`, `Person`, `Edge` with origin/strength/unique pair) + Next.js shell. Kept graph-first model. Commit `a031755` / `7eaf670`.
- 2026-08-27, Copilot — NextAuth v5 wiring + `requireUserId()` guard (`lib/auth.ts`, `auth-guard.ts`). Kept JWT strategy, re-landed after rollback. Commits `8bd321f` → `e05cfb9` → `5005c59`.
- 2026-08-28, Claude — `GraphView.tsx` physics (center on `You`, gentle reheat) + node painting. Kept, tuned over 8 add/delete iterations. Commits `df1f6d9`, `a64d0e3`.
- 2026-08-30, Claude — GitHub sync routes (`sync-profile`, `sync-connections` + cross-edges, `sync-indirect`). Kept filters + rate-limit guards. Commits `5149ca0`, `4f7dbe6`, `aacddfb`.
- 2026-09-02, Copilot — people + repo recommenders (`recommendations/route.ts`, `github/recommendations`, `lib/skills.ts`). Kept scoring, rebalanced after mutual-overweight. Commits `8bac171`, `bdba6ff`, `a9bad81`.
- 2026-09-19, Claude — README §§1–7 + SECURITY-CHECKLIST wording. Kept structure, evidence in own words. Commit (this change).

## 2. Where the AI got it wrong

- Landed `8bd321f` (1285+ lines) and broke the build same day; fixed with full rollback `e05cfb9` and careful re-land. Week 1.
- Edge middleware blew the 1MB limit on default edge runtime; fixed with one line `runtime="nodejs"` (`025c7d9`). Week 2.
- Recommender over-ranked mutual follows over skill/company signals; rebalanced weights in `bdba6ff`. Week 2.

## 3. Who wrote what

- I wrote: graph data model + unique edge-pair constraint (`prisma/schema.prisma`), `requireUserId()` scoping (`id+userId`, `source:{userId}`) across `people/edges/account/graph`, canvas link painting (origin color + strength dash/double), sync cross-edge creation.
- Best-understood AI piece: `src/middleware.ts` + route-level 401 pattern — middleware passes `/api/*` through deliberately so each route returns its own 401; I kept it because edge-safe auth + fine-grained errors beat a blanket redirect.
