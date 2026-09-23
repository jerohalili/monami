# MonAmi | Interactive Networking Constellation

[![Made with AI](https://img.shields.io/badge/Made_with-AI_assistance-blue)](AI-USAGE.md)

> Built with AI assistance (Claude + Copilot) across graph tuning, GitHub sync, and recommender work; see [AI-USAGE.md](AI-USAGE.md) for the full log.

**Repo:** https://github.com/jerohalili/monami
**Live:** https://monami-one.vercel.app/

---

## 1. Overview

MonAmi turns a developer's professional network into an interactive force-directed graph you can see, search, and grow deliberately. Each person is a node (avatar, headline, skills, tags, notes) and each edge carries real context (how you met, shared communities, strength, date), with GitHub import plus people- and repo-recommendations that adapt as the network evolves.

**Core philosophy:** *Your network is a graph, not a list.* Relationship context is first-class data, not an afterthought note field.

Technologies: Next.js 15 App Router + React 19 + TypeScript + Tailwind v4, `react-force-graph-2d` + `d3-force-3d`, NextAuth v5 (GitHub + Credentials + guest), Prisma 6 + Neon Postgres, GitHub REST API, DiceBear avatars.

---

## 2. Setup and installation

### Prerequisites

- Node.js 18+
- A Postgres database (Neon recommended)
- A GitHub OAuth App: https://github.com/settings/developers — callback `http://localhost:3000/api/auth/callback/github`

### 2.1 Get the code

```bash
git clone https://github.com/jerohalili/monami.git
cd monami
```

### 2.2 Install dependencies

```bash
npm install
```

Runs `postinstall → prisma generate` automatically.

### 2.3 Environment and configuration

```bash
cp .env.example .env
```

| Variable | Required | Example value | Notes |
|----------|----------|---------------|-------|
| `DATABASE_URL` | Yes | `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require` | Postgres/Neon string, `sslmode=require` for Neon. Never commit the real value. |
| `AUTH_SECRET` | Yes | `npx auth secret` output, e.g. `k7Q…64hex…==` | NextAuth session secret. Generate with `npx auth secret`. |
| `AUTH_GITHUB_ID` | Yes for GitHub sign-in | `Ov23li…` | OAuth App client ID. |
| `AUTH_GITHUB_SECRET` | Yes for GitHub sign-in | `436ddf…40chars…` | OAuth App client secret. |

### 2.4 Push the schema

```bash
npm run setup
# = prisma generate && prisma db push → creates users, people, edges
```

---

## 3. How to run it

```bash
npm run dev
```

Open http://localhost:3000. Sign in via GitHub, email/password (register first), or one-click guest. First load auto-creates your `You` node; an empty graph with one glowing node means it works. Live reference: https://monami-one.vercel.app/

Other scripts: `npm run build`, `npm start`, `npm run typecheck` (`tsc --noEmit`), `npm run db:push`, `npm run db:reset` (⚠️ `--force-reset`, local only).

---

## 4. Features and usage

Primary flow: **Graph → GitHub sync → Discover → Settings.**

- **Interactive graph (`/`):** canvas force-directed, centered on `You` (amber glow). Nodes color-coded by name with avatar/DiceBear fallback; edges colored by origin (in-person, GitHub, GitHub-indirect, school, work, introduction, online, other) and styled by strength (dashed weak / solid / double strong). Search filters live; drag to place; zoom in/out/fit; click node/edge → detail sidebar (desktop) / bottom-sheet (mobile) with inline edit; custom confirm dialog for deletes.
- **People & edges CRUD:** full person fields (nickname, headline, company, location, email, skills/interests/tags, links, notes, githubLogin) + edge fields (origin, context, communities, projects, strength 1–3, met date).
- **GitHub integration:** profile sync into `You` node; connection sync (followers/following import with all/following-only/mutual-only filter + cross-edges between imported who follow each other); indirect discovery (second-degree sweep); repos tab (your repos grid).
- **Discover tab:** People (scored by shared contributors, mutuals, skills overlap, company/location; reasons + expandable breakdown + Add → prefilled form) and Repos (Recommended `connections×2 + language×3`, Starred, Yours) with search + empty/loading/error states.
- **Account (`/settings`):** view info, change email/password, link/unlink GitHub, cascade delete account. Shared guest account for quick onboarding.
- **Resilience:** `requireUserId()` on every API route → 401; frontend `res.ok` checks + toasts; theme (`data-theme` + `localStorage`, star-field dark) + responsive throughout.

### Main API endpoints (all non-auth via `requireUserId()` → 401)

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/graph` | Whole constellation `{people, edges}`; auto-creates `You` |
| GET/POST | `/api/people` | List / create person (name required) |
| GET/PATCH/DELETE | `/api/people/[id]` | Fetch / edit / delete person (owner-scoped, 204 on delete) |
| GET/POST | `/api/edges` | List / create tie (rejects self-link, 409 on duplicate pair) |
| PATCH/DELETE | `/api/edges/[id]` | Edit / delete tie |
| GET | `/api/recommendations` | People recommendations (top 30, enriched top 10) |
| POST | `/api/github/sync-profile` | Overwrite `You` from GitHub profile + repo skills |
| POST | `/api/github/sync-connections` | Import followers/following (+ cross-edges) |
| POST | `/api/github/sync-indirect` | Second-degree sweep |
| GET | `/api/github/repos`, `/api/github/recommendations?type=` | Own repos / people+repo recommendations |
| GET/PATCH/DELETE | `/api/account`, `DELETE /api/account/github` | Account info / email+password change / cascade delete / unlink |
| POST | `/api/auth/register`, `/api/auth/guest` | Email signup (bcrypt) / demo guest login |

---

## 5. Project structure

```
monami/
  prisma/schema.prisma   # User, Person, Edge (unique [sourceId,targetId], cascade)
  src/app/
    page.tsx, layout.tsx # NetworkApp shell + theme-boot script
    login/, register/, settings/
    api/{graph,people,people/[id],edges,edges/[id],recommendations,
         account,account/github,github/sync-profile,sync-connections,
         sync-indirect,repos,recommendations,auth/register,auth/guest,auth/[...nextauth]}
  src/components/        # NetworkApp, GraphView, DiscoverView, DetailsPanel, AddPersonModal, AddConnectionModal, Person/EdgeFormFields, Modal, ConfirmDialog, Providers, icons
  src/lib/               # auth.ts, auth-guard.ts (requireUserId), db.ts (Prisma singleton), dto.ts, model.ts, github.ts, skills.ts
  src/middleware.ts      # runtime=nodejs; /login|/register redirect if logged in, pages → /login if not; /api/* pass through for route-level 401
  next.config.ts         # avatars.githubusercontent.com remote images
```

---

## 6. Screenshots

> Captured from the live site (`monami-one.vercel.app`) by the author on Sep 23, 2026.

![Graph](docs/screenshots/network-graph.jpeg)
*Force-directed constellation (23 people, 31 connections) with search, legend, and zoom controls.*

![Sign in](docs/screenshots/signin.jpeg)
*Sign in — GitHub OAuth, email credentials, or guest pass.*

![Discover people](docs/screenshots/discover-people.jpeg)
*Discover people — scored recommendations with reasons and one-tap Add.*

![Discover repos](docs/screenshots/discover-repos.jpeg)
*Discover repos — Recommended, Starred, and Your Repos tabs with search.*

---

## 7. Known issues and next steps

- Left to verify on `monami-one` prod: GitHub link/unlink and cascade delete, plus last responsive pass. Nothing blocking.
- `github/*` error paths return upstream `e.message` (may echo GitHub body) — will sanitize to generic 502/500.
- Password policy inconsistent (register ≥6 vs account change ≥8) — will unify to 8+.
- `npm run db:reset` (`--force-reset`) is local-only danger — documented, never exposed via API.
- Demo `guest@monami.app / guest123` is intentional shared demo with modify/delete hardening.
- Next: error sanitization + policy unification, then clean `build + typecheck + graph smoke` (add person/edge, sync, Discover).

---

## License

See [LICENSE](https://github.com/jerohalili/monami/blob/main/LICENSE) (MIT).
