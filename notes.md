# MonAmi

An interactive constellation graph of your professional network: people, connections, and context.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind CSS v4** — dark space/constellation theme
- **Prisma + SQLite** — single-file database (`prisma/dev.db`)
- **react-force-graph-2d** — force-directed canvas graph

## Data Model

### Person (node)
- `id`, `name`, `nickname`, `avatarUrl`, `headline`, `company`, `location`, `email`
- `skills`, `interests`, `tags` — JSON string arrays
- `notes` — free text
- `links` — JSON key/value pairs (e.g. `{ "GitHub": "https://..." }`)
- `githubLogin`, `isSelf`

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

  components/
    NetworkApp.tsx     — main app shell (data loading, selection, modals)
    GraphView.tsx      — force-directed graph canvas (node/link painting)
    DetailsPanel.tsx   — right sidebar (person view / edge editor)
    AddPersonModal.tsx — create person form
    AddConnectionModal.tsx — create edge form
    PersonFormFields.tsx — shared person form fields
    EdgeFormFields.tsx — shared edge form fields
    Modal.tsx          — reusable modal wrapper
    icons.tsx          — SVG icon components

  app/
    layout.tsx         — root HTML shell
    page.tsx           — renders <NetworkApp />
    globals.css        — Tailwind imports, dark theme, component classes
    api/
      graph/route.ts   — GET all people + edges
      people/route.ts  — GET/POST people
      people/[id]/route.ts — GET/PATCH/DELETE single person
      edges/route.ts   — GET/POST edges
      edges/[id]/route.ts — GET/PATCH/DELETE single edge
      seed/route.ts    — POST seed demo data
```

## API Routes

| Method | Route              | Purpose                    |
|--------|--------------------|----------------------------|
| GET    | `/api/graph`       | All people + edges         |
| GET    | `/api/people`      | List people                |
| POST   | `/api/people`      | Create person              |
| GET    | `/api/people/[id]` | Fetch single person        |
| PATCH  | `/api/people/[id]` | Update person              |
| DELETE | `/api/people/[id]` | Delete person + cascades   |
| GET    | `/api/edges`       | List edges                 |
| POST   | `/api/edges`       | Create edge                |
| PATCH  | `/api/edges/[id]`  | Update edge                |
| DELETE | `/api/edges/[id]`  | Delete edge                |
| POST   | `/api/seed`        | Seed demo data (if empty)  |

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
```
