"use client";

import { useMemo, useState } from "react";
import {
  ORIGINS,
  colorForName,
  initialsOf,
  overlap,
  type GraphPayload,
  type Person,
  type Relationship,
} from "@/lib/model";
import { IconExternal, IconPencil, IconTrash } from "./icons";
import {
  EMPTY_PERSON_FORM,
  PersonFormFields,
  formToPersonPayload,
  personToForm,
  type PersonFormState,
} from "./PersonFormFields";
import {
  EdgeFormFields,
  edgeToForm,
  formToEdgePayload,
  type EdgeFormState,
} from "./EdgeFormFields";

const STRENGTH_LABELS: Record<number, string> = {
  1: "Weak tie",
  2: "Normal",
  3: "Strong tie",
};

function Avatar({
  p,
  size = 56,
}: {
  p: Pick<Person, "name" | "avatarUrl" | "isSelf">;
  size?: number;
}) {
  return p.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p.avatarUrl}
      alt={p.name}
      width={size}
      height={size}
      className="rounded-full border border-white/15 object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-[#0b101d]"
      style={{
        width: size,
        height: size,
        background: p.isSelf ? "#fbbf24" : colorForName(p.name),
        fontSize: size * 0.36,
      }}
    >
      {initialsOf(p.name)}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="label">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PersonView({
  person,
  data,
  onClose,
  onSelectPerson,
  onEditClick,
  onDelete,
}: {
  person: Person;
  data: GraphPayload;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onEditClick: () => void;
  onDelete: () => void;
}) {
  const self = useMemo(() => data.people.find((p) => p.isSelf) ?? null, [data.people]);
  const connections = useMemo(
    () =>
      data.edges
        .filter((e) => e.sourceId === person.id || e.targetId === person.id)
        .map((e) => ({
          edge: e,
          otherId: e.sourceId === person.id ? e.targetId : e.sourceId,
        }))
        .map(({ edge, otherId }) => ({ edge, other: data.people.find((p) => p.id === otherId) }))
        .filter((c): c is { edge: Relationship; other: Person } => Boolean(c.other)),
    [data, person.id]
  );
  const sharedInterests = self && !person.isSelf ? overlap(person.interests, self.interests) : [];
  const sharedSkills = self && !person.isSelf ? overlap(person.skills, self.skills) : [];

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <button className="rounded-lg p-1 text-xs text-slate-500 hover:text-slate-200" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mt-1 flex items-start gap-4">
        <Avatar p={person} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-white">
            {person.name}
            {person.isSelf && (
              <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wider text-amber-300">
                You
              </span>
            )}
          </h2>
          {person.headline && <p className="text-sm text-slate-300">{person.headline}</p>}
          {(person.company || person.location) && (
            <p className="mt-0.5 text-xs text-slate-500">
              {[person.company, person.location].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn flex-1" onClick={onEditClick}>
          <IconPencil /> Edit
        </button>
        {!person.isSelf && (
          <button
            className="btn text-red-300 hover:bg-red-500/10"
            onClick={onDelete}
            title="Delete person"
          >
            <IconTrash />
          </button>
        )}
      </div>

      {(person.email || person.githubLogin || person.discordId) && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
          {person.email && (
            <a href={`mailto:${person.email}`} className="block truncate text-slate-300 hover:text-white">
              {person.email}
            </a>
          )}
          {person.githubLogin && (
            <a
              href={`https://github.com/${person.githubLogin}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-center gap-1.5 truncate text-violet-300 hover:text-violet-200"
            >
              github.com/{person.githubLogin} <IconExternal width={12} height={12} />
            </a>
          )}
          {person.discordId && (
            <div className="mt-1 truncate text-[#8ea1ff]">{person.discordId}</div>
          )}
        </div>
      )}

      {!person.isSelf && (
        <div className="flex gap-2">
          <button
            className="btn flex-1 text-slate-500"
            disabled
            title="Planned (Milestone 2): pull repos, contributions and languages onto this node."
          >
            GitHub sync
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              soon
            </span>
          </button>
          <button
            className="btn flex-1 text-slate-500"
            disabled
            title="Planned (Milestone 3): attach shared servers to connections automatically."
          >
            Discord sync
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              soon
            </span>
          </button>
        </div>
      )}

      {Object.keys(person.links).length > 0 && (
        <Section title="Links">
          {Object.entries(person.links).map(([k, v]) => (
            <a key={k} href={v} target="_blank" rel="noreferrer" className="chip hover:border-violet-400/40 hover:text-violet-200">
              {k} <IconExternal width={11} height={11} />
            </a>
          ))}
        </Section>
      )}

      {sharedInterests.length > 0 && (
        <Section title={`Shared interests with ${self?.name ?? "you"}`}>
          {sharedInterests.map((i) => (
            <span key={i} className="chip border-emerald-400/30 text-emerald-300">
              {i}
            </span>
          ))}
        </Section>
      )}

      {person.skills.length > 0 && (
        <Section title={`Skills${sharedSkills.length ? ` · shared: ${sharedSkills.join(", ")}` : ""}`}>
          {person.skills.map((s) => (
            <span
              key={s}
              className={sharedSkills.includes(s) ? "chip border-emerald-400/30 text-emerald-300" : "chip"}
            >
              {s}
            </span>
          ))}
        </Section>
      )}

      {person.interests.length > 0 && (
        <Section title="Interests">
          {person.interests.map((i) => (
            <span key={i} className="chip">
              {i}
            </span>
          ))}
        </Section>
      )}

      {person.tags.length > 0 && (
        <Section title="Tags">
          {person.tags.map((t) => (
            <span key={t} className="chip border-sky-400/30 text-sky-300">
              #{t}
            </span>
          ))}
        </Section>
      )}

      {person.notes && (
        <div>
          <div className="label">Notes</div>
          <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-relaxed text-slate-300">
            {person.notes}
          </p>
        </div>
      )}

      {connections.length > 0 && (
        <Section title={`Connections (${connections.length})`}>
          {connections.map(({ edge, other }) => (
            <button
              key={edge.id}
              onClick={() => onSelectPerson(other.id)}
              className="chip max-w-full gap-1.5 transition hover:border-violet-400/40 hover:text-violet-200"
              title={`${ORIGINS[edge.origin].label}${edge.context ? ` — ${edge.context}` : ""}`}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: ORIGINS[edge.origin].color }}
              />
              <span className="truncate">{other.name}</span>
            </button>
          ))}
        </Section>
      )}
    </>
  );
}

function RelationshipEditor({
  edge,
  data,
  onClose,
  onChanged,
  onDeleted,
  onSelectPerson,
}: {
  edge: Relationship;
  data: GraphPayload;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onSelectPerson: (id: string) => void;
}) {
  const [form, setForm] = useState<EdgeFormState>(edgeToForm(edge));
  const [saving, setSaving] = useState(false);
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
    if (!window.confirm(`Remove the connection between ${source?.name} and ${target?.name}?`)) return;
    setSaving(true);
    await fetch(`/api/edges/${edge.id}`, { method: "DELETE" });
    await onDeleted();
    setSaving(false);
  };

  const sharedTags =
    source && target ? overlap(source.tags.filter((t) => t !== "me"), target.tags) : [];

  return (
    <>
      <button className="rounded-lg p-1 text-xs text-slate-500 hover:text-slate-200" onClick={onClose}>
        Close
      </button>
      <div className="mt-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between gap-2 text-sm font-semibold text-white">
          <button className="truncate hover:underline" onClick={() => onSelectPerson(edge.sourceId)}>
            {source?.name ?? "?"}
          </button>
          <span className="shrink-0 px-1 text-xs font-normal" style={{ color: ORIGINS[edge.origin].color }}>
            ↔
          </span>
          <button className="truncate hover:underline" onClick={() => onSelectPerson(edge.targetId)}>
            {target?.name ?? "?"}
          </button>
        </div>
        {sharedTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sharedTags.map((t) => (
              <span key={t} className="chip border-sky-400/30 text-sky-300">#{t}</span>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Shared-server detection via the Discord integration is coming soon.
        </p>
      </div>
      <EdgeFormFields value={form} onChange={setForm} />
      <div className="flex gap-2 pt-1">
        <button className="btn-primary flex-1" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save connection"}
        </button>
        <button className="btn text-red-300 hover:bg-red-500/10" onClick={remove} disabled={saving}>
          <IconTrash />
        </button>
      </div>
    </>
  );
}

export default function DetailsPanel({
  person,
  edge,
  data,
  onClose,
  onSelectPerson,
  onChanged,
  onClearedSelection,
  onEditEdgeSelected,
}: {
  person: Person | null;
  edge: Relationship | null;
  data: GraphPayload;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onChanged: () => Promise<void>;
  onClearedSelection: () => void;
  onEditEdgeSelected: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PersonFormState>(EMPTY_PERSON_FORM);
  const [saving, setSaving] = useState(false);

  if (edge) {
    return (
      <div className="space-y-3">
        <RelationshipEditor
          key={edge.id}
          edge={edge}
          data={data}
          onClose={onClose}
          onChanged={onChanged}
          onDeleted={onChanged}
          onSelectPerson={onSelectPerson}
        />
      </div>
    );
  }

  if (!person) return null;

  if (editing) {
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
      setEditing(false);
    };
    return (
      <div className="space-y-3">
        <button className="rounded-lg p-1 text-xs text-slate-500 hover:text-slate-200" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <PersonFormFields value={form} onChange={setForm} isNew={false} />
        <button className="btn-primary w-full" onClick={save} disabled={saving || !form.name.trim()}>
          {saving ? "Saving…" : "Save changes"}
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
        onClose={onClose}
        onSelectPerson={(id) => onEditEdgeSelected(id)}
        onEditClick={() => {
          setForm(personToForm(person));
          setEditing(true);
        }}
        onDelete={async () => {
          if (!window.confirm(`Remove ${person.name} and all their connections?`)) return;
          await fetch(`/api/people/${person.id}`, { method: "DELETE" });
          onClearedSelection();
          await onChanged();
        }}
      />
    </div>
  );
}
