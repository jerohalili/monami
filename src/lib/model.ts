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
  isSelf: boolean;
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

export const ROADMAP = [
  { label: "People graph with relationship context", done: true },
  { label: "GitHub integration — repos, contributions, languages", done: false },

  { label: "People-recommendation engine", done: false },
  { label: "Project-recommendation engine", done: false },
  { label: "Adaptive feedback layer", done: false },
] as const;

const NODE_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#eab308",
  "#14b8a6",
];

export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NODE_PALETTE[h % NODE_PALETTE.length];
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function overlap(a: string[], b: string[]): string[] {
  const lower = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((s) => lower.has(s.toLowerCase()));
}
