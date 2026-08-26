import type { Prisma } from "@prisma/client";
import { isOrigin, type Origin, type Person, type Relationship } from "./model";

type PersonRow = Prisma.PersonGetPayload<object>;
type EdgeRow = Prisma.EdgeGetPayload<object>;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

function toRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && k && v) out[k] = v;
  }
  return out;
}

export function toStringArrayInput(value: unknown): string[] {
  if (Array.isArray(value)) return toStringArray(value);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function toLinksInput(value: unknown): Record<string, string> {
  return toRecord(value);
}

export function personDTO(p: PersonRow): Person {
  return {
    id: p.id,
    name: p.name,
    nickname: p.nickname,
    avatarUrl: p.avatarUrl,
    headline: p.headline,
    company: p.company,
    location: p.location,
    email: p.email,
    skills: toStringArray(p.skills),
    interests: toStringArray(p.interests),
    tags: toStringArray(p.tags),
    notes: p.notes,
    links: toRecord(p.links),
    githubLogin: p.githubLogin,
    discordId: p.discordId,
    isSelf: p.isSelf,
  };
}

export function edgeDTO(e: EdgeRow): Relationship {
  return {
    id: e.id,
    sourceId: e.sourceId,
    targetId: e.targetId,
    origin: isOrigin(e.origin) ? (e.origin as Origin) : "other",
    context: e.context,
    communities: toStringArray(e.communities),
    projects: toStringArray(e.projects),
    strength: e.strength,
    metAt: e.metAt ? e.metAt.toISOString() : null,
  };
}
