# MonAmi - Week 2

## Week of: August 30 - September 5, 2026

## My goal this week

Make it usable on phones, persist it on Neon, and turn the graph into something smart with people and repo recommenders.

## What I did

- I made it mobile friendly (`808be41`, `dad0b83`, `1a89230`, 807+/145-): DetailsPanel becomes a bottom-sheet overlay, overflow menu, graph pan and fit on small screens.
- I wired Neon + account management (`b31eb48`, 14 files): Neon Postgres + Prisma push, `app/settings/page.tsx` (+333 with view account, change email/password, link/unlink GitHub, cascade delete), `app/api/account/route.ts` (+105), `app/api/account/github/route.ts` (+45).
- I cleaned up and deployed (`c4e1e3c`, `befc7f9` with 444 deletions, `025c7d9` switching middleware to nodejs runtime in `src/middleware.ts:4`, `fa6538b` + `17501bf` tab logo and favicon).
- I built network expansion (`aacddfb`, 6 files): new `app/api/github/sync-indirect/route.ts` (+273) for second-degree discovery, `lib/github.ts` (+59) helpers, cross-edge creation (+120), `scripts/cleanup-indirect.ts` (+49).
- I fixed graph interaction (`eca0c83`, `c3d8b0e`, `5811bc7`, `27842c3`, `df12504`, `8ce5744`): canvas hit areas, dashed-weak / solid-normal / double-strong link painting, custom confirm dialog replacing `window.confirm`, plus sidebar fixes (`ec7ecd6`, `e532901`).
- I built the people recommender v1 (`8bac171`, 597+/137-: `app/api/recommendations/route.ts` +257, `DiscoverView.tsx` +416, `lib/model.ts` +23) scoring by shared contributors, mutual follows, skills/interests overlap, and company/location match with reasons and pre-filled Add form. Then I expanded it (`215cdce`).
- I built skill extraction (`b70f1bd`, `6dae967`): `lib/skills.ts` repo-language to skill mapping feeding people scores.
- I built the repo recommender (`a9bad81`, 408+/59-: `app/api/github/recommendations/route.ts` +185, `DiscoverView.tsx` +250) with Recommended (connections x 2 + language match x 3), Starred, and Your Repos tabs plus search and empty/loading/error states.
- I tuned the algo (`bdba6ff`, `597775e`) and rewrote the README (`9b30c3c`, +170/-20).

## What blocked me

- I blew the 1MB function limit on deploy with the default edge runtime. One line fixed it (`025c7d9`).
- I deleted 444 lines of local-only paths the same week as the Neon switch: the same mistake class as my EasyDev Vercel loop, which I caught faster here.
- New edges snapped the graph, node placement had a bug, and tiny hitboxes made connecting nodes fiddly until I tuned them together.
- The detail panel covered nodes on narrow layouts, and my early algo over-ranked mutual follows over skill and company signals until I rebalanced it.

## What I learned

- Recommenders are the payoff for a structured graph: without scored people and repo suggestions, it is just a contact viewer. Skill extraction from GitHub languages makes scores adapt as the network evolves.
- Account management plus Neon persistence has to be real (not mocked) before the final, including guest-to-registered flows and cascade deletes.
- Mobile bottom-sheet plus hitboxes are required, not polish: the canvas graph is unusable on phones without them.
