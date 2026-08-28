// Prisma row -> API DTO transformers.
// Keeps API consumers decoupled from Prisma column shapes.

import type { Prisma } from "@prisma/client";
import { autoAvatarUrl, isOrigin, type Origin, type Person, type Relationship } from "./model";

type PersonRow = Prisma.PersonGetPayload<object>;
type EdgeRow = Prisma.EdgeGetPayload<object>;

// --- Internal helpers ---

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

// --- Public input helpers (used by API route handlers) ---

/** Parse a comma-separated string or array into a clean string[] */
export function toStringArrayInput(value: unknown): string[] {
  if (Array.isArray(value)) return toStringArray(value);
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** Parse a links object from the request body. */
export function toLinksInput(value: unknown): Record<string, string> {
  return toRecord(value);
}

// --- DTO mappers ---

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
