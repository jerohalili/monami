# MonAmi — Project Notes

## Architecture Overview

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4 (dark space/constellation theme)
- **Database:** Prisma + SQLite (`prisma/dev.db`)
- **Graph:** react-force-graph-2d (force-directed constellation)
- **Auth:** NextAuth.js v5 (GitHub OAuth + Credentials + Guest)
- **Project root:** `C:\Users\JeroH\Documents\GitHub\monami`

## Key Files

- `prisma/schema.prisma` — Data models (Person, Edge, User, Account, Session, VerificationToken)
- `src/lib/db.ts` — Prisma singleton
- `src/lib/auth.ts` — NextAuth configuration
- `src/lib/model.ts` — TypeScript types and constants
- `src/lib/dto.ts` — Prisma row -> API DTO transformers
- `src/lib/demo.ts` — Demo dataset (11 people, 13 edges)
- `src/middleware.ts` — Route protection middleware
- `src/app/api/` — REST API routes
- `src/components/NetworkApp.tsx` — Main app shell

## Data Model

### Person
- id (CUID), name, nickname?, avatarUrl?, headline?, company?, location?, email?
- skills (JSON[]), interests (JSON[]), tags (JSON[])
- notes?, links (JSON{}), githubLogin?
- isSelf (boolean), userId? (links to User)
- outgoing/incoming Edge relations

### Edge
- id (CUID), sourceId -> Person, targetId -> Person
- origin (enum string), context?, communities (JSON[]), projects (JSON[])
- strength (1-3), metAt?
- Unique constraint: [sourceId, targetId]

### User (NextAuth)
- id, name?, email?, emailVerified?, image?, password? (hashed)
- role: "user" | "guest"
- accounts[], sessions[], person? (Person relation)

## Auth System

### NextAuth v5 Configuration
- **Adapter:** Prisma (SQLite)
- **Session strategy:** JWT
- **Providers:** GitHub OAuth, Credentials (email/password), Guest
- **Route protection:** `src/middleware.ts` (redirects unauthenticated users to `/login`)
- **Client auth:** `AuthProvider` wraps the app, `AuthGuard` protects the main page

### GitHub OAuth Flow
1. User clicks "Sign in with GitHub"
2. NextAuth redirects to GitHub OAuth
3. On callback, fetches user profile + followers/following via GitHub API
4. Creates/updates User + Person records
5. Creates Edge nodes for followers/following relationships

### Email + Password (Credentials)
1. User registers with email/password (bcrypt hashed)
2. Creates User + linked Person record
3. Standard email/password login

### Guest Account
1. "Continue as Guest" creates temporary session
2. Gets a Guest User record (role: "guest")
3. Can create people/edges but data is tied to guest session
4. Guest data is isolated from other users

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | /api/graph | All people + edges (scoped to user) |
| POST | /api/seed | Seed demo data |
| GET/POST | /api/people | List/create people |
| GET/PATCH/DELETE | /api/people/[id] | CRUD single person |
| GET/POST | /api/edges | List/create edges |
| GET/PATCH/DELETE | /api/edges/[id] | CRUD single edge |
| POST | /api/github/sync | Fetch GitHub followers/following |
| POST | /api/auth/register | Register email/password account |
| POST | /api/auth/guest | Create guest account |

## Pages

| Route | Purpose |
|---|---|
| `/` | Main app (requires auth) |
| `/login` | Login page (GitHub, email/pass, guest) |
| `/register` | Registration page |

## Environment Variables

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="..."           # NextAuth secret (generate: openssl rand -base64 32)
AUTH_GITHUB_ID="..."        # GitHub OAuth app (callback: http://localhost:3000/api/auth/callback/github)
AUTH_GITHUB_SECRET="..."    # GitHub OAuth app
```

## Development Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run db:push      # Push schema to SQLite
npm run db:seed      # Seed demo data
npm run setup        # db:push + db:seed
```

## Design Decisions

- Dark navy theme (#05070d) with constellation/star aesthetic
- Force-directed graph for organic network layout
- Nodes: avatars or initials (no external image service dependency)
- Edges colored by relationship origin type
- Mobile: bottom sheet instead of side panel
- SQLite for simplicity (single file, no server)
- NextAuth v5 for modern auth patterns

## TODO / Roadmap

- [x] Milestone 1: Core graph + CRUD
- [x] Auth: GitHub OAuth + Credentials + Guest
- [x] GitHub integration: followers/following into graph
- [ ] People-recommendation engine
- [ ] Project-recommendation engine
- [ ] Adaptive layer — recommendations learn from interactions
- [ ] Design-system pass, error/empty polish
- [ ] Deployment (Vercel/Docker)
