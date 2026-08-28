// Relationship origin types with display labels and colors for the graph.

export const ORIGINS = {
  in_person: { label: "Met in person", color: "#f59e0b" },
  github: { label: "GitHub", color: "#a78bfa" },
  school: { label: "School", color: "#38bdf8" },
  work: { label: "Work", color: "#34d399" },
  introduction: { label: "Introduction", color: "#f472b6" },
  online: { label: "Online", color: "#2dd4bf" },
  other: { label: "Other", color: "#94a3b8" },
} as const;

export type Origin = keyof typeof ORIGINS;
export const ORIGIN_KEYS = Object.keys(ORIGINS) as Origin[];

export function isOrigin(v: unknown): v is Origin {
  return typeof v === "string" && ORIGIN_KEYS.includes(v as Origin);
}

// --- Domain types (API response shapes) ---

export interface Person {
  id: string;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  headline: string | null;
  company: string | null;
  location: string | null;
  email: string | null;
  skills: string[];
  interests: string[];
  tags: string[];
  notes: string | null;
  links: Record<string, string>;
  githubLogin: string | null;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  origin: Origin;
  context: string | null;
  communities: string[];
  projects: string[];
  strength: number;
  metAt: string | null;
}

export interface GraphPayload {
  people: Person[];
  edges: Relationship[];
}

// --- Utility functions ---

const NODE_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#06b6d4", "#f97316", "#84cc16", "#eab308", "#14b8a6",
];

/** Deterministic color from a name string. */
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NODE_PALETTE[h % NODE_PALETTE.length];
}

/** Node fill color: amber for "You", palette hash for everyone else. */
export function nodeColor(name: string): string {
  return name === "You" ? "#fbbf24" : colorForName(name);
}

/** Auto-generated avatar URL using Dicebear notionists style. */
export function autoAvatarUrl(name: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}&backgroundColor=334155`;
}

/** First two initials from a name. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Convert hex color to rgba string. */
export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Find overlapping strings between two arrays (case-insensitive). */
export function overlap(a: string[], b: string[]): string[] {
  const lower = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((s) => lower.has(s.toLowerCase()));
}
