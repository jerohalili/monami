// Person form: fields for name, headline, company, nickname, location, avatar,
// email, github, skills, interests, tags, links, and notes.
// Shared by AddPersonModal and DetailsPanel edit mode.

"use client";

import type { Person } from "@/lib/model";

export interface PersonFormState {
  name: string;
  nickname: string;
  avatarUrl: string;
  headline: string;
  company: string;
  location: string;
  email: string;
  githubLogin: string;
  skills: string;
  interests: string;
  tags: string;
  notes: string;
  linksRaw: string;
}

export const EMPTY_PERSON_FORM: PersonFormState = {
  name: "", nickname: "", avatarUrl: "", headline: "", company: "",
  location: "", email: "", githubLogin: "", skills: "", interests: "",
  tags: "", notes: "", linksRaw: "",
};

/** Convert a Person object into form state for editing. */
export function personToForm(p: Person): PersonFormState {
  return {
    name: p.name,
    nickname: p.nickname ?? "",
    avatarUrl: p.avatarUrl ?? "",
    headline: p.headline ?? "",
    company: p.company ?? "",
    location: p.location ?? "",
    email: p.email ?? "",
    githubLogin: p.githubLogin ?? "",
    skills: p.skills.join(", "),
    interests: p.interests.join(", "),
    tags: p.tags.join(", "),
    notes: p.notes ?? "",
    linksRaw: Object.entries(p.links).map(([k, v]) => `${k}: ${v}`).join("\n"),
  };
}

/** Convert form state into a POST/PATCH body. */
export function formToPersonPayload(f: PersonFormState) {
  const links: Record<string, string> = {};
  for (const line of f.linksRaw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i > 0 && i < t.length - 1) links[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return {
    name: f.name.trim(),
    nickname: f.nickname.trim() || null,
    avatarUrl: f.avatarUrl.trim() || null,
    headline: f.headline.trim() || null,
    company: f.company.trim() || null,
    location: f.location.trim() || null,
    email: f.email.trim() || null,
    githubLogin: f.githubLogin.trim() || null,
    skills: f.skills,
    interests: f.interests,
    tags: f.tags,
    notes: f.notes.trim() || null,
    links,
  };
}

export function PersonFormFields({ value, onChange, isNew }: {
  value: PersonFormState;
  onChange: (next: PersonFormState) => void;
  isNew: boolean;
}) {
  const set = (k: keyof PersonFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Name *</label>
        <input className="field" value={value.name} onChange={set("name")} placeholder="Ada Lovelace" autoFocus={isNew} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Headline</label>
          <input className="field" value={value.headline} onChange={set("headline")} placeholder="Backend engineer @ ..." />
        </div>
        <div>
          <label className="label">Company</label>
          <input className="field" value={value.company} onChange={set("company")} placeholder="Fathom" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Nickname / handle</label>
          <input className="field" value={value.nickname} onChange={set("nickname")} placeholder="maya.dev" />
        </div>
        <div>
          <label className="label">Location</label>
          <input className="field" value={value.location} onChange={set("location")} placeholder="Berlin" />
        </div>
      </div>
      <div>
        <label className="label">Avatar URL</label>
        <input className="field" value={value.avatarUrl} onChange={set("avatarUrl")} placeholder="https://..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Email</label>
          <input className="field" value={value.email} onChange={set("email")} placeholder="ada@example.com" />
        </div>
        <div>
          <label className="label">GitHub login</label>
          <input className="field" value={value.githubLogin} onChange={set("githubLogin")} placeholder="adalovelace" />
        </div>
      </div>
      <div>
        <label className="label">Skills</label>
        <input className="field" value={value.skills} onChange={set("skills")} placeholder="Go, Postgres, Kafka" />
      </div>
      <div>
        <label className="label">Interests</label>
        <input className="field" value={value.interests} onChange={set("interests")} placeholder="distributed systems, climbing" />
      </div>
      <div>
        <label className="label">Tags</label>
        <input className="field" value={value.tags} onChange={set("tags")} placeholder="backend, friend" />
      </div>
      <div>
        <label className="label">Links</label>
        <textarea className="field min-h-[64px] font-mono text-xs" value={value.linksRaw} onChange={set("linksRaw")} placeholder={"GitHub: https://github.com/...\nPortfolio: https://..."} />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea className="field min-h-[80px]" value={value.notes} onChange={set("notes")} placeholder="How you met, what you talked about, follow-ups..." />
      </div>
    </div>
  );
}
