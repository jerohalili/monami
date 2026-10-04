# AI-USAGE — MonAmi

Started week 1, kept alongside work. Full 6 + 3 + who-wrote-what for finals badge; this is the current log.

## 1. How I used AI

- 2026-08-26, Claude — Prisma models (`User`, `Person`, `Edge` with origin/strength/unique pair) + Next.js shell. Kept graph-first model. Commits [`a031755`](https://github.com/jerohalili/monami/commit/a031755436f0c7686f637fe7f6dc2c91105889f8) / [`7eaf670`](https://github.com/jerohalili/monami/commit/7eaf67000fb736d6f9ef63202c48174e011d12d8).
- 2026-08-27, Copilot — NextAuth v5 wiring + `requireUserId()` guard (`lib/auth.ts`, `auth-guard.ts`). Kept JWT strategy, re-landed after rollback. Commits [`8bd321f`](https://github.com/jerohalili/monami/commit/8bd321f21462bc4403733a9f70412437fb16a42d) → [`e05cfb9`](https://github.com/jerohalili/monami/commit/e05cfb937e7f21dc14ea62e9ad5a642b772ce564) → [`5005c59`](https://github.com/jerohalili/monami/commit/5005c59e657447d99873fc68f83c66ca9df756ce).
- 2026-08-28, Claude — `GraphView.tsx` physics (center on `You`, gentle reheat) + node painting. Kept, tuned over 8 add/delete iterations. Commits [`df1f6d9`](https://github.com/jerohalili/monami/commit/df1f6d9e6642486d8ad6668144250926c9c9ae49), [`a64d0e3`](https://github.com/jerohalili/monami/commit/a64d0e354ab72edf863e8bcfe30f79f209c4b035).
- 2026-08-30, Claude — GitHub sync routes (`sync-profile`, `sync-connections` + cross-edges, `sync-indirect`). Kept filters + rate-limit guards. Commits [`5149ca0`](https://github.com/jerohalili/monami/commit/5149ca08d4abd21904aeda884f4ecebfbbe988de), [`4f7dbe6`](https://github.com/jerohalili/monami/commit/4f7dbe6787291b63ca7ac8064363b76c325f9f72), [`aacddfb`](https://github.com/jerohalili/monami/commit/aacddfb81c430aeb6dc5846f2eedffce0b1ef4a2).
- 2026-09-02, Copilot — people + repo recommenders (`recommendations/route.ts`, `github/recommendations`, `lib/skills.ts`). Kept scoring, rebalanced after mutual-overweight. Commits [`8bac171`](https://github.com/jerohalili/monami/commit/8bac171fac1651d73eba36cd949c2147e6ee13e4), [`bdba6ff`](https://github.com/jerohalili/monami/commit/bdba6ff7488dbd57898fc01317ada3c6ef1d8212), [`a9bad81`](https://github.com/jerohalili/monami/commit/a9bad813ce4a5ecedc30be5fe1146eb072ec67ec).
- 2026-09-19, Claude — README §§1–7 + SECURITY-CHECKLIST wording. Kept structure, evidence in own words. Commit [`2c3f4fb`](https://github.com/jerohalili/monami/commit/2c3f4fb06425084f287a67a81c5fce08d84cf477).
- 2026-09-20–26 (Week 5) — no new AI prompts logged. Screenshots + caption cleanup + portfolio case-study assembly done by hand; no code changes.

## 2. Where the AI got it wrong

- Landed [`8bd321f`](https://github.com/jerohalili/monami/commit/8bd321f21462bc4403733a9f70412437fb16a42d) (1285+ lines) and broke the build same day; fixed with full rollback [`e05cfb9`](https://github.com/jerohalili/monami/commit/e05cfb937e7f21dc14ea62e9ad5a642b772ce564) and careful re-land. Week 1.
- Edge middleware blew the 1MB limit on default edge runtime; fixed with one line `runtime="nodejs"` ([`025c7d9`](https://github.com/jerohalili/monami/commit/025c7d99d188db01aee0e3974af5a98a57771bb2)). Week 2.
- Recommender over-ranked mutual follows over skill/company signals; rebalanced weights in [`bdba6ff`](https://github.com/jerohalili/monami/commit/bdba6ff7488dbd57898fc01317ada3c6ef1d8212). Week 2.

## 3. Who wrote what

- I wrote: graph data model + unique edge-pair constraint (`prisma/schema.prisma`, commit [`a031755`](https://github.com/jerohalili/monami/commit/a031755436f0c7686f637fe7f6dc2c91105889f8)), `requireUserId()` scoping (`id+userId`, `source:{userId}`) across `people/edges/account/graph` (commit [`5005c59`](https://github.com/jerohalili/monami/commit/5005c59e657447d99873fc68f83c66ca9df756ce)), canvas link painting — origin color + strength dash/double (commit [`a64d0e3`](https://github.com/jerohalili/monami/commit/a64d0e354ab72edf863e8bcfe30f79f209c4b035)), sync cross-edge creation (commit [`5149ca0`](https://github.com/jerohalili/monami/commit/5149ca08d4abd21904aeda884f4ecebfbbe988de)).
- Best-understood AI piece: `src/middleware.ts` + route-level 401 pattern — middleware passes `/api/*` through deliberately so each route returns its own 401; I kept it because edge-safe auth + fine-grained errors beat a blanket redirect.
