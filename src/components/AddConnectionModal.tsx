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
  const [sourceId, setSourceId] = useState(preselectedId ?? "");
  const [targetId, setTargetId] = useState("");
  const [form, setForm] = useState<EdgeFormState>(EMPTY_EDGE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people]);

  const create = async () => {
    if (!sourceId || !targetId) {
      setError("Pick two people");
      return;
    }
    if (sourceId === targetId) {
      setError("Pick two different people");
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

  const selectCls = "field";

  return (
    <Modal title="Add connection" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Between</label>
            <select className={selectCls} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="" disabled className="bg-[#0b101d]">
                Select person…
              </option>
              {options.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0b101d]">
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">And</label>
            <select className={selectCls} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="" disabled className="bg-[#0b101d]">
                Select person…
              </option>
              {options.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === sourceId} className="bg-[#0b101d]">
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <EdgeFormFields value={form} onChange={setForm} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" onClick={create} disabled={saving}>
          {saving ? "Linking…" : "Create connection"}
        </button>
      </div>
    </Modal>
  );
}
