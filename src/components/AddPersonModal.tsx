"use client";

import { useState } from "react";
import Modal from "./Modal";
import {
  EMPTY_PERSON_FORM,
  PersonFormFields,
  formToPersonPayload,
  type PersonFormState,
} from "./PersonFormFields";
import type { Person } from "@/lib/model";

export default function AddPersonModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (person: Person) => void;
}) {
  const [form, setForm] = useState<PersonFormState>(EMPTY_PERSON_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToPersonPayload(form)),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setError(b?.error ?? "Could not create person");
      return;
    }
    onCreated((await res.json()) as Person);
  };

  return (
    <Modal title="Add person" onClose={onClose}>
      <div className="space-y-3">
        <PersonFormFields value={form} onChange={setForm} isNew />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" onClick={create} disabled={saving}>
          {saving ? "Adding…" : "Add to constellation"}
        </button>
      </div>
    </Modal>
  );
}
