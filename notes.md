# MonAmi

An interactive constellation graph of your professional network: people, connections, and context.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind CSS v4** — dark space/constellation theme
- **Prisma + SQLite** — single-file database (`prisma/dev.db`)
- **react-force-graph-2d** — force-directed canvas graph
- **NextAuth v5 (beta)** — GitHub OAuth + Credentials providers

## Data Model

### User
- `id`, `email`, `passwordHash`, `name`, `image`
- `githubId` — unique GitHub user ID (set on OAuth sign-in)
- `githubToken` — OAuth access token (for GitHub API calls)
- `githubTokenExpiry` — token expiration timestamp
- `createdAt`, `updatedAt`

### Person (node)
- `id`, `userId` → User, `name`, `nickname`, `avatarUrl`, `headline`, `company`, `location`, `email`
- `skills`, `interests`, `tags` — JSON string arrays
- `notes` — free text
- `links` — JSON key/value pairs (e.g. `{ "GitHub": "https://..." }`)
- `githubLogin` — GitHub username (set by profile sync)
- `createdAt`, `updatedAt`

### Edge (connection)
- `id`, `sourceId` → Person, `targetId` → Person
- `origin` — enum: `in_person`, `github`, `school`, `work`, `introduction`, `online`, `other`
- `context` — how/why you know them
- `communities`, `projects` — JSON string arrays
- `strength` — 1 (weak), 2 (normal), 3 (strong)
- `metAt` — optional date
- Unique constraint: `[sourceId, targetId]`

## File Structure

```
prisma/
  schema.prisma        — data models
  seed.ts              — demo data seeder

src/
  lib/
    model.ts           — types, origin constants, color/utility helpers
    dto.ts             — Prisma row → API DTO transformers
    db.ts              — Prisma singleton (survives HMR in dev)
    demo.ts            — 11 demo people + 13 edges + insertDemoData()
    auth.ts            — NextAuth config (GitHub + Credentials providers, JWT session)
    auth-guard.ts      — requireUserId() helper (reads session)
    github.ts          — GitHub API utilities (token management, profile/followers/following/repos fetchers)
    graph-types.ts     — graph-related type definitions
    graph-utils.ts     — graph utility functions

  components/
    NetworkApp.tsx     — main app shell (data loading, selection, modals, tab system)
    GraphView.tsx      — force-directed graph canvas (node/link painting)
    DetailsPanel.tsx   — right sidebar (person view / edge editor)
    DiscoverView.tsx   — Discover tab (repos, recommendations)
    AddPersonModal.tsx — create person form
    AddConnectionModal.tsx — create edge form
    PersonFormFields.tsx — shared person form fields
    EdgeFormFields.tsx — shared edge form fields
    Modal.tsx          — reusable modal wrapper
    ConfirmDialog.tsx  — confirm dialog context/provider
    Providers.tsx      — NextAuth SessionProvider wrapper
    icons.tsx          — SVG icon components

  app/
    layout.tsx         — root HTML shell (wraps children with Providers)
    page.tsx           — renders <NetworkApp />
    globals.css        — Tailwind imports, dark theme, component classes
    login/page.tsx     — login form
    register/page.tsx  — registration form
    api/
      auth/[...nextauth]/route.ts — NextAuth handler
      auth/guest/route.ts         — guest sign-in
      auth/register/route.ts      — user registration
      graph/route.ts              — GET all people + edges
      people/route.ts             — GET/POST people
      people/[id]/route.ts        — GET/PATCH/DELETE single person
      edges/route.ts              — GET/POST edges
      edges/[id]/route.ts         — GET/PATCH/DELETE single edge
      seed/route.ts               — POST seed demo data
      github/
        sync-profile/route.ts     — POST sync GitHub profile to "You" node
        sync-connections/route.ts — POST sync GitHub followers/following
        repos/route.ts            — GET user's GitHub repos
        recommendations/route.ts  — GET people and repo recommendations
```

## API Routes

| Method | Route                          | Purpose                            |
|--------|--------------------------------|------------------------------------|
| GET    | `/api/graph`                   | All people + edges                 |
| GET    | `/api/people`                  | List people                        |
| POST   | `/api/people`                  | Create person                      |
| GET    | `/api/people/[id]`             | Fetch single person                |
| PATCH  | `/api/people/[id]`             | Update person                      |
| DELETE | `/api/people/[id]`             | Delete person + cascades           |
| GET    | `/api/edges`                   | List edges                         |
| POST   | `/api/edges`                   | Create edge                        |
| PATCH  | `/api/edges/[id]`              | Update edge                        |
| DELETE | `/api/edges/[id]`              | Delete edge                        |
| POST   | `/api/seed`                    | Seed demo data (if empty)          |
| POST   | `/api/github/sync-profile`     | Sync GitHub profile to "You" node  |
| POST   | `/api/github/sync-connections` | Sync GitHub followers/following    |
| GET    | `/api/github/repos`            | Get user's GitHub repos            |
| GET    | `/api/github/recommendations`  | Get people and repo recommendations |

## Development

```bash
npm install          # install deps + prisma generate
npm run setup        # push schema + seed demo data
npm run dev          # start dev server at localhost:3000
npm run typecheck    # TypeScript check
npm run build        # production build
```

## Environment

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<nextauth secret>"
GITHUB_ID="<github oauth client id>"
GITHUB_SECRET="<github oauth client secret>"
```

---

## Phase 1 — Done

GitHub OAuth integration and profile sync. The "You" node can now be populated from a GitHub profile.

### What was built
- **Auth**: NextAuth v5 with GitHub OAuth + Credentials providers. GitHub token and expiry stored in DB on sign-in.
- **Profile sync**: "Sync GitHub" button in DetailsPanel. Calls `POST /api/github/sync-profile`, which fetches the GitHub `/user` endpoint and overwrites the "You" node fields: `name`, `avatarUrl`, `headline` (bio), `company`, `location`, `email`, `githubLogin`, and `links` (adds GitHub profile link).
- **Node identification**: The "You" node is identified by a `"me"` tag in the `tags` JSON array, not by name.
- **Providers**: `<Providers>` wrapper gives the app access to `useSession()` for checking `githubId`.
- **"me" tag backfill fix**: Graph route only adds `"me"` tag to the person named "You", not all people.

### Key files
- `src/lib/auth.ts` — NextAuth config (DO NOT MODIFY)
- `src/lib/github.ts` — GitHub API types + helpers
- `src/lib/auth-guard.ts` — `requireUserId()` from session
- `src/app/api/github/sync-profile/route.ts` — sync endpoint
- `src/components/DetailsPanel.tsx` — sync button + error UI
- `src/components/NetworkApp.tsx` — `useSession()`, passes `githubId`
- `src/components/Providers.tsx` — SessionProvider wrapper

---

## Phase 2 — Done

Import GitHub followers and following as graph nodes with edges to the "You" node.

### Goals
- Automatically populate the network with people the user follows or who follow them on GitHub
- Create graph edges (origin: "github") between "You" and each connection
- Match existing people by `githubLogin` to avoid duplicates

### API: `POST /api/github/sync-connections`

1. Require auth + valid GitHub token
2. Fetch followers and following via `fetchGitHubFollowers()` and `fetchGitHubFollowing()` (already in `github.ts`)
3. For each GitHub user:
   a. Search existing people by `githubLogin`
   b. If found → use existing person
   c. If not found → create new Person node with `name`, `avatarUrl`, `githubLogin`, `tags: ["github"]`, `userId`
4. For each connection, upsert an Edge: `{ sourceId: you.id, targetId: person.id, origin: "github" }` (skip if edge already exists)
5. Return summary: `{ created: number, matched: number, skipped: number }`

### UI changes
- **DetailsPanel.tsx**: Add "Sync Connections" button below "Sync GitHub" (only visible when `isYou && githubId`)
- Show sync result (e.g. "Added 12 new connections, matched 3 existing")
- Loading state while sync runs

### Edge deduplication
- Before creating an edge, check if one already exists between the two people (sourceId, targetId pair)
- Use the Prisma `@@unique([sourceId, targetId])` constraint — use `upsert` with the compound key

### Data considerations
- GitHub followers/following API returns `{ login, avatar_url, id, ... }` — matches the `GitHubUser` type already in `github.ts`
- New nodes get `tags: ["github"]` to distinguish auto-imported nodes from manually created ones
- `avatarUrl` is set from `avatar_url` — no fallback to Dicebear (GitHub always provides one)
- Name is set from GitHub login (display name not available in list endpoints without extra API calls)

### Files to modify/create
- `src/app/api/github/sync-connections/route.ts` — **new** endpoint
- `src/components/DetailsPanel.tsx` — add "Sync Connections" button + result display
- `src/components/NetworkApp.tsx` — pass `onSyncGithub` prop to DetailsPanel for connections too (or separate prop)

### Stretch: Rate limiting
- GitHub API has rate limits (60 req/hr unauthenticated, 5000 authenticated)
- For users with many followers/following, paginate carefully (already handled by `fetchAllPaginated` in `github.ts`)
- Consider showing a progress indicator for large syncs

---

## Phase 3 — Done

A "Discover" tab alongside the graph view for exploring repos, orgs, and getting recommendations.

### What was built
- **Tab system**: Added "Network" and "Discover" tabs to the header bar with `activeTab` state
- **DiscoverView component**: New scrollable card-based layout with 3 sections (repos, people recommendations, repo recommendations)
- **GitHub API helpers**: Added `fetchGitHubRepos()`, `fetchGitHubOrgs()`, `fetchGitHubStarredRepos()`, `fetchGitHubRepoContributors()` to `github.ts`
- **API endpoints**: Created `GET /api/github/repos`, `GET /api/github/recommendations`
- **Icons**: Added `IconCompass`, `IconStar`, `IconBuilding`, `IconGitBranch` to icons.tsx
- **Conditional rendering**: Graph-specific elements (zoom controls, legend, empty state) only show on Network tab

### Goals
- Show the user's GitHub repos
- Recommend people to connect with based on shared activity
- Recommend repos to check out based on connections' stars

### New tab UI
- Add a tab bar above or below the graph: "Graph" | "Discover"
- Discover tab replaces the graph canvas with a scrollable card-based layout
- Keep the DetailsPanel sidebar functional in both tabs

### Section 1: My Repos

**API: `GET /api/github/repos`**
- Fetches user's repos via `fetchGitHubRepos()` (new helper in `github.ts`)
- Returns: `{ repos: GitHubRepo[] }` — already typed in `github.ts`

**UI:**
- Card grid showing each repo with: name, description, language, stars, forks, last updated
- Link to GitHub repo
- Sort by: stars (default), recently updated, name

### Section 2: People Recommender

**API: `GET /api/github/recommendations?type=people`**
- Algorithm:
  1. Find GitHub users who appear in the same repos as the user but are NOT yet in the network
  2. Look at followers/following of the user's existing connections
  3. Score by: number of shared repos, mutual connections
- Return top N suggestions with: `login`, `avatar_url`, `reason` (e.g. "Contributor to 3 shared repos", "Followed by 2 connections")

**UI:**
- List of recommended people with avatar, name, reason
- "Add to network" button → creates Person node + optional Edge
- "Ignore" button to dismiss

### Section 3: Repo Recommender

**API: `GET /api/github/recommendations?type=repos`**
- Algorithm:
  1. Find repos starred by the user's connections but not by the user
  2. Find repos that the user hasn't starred
  3. Score by: number of connections who starred it, total stars

**UI:**
- List of recommended repos with: name, description, language, stars, "starred by N connections"
- "Star on GitHub" link
- "Add to profile" link button

### Files to modify/create
- `src/lib/github.ts` — add `fetchGitHubRepos()`, `fetchGitHubStarredRepos()`, `fetchGitHubRepoContributors()` helpers
- `src/app/api/github/repos/route.ts` — **new** endpoint
- `src/app/api/github/recommendations/route.ts` — **new** endpoint
- `src/components/DiscoverView.tsx` — **new** component for the Discover tab content
- `src/components/NetworkApp.tsx` — add tab state, render DiscoverView when "Discover" tab active
- `src/components/icons.tsx` — add any new icons needed for tabs

### Data flow
```
NetworkApp (tab state)
  ├─ [Network tab] → GraphView + DetailsPanel
  └─ [Discover tab] → DiscoverView + DetailsPanel
       ├─ ReposSection → GET /api/github/repos
       ├─ PeopleRecommendations → GET /api/github/recommendations?type=people
       └─ RepoRecommendations → GET /api/github/recommendations?type=repos
```

### Performance considerations
- Cache GitHub API responses for 5-10 minutes (GitHub responses include `Cache-Control` headers)
- Use `React.cache` or simple in-memory cache to avoid duplicate fetches within the same request
- Lazy-load sections as user scrolls (or fetch all on tab open)
- Show skeleton loaders while fetching
