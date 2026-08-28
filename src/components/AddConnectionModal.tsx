// Add connection modal: searchable person picker + edge form.
// Select two people from a scrollable list, then fill in relationship details.

"use client";

import { useMemo, useState } from "react";
import Modal from "./Modal";
import {
  EdgeFormFields,
  EMPTY_EDGE_FORM,
  formToEdgePayload,
  type EdgeFormState,
} from "./EdgeFormFields";
import type { Person, Relationship } from "@/lib/model";
import { nodeColor, initialsOf } from "@/lib/model";
import { IconSearch, IconX } from "./icons";

export default function AddConnectionModal({
  people,
  preselectedId,
  onClose,
  onCreated,
}: {
  people: Person[];
  preselectedId: string | null;
  onClose: () => void;
  onCreated: (edge: Relationship) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    preselectedId ? [preselectedId] : [],
  );
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<EdgeFormState>(EMPTY_EDGE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => {
      const hay = [
        p.name, p.nickname ?? "", p.headline ?? "", p.company ?? "",
        ...p.skills, ...p.tags,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query]);

  const toggle = (id: string) => {
    setError(null);
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const removeSelected = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    setError(null);
  };

  const sourceId = selectedIds[0] ?? "";
  const targetId = selectedIds[1] ?? "";
  const bothSelected = sourceId && targetId;

  const create = async () => {
    if (!bothSelected) {
      setError("Pick two people");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, targetId, ...formToEdgePayload(form) }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setError(b?.error ?? "Could not create connection");
      return;
    }
    onCreated((await res.json()) as Relationship);
  };

  const personById = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of people) m.set(p.id, p);
    return m;
  }, [people]);

  return (
    <Modal title="Add connection" onClose={onClose}>
      <div className="space-y-3">
        {/* Selected chips */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedIds.map((id, i) => {
              const p = personById.get(id);
              if (!p) return null;
              return (
                <button
                  key={id}
                  onClick={() => removeSelected(id)}
                  className="flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-400/10 px-3 py-1.5 text-sm text-violet-200 transition hover:bg-violet-400/20"
                >
                  <span className="text-xs text-violet-400">{i === 0 ? "From" : "To"}</span>
                  <span className="font-medium">{p.name}</span>
                  <IconX width={12} height={12} className="text-violet-400/60" />
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
          <input
            className="field rounded-xl backdrop-blur pl-9"
            placeholder="Search people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 hover:opacity-80" style={{ color: "var(--text-dim)" }}>
              <IconX width={14} height={14} />
            </button>
          )}
        </div>

        {/* Person list */}
        <div className="max-h-70 space-y-1 overflow-y-auto rounded-xl p-1" style={{ border: "1px solid var(--border)", background: "var(--bg-hover)" }}>
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-sm" style={{ color: "var(--text-dim)" }}>No people found</p>
          )}
          {filtered.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            const idx = selectedIds.indexOf(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition"
                style={{
                  background: isSelected ? "rgba(139,92,246,0.15)" : "",
                  outline: isSelected ? "1px solid rgba(139,92,246,0.4)" : "",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = ""; }}
              >
                {/* Avatar */}
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ border: "1px solid var(--border-strong)" }} />
                ) : (
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ background: nodeColor(p.name), color: "#0b101d" }}
                  >
                    {initialsOf(p.name)}
                  </div>
                )}
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{p.name}</div>
                  {(p.headline || p.company) && (
                    <div className="truncate text-xs" style={{ color: "var(--text-dim)" }}>
                      {[p.headline, p.company].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                {/* Selection indicator */}
                {isSelected ? (
                  <span className="shrink-0 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    {idx === 0 ? "From" : "To"}
                  </span>
                ) : (
                  <div className="h-5 w-5 shrink-0 rounded-full" style={{ border: "1px solid var(--border-strong)" }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Edge form — shown once two people selected */}
        {bothSelected && (
          <>
            <div className="border-t border-white/10 pt-3">
              <EdgeFormFields value={form} onChange={setForm} />
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          className="btn-primary w-full"
          onClick={create}
          disabled={saving || !bothSelected}
        >
          {saving ? "Linking..." : "Create connection"}
        </button>
      </div>
    </Modal>
  );
}
