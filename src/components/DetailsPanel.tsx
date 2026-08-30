// Right-side panel showing person details or edge editor.
// PersonView: avatar, metadata, links, skills, interests, tags, connections.
// RelationshipEditor: edit origin, strength, context, communities, projects; delete edge.

"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import {
  ORIGINS, nodeColor, initialsOf, overlap,
  type GraphPayload, type Person, type Relationship,
} from "@/lib/model";
import { IconExternal, IconPencil, IconRefresh, IconTrash, IconX } from "./icons";
import { useConfirm } from "./ConfirmDialog";
import {
  EMPTY_PERSON_FORM, PersonFormFields, formToPersonPayload, personToForm,
  type PersonFormState,
} from "./PersonFormFields";
import {
  EdgeFormFields, edgeToForm, formToEdgePayload, type EdgeFormState,
} from "./EdgeFormFields";

// --- Shared sub-components ---

function Avatar({ p, size = 56 }: { p: Pick<Person, "name" | "avatarUrl">; size?: number }) {
  return p.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.avatarUrl} alt={p.name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size, border: "1px solid var(--border-strong)" }} />
  ) : (
    <div
      className="flex items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: nodeColor(p.name), fontSize: size * 0.36, color: "#0b101d" }}
    >
      {initialsOf(p.name)}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// --- Person view ---

function PersonView({ person, data, githubId, onClose, onSelectPerson, onEditClick, onDelete, onSyncGithub, syncingGithub }: {
  person: Person;
  data: GraphPayload;
  githubId: string | null;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onEditClick: () => void;
  onDelete: () => void;
  onSyncGithub?: () => Promise<void>;
  syncingGithub?: boolean;
}) {
  const isYou = person.tags.includes("me");
  const connections = useMemo(() =>
    data.edges
      .filter((e) => e.sourceId === person.id || e.targetId === person.id)
      .map((e) => ({ edge: e, otherId: e.sourceId === person.id ? e.targetId : e.sourceId }))
      .map(({ edge, otherId }) => ({ edge, other: data.people.find((p) => p.id === otherId) }))
      .filter((c): c is { edge: Relationship; other: Person } => Boolean(c.other)),
    [data, person.id],
  );

  return (
    <>
      <div className="flex items-start gap-4">
        <Avatar p={person} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold" style={{ color: "var(--text)" }}>
            {person.name}
            {isYou && (
              <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wider text-amber-300">You</span>
            )}
          </h2>
          {person.headline && <p className="text-sm" style={{ color: "var(--text)" }}>{person.headline}</p>}
          {(person.company || person.location) && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
              {[person.company, person.location].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button className="shrink-0 rounded-lg p-1 transition hover:opacity-80" style={{ color: "var(--text-dim)" }} onClick={onClose} aria-label="Close">
          <IconX width={18} height={18} />
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn flex-1" onClick={onEditClick}><IconPencil /> Edit</button>
        {isYou && !githubId && (
          <button
            className="btn flex-1"
            onClick={() => signIn("github")}
            title="Link your GitHub account"
          >
            Sign in with GitHub
          </button>
        )}
        {isYou && githubId && onSyncGithub && (
          <button
            className="btn flex-1"
            onClick={() => onSyncGithub()}
            disabled={syncingGithub}
            title="Sync profile from GitHub"
          >
            <IconRefresh className={syncingGithub ? "animate-spin" : ""} /> {syncingGithub ? "Syncing..." : "Sync GitHub"}
          </button>
        )}
        {!isYou && (
          <button className="btn text-red-300 hover:bg-red-500/10" onClick={onDelete} title="Delete person"><IconTrash /></button>
        )}
      </div>

      {/* Contact links */}
      {(person.email || person.githubLogin) && (
        <div className="mt-3 rounded-xl p-3 text-sm" style={{ border: "1px solid var(--border)", background: "var(--bg-hover)" }}>
          {person.email && <a href={`mailto:${person.email}`} className="block truncate hover:opacity-80" style={{ color: "var(--text)" }}>{person.email}</a>}
          {person.githubLogin && (
            <a href={`https://github.com/${person.githubLogin}`} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1.5 truncate text-violet-300 hover:text-violet-200">
              github.com/{person.githubLogin} <IconExternal width={12} height={12} />
            </a>
          )}
        </div>
      )}

      {/* External links */}
      {Object.keys(person.links).length > 0 && (
        <Section title="Links">
          {Object.entries(person.links).map(([k, v]) => (
            <a key={k} href={v} target="_blank" rel="noreferrer" className="chip hover:border-violet-400/40 hover:text-violet-200">
              {k} <IconExternal width={11} height={11} />
            </a>
          ))}
        </Section>
      )}

      {/* Skills */}
      {person.skills.length > 0 && (
        <Section title="Skills">
          {person.skills.map((s) => (
            <span key={s} className="chip">{s}</span>
          ))}
        </Section>
      )}

      {/* Interests */}
      {person.interests.length > 0 && (
        <Section title="Interests">
          {person.interests.map((i) => <span key={i} className="chip">{i}</span>)}
        </Section>
      )}

      {/* Tags */}
      {person.tags.length > 0 && (
        <Section title="Tags">
          {person.tags.map((t) => <span key={t} className="chip border-sky-400/30 text-sky-300">#{t}</span>)}
        </Section>
      )}

      {/* Notes */}
      {person.notes && (
        <div>
          <div className="label">Notes</div>
          <p className="whitespace-pre-wrap rounded-xl p-3 text-sm leading-relaxed" style={{ border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--text)" }}>{person.notes}</p>
        </div>
      )}

      {/* Connections list */}
      {connections.length > 0 && (
        <Section title={`Connections (${connections.length})`}>
          {connections.map(({ edge, other }) => (
            <button key={edge.id} onClick={() => onSelectPerson(other.id)} className="chip max-w-full gap-1.5 transition hover:border-violet-400/40 hover:text-violet-200" title={`${ORIGINS[edge.origin].label}${edge.context ? ` — ${edge.context}` : ""}`}>
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: ORIGINS[edge.origin].color }} />
              <span className="truncate">{other.name}</span>
            </button>
          ))}
        </Section>
      )}
    </>
  );
}

// --- Edge details (read-only) ---

function EdgeView({ edge, data, onClose, onSelectPerson, onEditClick, onDelete }: {
  edge: Relationship;
  data: GraphPayload;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onEditClick: () => void;
  onDelete: () => void;
}) {
  const source = data.people.find((p) => p.id === edge.sourceId);
  const target = data.people.find((p) => p.id === edge.targetId);
  const sharedTags = source && target ? overlap(source.tags.filter((t) => t !== "me"), target.tags) : [];

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>Connection details</div>
        <button className="shrink-0 rounded-lg p-1 transition hover:opacity-80" style={{ color: "var(--text-dim)" }} onClick={onClose} aria-label="Close">
          <IconX width={18} height={18} />
        </button>
      </div>

      {/* People */}
      <div className="mt-1 flex items-center gap-3 rounded-xl p-3" style={{ border: "1px solid var(--border)", background: "var(--bg-hover)" }}>
        <button className="flex items-center gap-2 truncate text-sm font-semibold hover:underline" style={{ color: "var(--text)" }} onClick={() => onSelectPerson(edge.sourceId)}>
          <Avatar p={{ name: source?.name ?? "?", avatarUrl: source?.avatarUrl ?? null }} size={32} />
          <span className="truncate">{source?.name ?? "?"}</span>
        </button>
        <span className="shrink-0 px-1 text-xs" style={{ color: ORIGINS[edge.origin].color }}>↔</span>
        <button className="flex items-center gap-2 truncate text-sm font-semibold hover:underline" style={{ color: "var(--text)" }} onClick={() => onSelectPerson(edge.targetId)}>
          <Avatar p={{ name: target?.name ?? "?", avatarUrl: target?.avatarUrl ?? null }} size={32} />
          <span className="truncate">{target?.name ?? "?"}</span>
        </button>
      </div>

      {/* Origin */}
      <div>
        <div className="label">Origin</div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: ORIGINS[edge.origin].color + "20", color: ORIGINS[edge.origin].color }}>
          <span className="h-2 w-2 rounded-full" style={{ background: ORIGINS[edge.origin].color }} />
          {ORIGINS[edge.origin].label}
        </span>
      </div>

      {/* Strength */}
      <div>
        <div className="label">Strength</div>
        <div className="flex gap-1.5">
          {([1, 2, 3] as const).map((s) => (
            <span key={s} className="inline-block h-2.5 rounded-full transition-all" style={{
              width: s === 1 ? 16 : s === 2 ? 32 : 48,
              background: s <= edge.strength ? "var(--text)" : "var(--border)",
            }} />
          ))}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>{["Weak", "Normal", "Strong"][edge.strength - 1]}</div>
      </div>

      {/* Context */}
      {edge.context && (
        <div>
          <div className="label">Context</div>
          <p className="whitespace-pre-wrap rounded-xl p-3 text-sm leading-relaxed" style={{ border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--text)" }}>{edge.context}</p>
        </div>
      )}

      {/* Communities */}
      {edge.communities.length > 0 && (
        <div>
          <div className="label">Communities</div>
          <div className="flex flex-wrap gap-1.5">
            {edge.communities.map((c) => <span key={c} className="chip">{c}</span>)}
          </div>
        </div>
      )}

      {/* Projects */}
      {edge.projects.length > 0 && (
        <div>
          <div className="label">Projects</div>
          <div className="flex flex-wrap gap-1.5">
            {edge.projects.map((p) => <span key={p} className="chip border-violet-400/30 text-violet-300">{p}</span>)}
          </div>
        </div>
      )}

      {/* Shared tags */}
      {sharedTags.length > 0 && (
        <div>
          <div className="label">Shared tags</div>
          <div className="flex flex-wrap gap-1.5">
            {sharedTags.map((t) => <span key={t} className="chip border-sky-400/30 text-sky-300">#{t}</span>)}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button className="btn flex-1" onClick={onEditClick}><IconPencil /> Edit</button>
        <button className="btn text-red-300 hover:bg-red-500/10" onClick={onDelete} title="Delete connection"><IconTrash /></button>
      </div>
    </>
  );
}

// --- Edge editor ---

function RelationshipEditor({ edge, data, onClose, onChanged, onDeleted, onSelectPerson }: {
  edge: Relationship;
  data: GraphPayload;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onSelectPerson: (id: string) => void;
}) {
  const [form, setForm] = useState<EdgeFormState>(edgeToForm(edge));
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const source = data.people.find((p) => p.id === edge.sourceId);
  const target = data.people.find((p) => p.id === edge.targetId);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/edges/${edge.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToEdgePayload(form)),
    });
    await onChanged();
    setSaving(false);
  };

  const remove = async () => {
    if (!(await confirm(`Remove the connection between ${source?.name} and ${target?.name}?`))) return;
    setSaving(true);
    await fetch(`/api/edges/${edge.id}`, { method: "DELETE" });
    await onDeleted();
    setSaving(false);
  };

  const sharedTags = source && target ? overlap(source.tags.filter((t) => t !== "me"), target.tags) : [];

  return (
    <>
      <button className="rounded-lg p-1 text-xs text-slate-500 hover:text-slate-200" onClick={onClose}>Close</button>
      <div className="mt-1 rounded-xl p-3" style={{ border: "1px solid var(--border)", background: "var(--bg-hover)" }}>
        <div className="flex items-center justify-between gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
          <button className="truncate hover:underline" onClick={() => onSelectPerson(edge.sourceId)}>{source?.name ?? "?"}</button>
          <span className="shrink-0 px-1 text-xs font-normal" style={{ color: ORIGINS[edge.origin].color }}>↔</span>
          <button className="truncate hover:underline" onClick={() => onSelectPerson(edge.targetId)}>{target?.name ?? "?"}</button>
        </div>
        {sharedTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sharedTags.map((t) => <span key={t} className="chip border-sky-400/30 text-sky-300">#{t}</span>)}
          </div>
        )}
      </div>
      <EdgeFormFields value={form} onChange={setForm} />
      <div className="flex gap-2 pt-1">
        <button className="btn-primary flex-1" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save connection"}</button>
        <button className="btn text-red-300 hover:bg-red-500/10" onClick={remove} disabled={saving}><IconTrash /></button>
      </div>
    </>
  );
}

// --- Main panel ---

export default function DetailsPanel({ person, edge, data, githubId, onClose, onSelectPerson, onChanged, onClearedSelection, onEditEdgeSelected, onSyncGithub, syncingGithub }: {
  person: Person | null;
  edge: Relationship | null;
  data: GraphPayload;
  githubId: string | null;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onChanged: () => Promise<void>;
  onClearedSelection: () => void;
  onEditEdgeSelected: (id: string) => void;
  onSyncGithub?: () => Promise<void>;
  syncingGithub?: boolean;
}) {
  const [personEditing, setPersonEditing] = useState(false);
  const [edgeEditing, setEdgeEditing] = useState(false);
  const [form, setForm] = useState<PersonFormState>(EMPTY_PERSON_FORM);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  // Reset editing when selection changes
  useEffect(() => { setPersonEditing(false); setEdgeEditing(false); }, [person?.id, edge?.id]);

  if (edge) {
    if (edgeEditing) {
      return (
        <div className="space-y-3">
          <RelationshipEditor key={edge.id} edge={edge} data={data} onClose={onClose} onChanged={async () => { await onChanged(); setEdgeEditing(false); }} onDeleted={onChanged} onSelectPerson={onSelectPerson} />
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <EdgeView
          key={edge.id}
          edge={edge}
          data={data}
          onClose={onClose}
          onSelectPerson={(id) => onEditEdgeSelected(id)}
          onEditClick={() => setEdgeEditing(true)}
          onDelete={async () => {
            const source = data.people.find((p) => p.id === edge.sourceId);
            const target = data.people.find((p) => p.id === edge.targetId);
            if (!(await confirm(`Remove the connection between ${source?.name} and ${target?.name}?`))) return;
            await fetch(`/api/edges/${edge.id}`, { method: "DELETE" });
            await onChanged();
          }}
        />
      </div>
    );
  }

  if (!person) return null;

  if (personEditing) {
    const save = async () => {
      if (!form.name.trim()) return;
      setSaving(true);
      await fetch(`/api/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPersonPayload(form)),
      });
      await onChanged();
      setSaving(false);
      setPersonEditing(false);
    };
    return (
      <div className="space-y-3">
        <button className="rounded-lg p-1 text-xs text-slate-500 hover:text-slate-200" onClick={() => setPersonEditing(false)}>Cancel</button>
        <PersonFormFields value={form} onChange={setForm} isNew={false} />
        <button className="btn-primary w-full" onClick={save} disabled={saving || !form.name.trim()}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PersonView
        key={person.id}
        person={person}
        data={data}
        githubId={githubId}
        onClose={onClose}
        onSelectPerson={(id) => onEditEdgeSelected(id)}
        onEditClick={() => { setForm(personToForm(person)); setPersonEditing(true); }}
        onDelete={async () => {
          if (!(await confirm(`Remove ${person.name} and all their connections?`))) return;
          await fetch(`/api/people/${person.id}`, { method: "DELETE" });
          onClearedSelection();
          await onChanged();
        }}
        onSyncGithub={onSyncGithub}
        syncingGithub={syncingGithub}
      />
    </div>
  );
}
