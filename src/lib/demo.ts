// Demo dataset: 11 people and 13 relationships for the seed endpoint.
// Used by prisma/seed.ts and POST /api/seed.

import type { Prisma, PrismaClient } from "@prisma/client";
import type { Origin } from "./model";

// --- Types ---

export interface DemoPerson {
  key: string;
  name: string;
  nickname?: string;
  avatarUrl?: string;
  headline?: string;
  company?: string;
  location?: string;
  email?: string;
  skills?: string[];
  interests?: string[];
  tags?: string[];
  notes?: string;
  links?: Record<string, string>;
  githubLogin?: string;
  isSelf?: boolean;
}

export interface DemoEdge {
  from: string;
  to: string;
  origin: Origin;
  context?: string;
  communities?: string[];
  projects?: string[];
  strength?: number;
  metAt?: string;
}

// --- Helpers ---

function avatar(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=334155`;
}

// --- Data ---

export const DEMO_PEOPLE: DemoPerson[] = [
  {
    key: "you",
    name: "You",
    headline: "Full-stack developer",
    location: "Berlin",
    skills: ["TypeScript", "React", "Node.js", "GraphQL"],
    interests: ["open-source", "AI tooling", "game dev", "databases"],
    tags: ["me"],
    isSelf: true,
  },
  {
    key: "maya",
    name: "Maya Chen",
    nickname: "maya.dev",
    avatarUrl: avatar("Maya"),
    headline: "Backend engineer @ Fathom",
    location: "Amsterdam",
    skills: ["Go", "Postgres", "Kafka", "Distributed systems"],
    interests: ["queueing theory", "indie hacking", "climbing"],
    tags: ["backend", "friend"],
    links: { GitHub: "https://github.com/mayachen-dev" },
    notes: "Sharpest backend brain I know. Prefers async updates over meetings.",
  },
  {
    key: "jonas",
    name: "Jonas Weber",
    avatarUrl: avatar("Jonas"),
    headline: "OSS maintainer — wqueue",
    skills: ["Rust", "WASM", "Compilers"],
    interests: ["performance", "open-source", "typography"],
    tags: ["open-source"],
    links: { GitHub: "https://github.com/jonasweber" },
    githubLogin: "jonasweber",
    notes: "Looking for co-maintainers on his WASM toolchain.",
  },
  {
    key: "priya",
    name: "Priya Nair",
    avatarUrl: avatar("Priya"),
    headline: "ML engineer @ Loomfield",
    company: "Loomfield",
    location: "London",
    skills: ["Python", "PyTorch", "Recsys", "MLOps"],
    interests: ["recsys", "AI safety", "bouldering"],
    tags: ["ml", "hackathon"],
  },
  {
    key: "tom",
    name: "Tom Okafor",
    avatarUrl: avatar("Tom"),
    headline: "Product designer",
    location: "Lisbon",
    skills: ["Figma", "Motion design", "Design systems"],
    interests: ["generative art", "typography", "synths"],
    tags: ["design"],
    links: { Portfolio: "https://tomokafor.design" },
  },
  {
    key: "lena",
    name: "Lena Fischer",
    avatarUrl: avatar("Lena"),
    headline: "DevOps engineer @ Kraftwerk Cloud",
    company: "Kraftwerk Cloud",
    location: "Berlin",
    skills: ["Kubernetes", "Terraform", "Observability"],
    interests: ["homelab", "board games", "urban gardening"],
    tags: ["devops", "friend"],
  },
  {
    key: "diego",
    name: "Diego Ruiz",
    avatarUrl: avatar("Diego"),
    headline: "Gameplay programmer",
    location: "Barcelona",
    skills: ["Unity", "C#", "Godot"],
    interests: ["game dev", "roguelikes", "speedrunning"],
    tags: ["gamedev"],
  },
  {
    key: "sara",
    name: "Sara Lindqvist",
    avatarUrl: avatar("Sara"),
    headline: "Platform team lead @ Nordwind",
    company: "Nordwind",
    location: "Stockholm",
    skills: ["GraphQL", "Go", "API design"],
    interests: ["developer experience", "public speaking"],
    tags: ["platform"],
  },
  {
    key: "alex",
    name: "Alex Kim",
    avatarUrl: avatar("Alex"),
    nickname: "akbuilds",
    headline: "Indie hacker",
    skills: ["TypeScript", "Prompt engineering", "Next.js"],
    interests: ["AI tooling", "indie hacking", "side projects"],
    tags: ["ai"],
  },
  {
    key: "nadia",
    name: "Nadia Haddad",
    avatarUrl: avatar("Nadia"),
    headline: "Freelance frontend engineer",
    location: "Remote",
    skills: ["React", "Accessibility", "CSS"],
    interests: ["a11y", "design systems", "teaching"],
    tags: ["frontend", "freelance"],
    links: { GitHub: "https://github.com/nadiahaddad" },
    githubLogin: "nadiahaddad",
  },
  {
    key: "felix",
    name: "Felix Braun",
    avatarUrl: avatar("Felix"),
    headline: "CS student",
    location: "Munich",
    skills: ["Python", "Graph algorithms"],
    interests: ["open-source", "network science"],
    tags: ["open-source", "student"],
    links: { GitHub: "https://github.com/felixbraun" },
    githubLogin: "felixbraun",
  },
];

export const DEMO_EDGES: DemoEdge[] = [
  { from: "you", to: "maya", origin: "online", context: "Met in #backend-help on Indie Dev Lounge when she debugged my queue worker over a screenshare. Weekly coworking since.", communities: ["Indie Dev Lounge"], projects: ["monami"], strength: 3, metAt: "2025-03-14" },
  { from: "you", to: "jonas", origin: "github", context: "Reviewed each other's PRs on WASM tooling; he maintains wqueue which monami's job runner borrows from.", projects: ["wqueue", "monami"], strength: 2 },
  { from: "you", to: "priya", origin: "in_person", context: "Teammates at HackZurich — she built the recsys that got us to the finals. Kept in touch ever since.", strength: 3, metAt: "2025-11-08" },
  { from: "priya", to: "tom", origin: "introduction", context: "Priya introduced us after the hackathon showcase; he did our pitch deck visuals.", strength: 1 },
  { from: "you", to: "lena", origin: "school", context: "Uni flatmate for three years. Keeps my clusters honest and my board-game shelf full.", communities: ["Berlin Tech Board Games"], strength: 3 },
  { from: "you", to: "diego", origin: "in_person", context: "48h game jam team 'Null Pointer' — shipped 'Mothership Mono' together. Still jam annually.", projects: ["mothership-mono"], strength: 2, metAt: "2026-01-31" },
  { from: "you", to: "sara", origin: "in_person", context: "Asked the sharpest question at my GraphQL conference talk; runs Nordwind's platform team now.", strength: 1, metAt: "2025-09-12" },
  { from: "you", to: "alex", origin: "online", context: "Weekly AI Builders voice chats; sends the best arxiv digests. Shipped three side projects this year.", communities: ["AI Builders"], strength: 2 },
  { from: "maya", to: "nadia", origin: "work", context: "Contracted together at Fathom before Nadia went freelance.", strength: 2 },
  { from: "you", to: "nadia", origin: "introduction", context: "Maya recommended her for a contract; we co-built a design system for a fintech client.", projects: ["atlas-design-system"], strength: 2 },
  { from: "you", to: "felix", origin: "github", context: "Files excellent issues on graphkit and actually reads the docs. Wants to co-maintain someday.", projects: ["graphkit"], strength: 1 },
  { from: "maya", to: "jonas", origin: "github", context: "Contributed queue benchmarks to wqueue.", projects: ["wqueue"], strength: 1 },
  { from: "diego", to: "tom", origin: "in_person", context: "Game jam art collaboration — Tom animated all of Diego's sprites.", projects: ["mothership-mono"], strength: 2 },
];

// --- Seed function ---

/** Insert all demo people and edges into the database. */
export async function insertDemoData(db: PrismaClient) {
  const idByKey = new Map<string, string>();

  for (const p of DEMO_PEOPLE) {
    const created = await db.person.create({
      data: {
        name: p.name,
        nickname: p.nickname ?? null,
        avatarUrl: p.avatarUrl ?? null,
        headline: p.headline ?? null,
        company: p.company ?? null,
        location: p.location ?? null,
        email: p.email ?? null,
        skills: (p.skills ?? []) as unknown as Prisma.InputJsonValue,
        interests: (p.interests ?? []) as unknown as Prisma.InputJsonValue,
        tags: (p.tags ?? []) as unknown as Prisma.InputJsonValue,
        notes: p.notes ?? null,
        links: (p.links ?? {}) as unknown as Prisma.InputJsonValue,
        githubLogin: p.githubLogin ?? null,
        isSelf: p.isSelf ?? false,
      },
    });
    idByKey.set(p.key, created.id);
  }

  for (const e of DEMO_EDGES) {
    const sourceId = idByKey.get(e.from);
    const targetId = idByKey.get(e.to);
    if (!sourceId || !targetId) continue;
    await db.edge.create({
      data: {
        sourceId,
        targetId,
        origin: e.origin,
        context: e.context ?? null,
        communities: (e.communities ?? []) as unknown as Prisma.InputJsonValue,
        projects: (e.projects ?? []) as unknown as Prisma.InputJsonValue,
        strength: e.strength ?? 2,
        metAt: e.metAt ? new Date(e.metAt) : null,
      },
    });
  }
}
