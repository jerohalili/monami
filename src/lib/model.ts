// Tie origins + graph colors. Amber = in-person, purple = github_indirect.

export const ORIGINS = {
  in_person: { label: "Met in person", color: "#f59e0b" },
  github: { label: "GitHub", color: "#a78bfa" },
  github_indirect: { label: "GitHub (indirect)", color: "#7c3aed" },
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

// Person = node, Relationship = tie (strength 1-3).

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

// Stable node colors per name.
// TODO(jero): pull palettes into globals.css vars.

const DARK_NODE_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#06b6d4", "#f97316", "#84cc16", "#eab308", "#14b8a6",
];

const LIGHT_NODE_PALETTE = [
  "#4f46e5", "#7c3aed", "#db2777", "#d97706", "#059669",
  "#0891b2", "#ea580c", "#65a30d", "#ca8a04", "#0d9488",
];

// Name -> stable palette color.
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const palette = isLight ? LIGHT_NODE_PALETTE : DARK_NODE_PALETTE;
  return palette[h % palette.length];
}

// Constellation alias for canvas call sites.
export function nodeColor(name: string): string {
  return colorForName(name);
}
export const constellationColorFor = colorForName;

// DiceBear fallback, seeded by name.
export function autoAvatarUrl(name: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}&backgroundColor=334155`;
}

// "Ada Lovelace" -> "AL".
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
export const monamiInitials = initialsOf;

// hex -> rgba for canvas glows.
export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Shared traits, case-insensitive.
export function sharedCircleTraits(a: string[], b: string[]): string[] {
  const lower = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((s) => lower.has(s.toLowerCase()));
}
// Legacy alias.
export const overlap = sharedCircleTraits;

export interface RecommendedPerson {
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  company: string | null;
  location: string | null;
  skills: string[];
  interests: string[];
  githubLogin: string | null;
  score: number;
  reasons: string[];
  reasonDetails: {
    mutualConnections?: string[];
    sharedSkills?: string[];
    sharedInterests?: string[];
    company?: string;
    location?: string;
    contributedRepos?: string[];
  };
  candidateKey?: string;
}

export interface RecommendedRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  starred_by: number;
  reasons: string[];
  reasonDetails: {
    connectionsWhoStarred?: string[];
    languageMatch?: string;
  };
}
