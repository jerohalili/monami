"use client";

import { ORIGINS, ORIGIN_KEYS } from "@/lib/model";

export interface EdgeFormState {
  origin: string;
  context: string;
  communities: string;
  projects: string;
  strength: string;
  metAt: string;
}

export const EMPTY_EDGE_FORM: EdgeFormState = {
  origin: "in_person",
  context: "",
  communities: "",
  projects: "",
  strength: "2",
  metAt: "",
};

export function edgeToForm(e: {
  origin: string;
  context: string | null;
  communities: string[];
  projects: string[];
  strength: number;
  metAt: string | null;
}): EdgeFormState {
  return {
    origin: e.origin,
    context: e.context ?? "",
    communities: e.communities.join(", "),
    projects: e.projects.join(", "),
    strength: String(e.strength),
    metAt: e.metAt ? e.metAt.slice(0, 10) : "",
  };
}

export function formToEdgePayload(f: EdgeFormState) {
  return {
    origin: f.origin,
    context: f.context.trim() || null,
    communities: f.communities,
    projects: f.projects,
    strength: Number(f.strength),
    metAt: f.metAt || null,
  };
}

const STRENGTH_LABELS: Record<string, string> = {
  "1": "Weak tie",
  "2": "Normal",
  "3": "Strong tie",
};

export function EdgeFormFields({
  value,
  onChange,
}: {
  value: EdgeFormState;
  onChange: (next: EdgeFormState) => void;
}) {
  const set =
    (k: keyof EdgeFormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">How you know them</label>
          <select className="field" value={value.origin} onChange={set("origin")}>
            {ORIGIN_KEYS.map((k) => (
              <option key={k} value={k} className="bg-[#0b101d]">
                {ORIGINS[k].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Tie strength</label>
          <select
            className="field"
            value={value.strength}
            onChange={set("strength")}
          >
            {["1", "2", "3"].map((s) => (
              <option key={s} value={s} className="bg-[#0b101d]">
                {STRENGTH_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Met on</label>
        <input
          type="date"
          className="field"
          value={value.metAt}
          onChange={set("metAt")}
        />
      </div>
      <div>
        <label className="label">Context — how & why you know them</label>
        <textarea
          className="field min-h-[80px]"
          value={value.context}
          onChange={set("context")}
          placeholder="Met her at a meetup, she does backend…"
        />
      </div>
      <div>
        <label className="label">Shared communities / servers</label>
        <input
          className="field"
          value={value.communities}
          onChange={set("communities")}
          placeholder="Indie Dev Lounge, AI Builders"
        />
      </div>
      <div>
        <label className="label">Shared projects</label>
        <input
          className="field"
          value={value.projects}
          onChange={set("projects")}
          placeholder="wqueue, game-jam-2026"
        />
      </div>
    </div>
  );
}
