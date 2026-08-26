# monami

Interactive network graph that turns your GitHub connections into a visual map of people, skills, and shared context.

## Status — Milestone 1

- **Data model** — `Person` nodes (name, avatar, headline, company, contact, skills, interests, tags, notes, links, GitHub handle) and typed `Edge` relationships carrying first-class context metadata: how you know someone (`origin`), free-text context, shared communities, shared projects, tie strength, and when you met.
- **Graph interface** — force-directed constellation on canvas (react-force-graph). Nodes render avatars or initials; edges are colored by relationship origin; hover a connection for its context tooltip; click a person or connection for the details panel.
- **Full CRUD** — add/edit/delete people and connections via UI + REST API (`/api/people`, `/api/edges`, `/api/graph`).
- **Search & explore** — dimming search across names/skills/interests/tags, neighbor highlighting, zoom controls, fit-view.
- **Responsive** — side panel on desktop becomes a bottom sheet on phones.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS v4 · Prisma + SQLite · react-force-graph-2d

## Getting started

```bash
npm install
npm run setup   # creates prisma/dev.db and loads the sample network
npm run dev
```

Open http://localhost:3000. Starting from an empty database shows options to load the sample network or add your first person.

## Next milestones

- [ ] GitHub integration — technical profile, projects, contributions into nodes
- [ ] People-recommendation engine
- [ ] Project-recommendation engine
- [ ] Adaptive layer — recommendations learn from interactions
- [ ] Design-system pass, error/empty polish, deployment
