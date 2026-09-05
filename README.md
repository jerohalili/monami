# MonAmi | Interactive Networking Constellation

## Short Introduction

MonAmi is a full-stack web app that turns a developer's professional network into something they can actually see, search, and grow deliberately.

Instead of scattering connections across GitHub followers, LinkedIn contacts, and half-remembered Discord DMs, MonAmi pulls everything into a single interactive force-directed graph. Each person becomes a visual node — name, avatar, headline, skills, interests, tags, notes — and edges between nodes carry real context: how you know them, what you share, when you met. On top of the graph, MonAmi recommends new people to connect with and GitHub projects to work on, adapting as your network evolves.

**Core Philosophy:** *Your network is a graph, not a list.*

The project also exists as a way to build a real graph-based data model with relationship context as first-class data, rather than an afterthought note field — the thing most contact tools fail to capture.

---

## Live Website

**Website:** <https://monami-one.vercel.app/>

---

## Technologies Used

### Frontend

- React 19
- Next.js 15 (App Router)
- TypeScript 5.8
- Tailwind CSS v4 — CSS-based configuration via `@tailwindcss/postcss`, no `tailwind.config.js`
- Custom CSS-variable theming system (`--bg-main`, `--text-primary`, `--primary-accent`, etc.) driving dark/light mode via a `data-theme` attribute on `<html>`
- [react-force-graph-2d](https://github.com/vasturiano/react-force-graph-2d) for canvas-based force-directed graph rendering
- [d3-force-3d](https://github.com/vasturiano/d3-force-3d) for physics simulation
- Custom SVG icons (18 hand-drawn components)

### Backend

- Next.js API routes (App Router) — all server logic runs as part of the same Next.js deployment
- NextAuth v5 beta (`next-auth@5.0.0-beta.32`) — JWT session strategy, GitHub OAuth + Credentials providers
- Prisma 6.5 ORM
- bcryptjs for password hashing

### Database

- PostgreSQL (hosted on [Neon](https://neon.tech))
- Schema-first with Prisma — three models: `User`, `Person`, `Edge`
- Core tables: `users`, `people`, `edges`
- Cascade deletes on account removal; unique constraint on edge pairs

### External APIs

- GitHub REST API — profile sync, followers/following import, repository listing, contributor discovery, starred repos
- DiceBear API — auto-generated avatar SVGs for people without a custom avatar

### Dev Tools

- Vercel (or any Next.js-compatible host) for deployment
- ESLint
- TypeScript (`tsc --noEmit`)

---

## Features

### Interactive Force-Directed Graph

A canvas-rendered network visualization where each person is a node and each relationship is an edge. Nodes are color-coded by name, display avatars (with DiceBear fallback), and show labels on hover. Edges are color-coded by origin type and drawn with different thicknesses and styles based on connection strength — dashed for weak, solid for normal, double-parallel for strong. The "You" node gets a distinct amber/gold glow.

Physics are tuned to center the graph around your node and gently reheat on topology changes without jarring animations. A search bar filters and highlights matching nodes in real time.

### People & Relationship Management

Full CRUD for person nodes (name, nickname, avatar, headline, company, location, email, skills, interests, tags, links, notes) and edges between them. Each edge carries origin type (in-person, GitHub, GitHub indirect, school, work, introduction, online, other), free-text context, shared communities, shared projects, strength level, and date met. A detail sidebar shows all metadata with inline edit mode — no page navigation needed.

A custom confirm dialog replaces `window.confirm` for destructive actions.

### GitHub Integration

- **Profile sync** — pulls your name, avatar, bio, company, location, and email from GitHub into your "You" node automatically.
- **Connection sync** — imports your GitHub followers and following as graph nodes. Filters: all, following-only, mutual-only. Creates cross-edges between imported people who follow each other.
- **Indirect discovery** — explores followers/following of your direct connections to surface second-degree contacts you might not know about.
- **Repos tab** — shows your GitHub repositories in a card grid with language, stars, and description.
- **Recommendations** — suggests people to connect with based on shared repo contributors, mutual follows, skills/interests overlap, and company/location match. Project recommendations surface repos starred by your direct connections, scored by connection count and language match.

### Discover Tab

Two main tabs: People (recommendations) and Repos. The Repos tab has three sub-tabs: Recommended (repos starred by direct connections, scored by `connections × 2 + language match × 3`), Starred (your GitHub starred repos), and Your Repos (your GitHub repositories). Each supports search filtering, shows empty states when there's nothing to display, and handles loading/error states gracefully. People recommendations show scores, reasons, expandable detail breakdowns, and "Add" buttons that open a pre-filled person form.

### Dark / Light Theme

A CSS-variable theming system with a manual toggle, persisted to `localStorage`, and auto-detected from system preference on first visit. Dark mode adds a star-field background effect. Every screen and component respects the theme consistently.

### Responsive Layout

Desktop shows a fixed sidebar for person/edge details. On phones, the sidebar becomes a bottom-sheet overlay. Less-used actions move into a mobile overflow menu. The graph itself scales and pans to fit any screen size, with zoom in/out/fit controls in the bottom-right corner.

### Account Management

Settings page for viewing account info, changing email/password, linking/unlinking GitHub, and deleting your account (with cascade to all people and edges). A shared guest account is available for quick onboarding without committing to registration.

### Resilient API Handling

Every API route validates auth via a `requireUserId()` helper. Frontend requests check `res.ok` before parsing JSON and surface server error messages or network-failure fallbacks to the user. Toast notifications provide success/error feedback for sync operations.

---

## Development Process (How It Was Built and Why)

### Why I Built It

Most people manage their professional network as a scattered mess of platforms, servers, and half-remembered context ("met her in that indie-dev Discord, she does backend"). That context — the *why* behind a connection — is exactly what gets lost first, and it's the part that actually matters when you want to reach back out, ask for an introduction, or find a collaborator.

I wanted to build something that treats relationships as first-class data with real structure (origin, context, shared communities, strength) rather than as free-text notes bolted onto a contact list.

### Build Order

The project was built graph-first, because the entire value proposition depends on whether the data model and visualization feel right:

1. **Data model first.** `User`, `Person`, and `Edge` models were designed in Prisma/Postgres with full relationship metadata before any UI existed — origin types, strength levels, shared communities/projects, and the unique constraint on edge pairs.
2. **API layer.** Full CRUD routes for people and edges, plus a graph endpoint that returns the complete network payload in one request. Auth middleware protects all routes.
3. **Graph visualization.** A canvas-rendered force-directed graph using `react-force-graph-2d`, with custom node painting (avatars, initials, color-coding, glow effects), custom link painting (origin-colored, strength-styled), drag-and-drop placement, animated camera transitions, and physics tuning.
4. **CRUD UI.** Detail sidebar with view/edit modes, add-person and add-connection modals, searchable person picker, edge form with origin/strength/context fields.
5. **GitHub integration.** OAuth sign-in stores the access token; profile sync, followers/following import with cross-edge creation, indirect discovery, repos tab, and basic recommendations.
6. **Auth and account management.** NextAuth v5 with GitHub and credentials providers, registration, guest account, settings page, account deletion with cascade.
7. **Theme and responsive pass.** CSS-variable dark/light system, manual toggle with localStorage persistence, desktop sidebar to mobile bottom-sheet, overflow menu, zoom controls, legend, toast notifications.
8. **Polish.** Loading states, empty states, custom confirm dialogs, search filtering, error handling across every view.

---

## Setup Instructions

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) Postgres database (or any Postgres instance — just point `DATABASE_URL` at it)
- A [GitHub OAuth App](https://github.com/settings/developers) (for GitHub sign-in — set the callback URL to `http://localhost:3000/api/auth/callback/github`)

### 1. Clone the repo

```
git clone https://github.com/jerohalili/monami.git
cd monami
```

### 2. Install dependencies

```
npm install
```

This triggers `postinstall`, which runs `prisma generate` automatically.

### 3. Configure environment

```
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — your Postgres connection string (must include `sslmode=require` for Neon)
- `AUTH_SECRET` — generate one with `npx auth secret` or any random string
- `AUTH_GITHUB_ID` — your GitHub OAuth App client ID
- `AUTH_GITHUB_SECRET` — your GitHub OAuth App client secret

### 4. Push the schema to your database

```
npm run setup
```

This runs `prisma generate` + `prisma db push` to create the tables.

### 5. Run it

```
npm run dev
```

The app starts at `http://localhost:3000`.

---

## License

See [LICENSE](https://github.com/jerohalili/monami/blob/main/LICENSE) (MIT) for details.
