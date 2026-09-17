// Prisma row -> clean DTO. Wren seed = You-node fallback avatar.

import type { Prisma } from "@prisma/client";
import { autoAvatarUrl, isOrigin, type Origin, type Person, type Relationship } from "./model";

type PersonRow = Prisma.PersonGetPayload<object>;
type EdgeRow = Prisma.EdgeGetPayload<object>;

// Json -> string[] guard.

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

function toRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && k && v) out[k] = v;
  }
  return out;
}

// Form inputs: comma string or string[].

export function optionalString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}
// Alias: trim empty to null.
export const trimToNull = optionalString;

export function toStringArrayInput(value: unknown): string[] {
  if (Array.isArray(value)) return toStringArray(value);
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}
export const splitCircleListInput = toStringArrayInput;

export function toLinksInput(value: unknown): Record<string, string> {
  return toRecord(value);
}
export const parseCircleLinks = toLinksInput;

export function personDTO(p: PersonRow): Person {
  return {
    id: p.id,
    name: p.name,
    nickname: p.nickname,
    avatarUrl: p.avatarUrl ?? autoAvatarUrl(p.name === "You" ? "Wren" : p.name),
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
  };
}

// Edge row -> tie, falls back to "other".
export const toCircleMember = personDTO;
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
export const toTie = edgeDTO;
