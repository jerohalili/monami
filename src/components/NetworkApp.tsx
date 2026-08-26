"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphPayload, Person, Relationship } from "@/lib/model";
import { ORIGINS, ROADMAP } from "@/lib/model";
import GraphView, { type GraphApi } from "./GraphView";
import DetailsPanel from "./DetailsPanel";
import AddPersonModal from "./AddPersonModal";
import AddConnectionModal from "./AddConnectionModal";
import Modal from "./Modal";
import {
  IconFit,
  IconLink,
  IconLogo,
  IconPlus,
  IconSearch,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "./icons";

export default function NetworkApp() {
  const [data, setData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddEdge, setShowAddEdge] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const apiRef = useRef<GraphApi | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/graph");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as GraphPayload);
    } catch {
      setError("Could not load your constellation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectPerson = useCallback((id: string | null) => {
    setSelectedPersonId(id);
    setSelectedEdgeId(null);
  }, []);

  const selectEdge = useCallback((id: string | null) => {
    setSelectedEdgeId(id);
    setSelectedPersonId(id ? null : null);
  }, []);

  const matchedIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return null;
    const s = new Set<string>();
    for (const p of data.people) {
      const hay = [
        p.name,
        p.nickname ?? "",
        p.headline ?? "",
        p.company ?? "",
        ...p.skills,
        ...p.interests,
        ...p.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (hay.includes(q)) s.add(p.id);
    }
    return s;
  }, [query, data]);

  const selectedPerson = useMemo(
    () => (data && selectedPersonId ? data.people.find((p) => p.id === selectedPersonId) ?? null : null),
    [data, selectedPersonId]
  );
  const selectedEdge = useMemo(
    () => (data && selectedEdgeId ? data.edges.find((e) => e.id === selectedEdgeId) ?? null : null),
    [data, selectedEdgeId]
  );

  const seedDemo = async () => {
    setLoading(true);
    await fetch("/api/seed", { method: "POST" });
    await load();
  };

  if (loading && !data) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <IconLogo width={36} height={36} className="animate-pulse text-violet-400" />
          <p className="text-sm">Charting your constellation…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm text-slate-300">{error}</p>
          <button className="btn-primary" onClick={() => { setLoading(true); load(); }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const empty = data !== null && data.people.length === 0;

  return (
    <div className="relative h-dvh overflow-hidden">
      <GraphView
        data={data ?? { people: [], edges: [] }}
        matchedIds={matchedIds}
        selectedPersonId={selectedPersonId}
        selectedEdgeId={selectedEdgeId}
        onSelectPerson={selectPerson}
        onSelectEdge={selectEdge}
        apiRef={apiRef}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-center gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b101d]/80 px-3 py-2 backdrop-blur">
          <IconLogo width={20} height={20} className="text-violet-400" />
          <span className="text-sm font-semibold tracking-tight text-white">
            Mon<span className="text-violet-400">Ami</span>
          </span>
          {data && (
            <span className="ml-1 hidden text-xs text-slate-500 sm:inline">
              {data.people.length} people · {data.edges.length} connections
            </span>
          )}
        </div>

        <div className="pointer-events-auto relative min-w-[180px] flex-1 sm:max-w-md">
          <IconSearch
            width={15}
            height={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            className="field pl-9"
            placeholder="Search skills, interests, names…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && matchedIds && matchedIds.size > 0) {
                selectPerson(data!.people.find((p) => matchedIds.has(p.id))!.id);
              }
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-white"
              aria-label="Clear search"
            >
              <IconX width={14} height={14} />
            </button>
          )}
          {matchedIds && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-slate-500">
              {matchedIds.size} match{matchedIds.size === 1 ? "" : "es"}
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex gap-2">
          <button
            className="btn"
            onClick={() => setShowRoadmap(true)}
            title="What's coming next"
          >
            <span className="hidden sm:inline">Roadmap</span>
          </button>
          <button
            className="btn"
            onClick={() => setShowAddEdge(true)}
            disabled={!data || data.people.length < 2}
            title="Add connection"
          >
            <IconLink />
            <span className="hidden sm:inline">Connect</span>
          </button>
          <button className="btn-primary" onClick={() => setShowAddPerson(true)}>
            <IconPlus />
            <span className="hidden sm:inline">Add person</span>
          </button>
        </div>
      </header>

      <div className="absolute bottom-4 right-4 z-30 hidden flex-col gap-1.5 rounded-xl border border-white/10 bg-[#0b101d]/80 p-1.5 backdrop-blur sm:flex">
        <button className="btn border-transparent bg-transparent px-2 py-1.5" onClick={() => apiRef.current?.zoomIn()} title="Zoom in">
          <IconZoomIn />
        </button>
        <button className="btn border-transparent bg-transparent px-2 py-1.5" onClick={() => apiRef.current?.zoomOut()} title="Zoom out">
          <IconZoomOut />
        </button>
        <button className="btn border-transparent bg-transparent px-2 py-1.5" onClick={() => apiRef.current?.fit()} title="Fit view">
          <IconFit />
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-30 hidden max-w-[70%] flex-wrap gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-[#0b101d]/80 px-3 py-2 text-xs text-slate-400 backdrop-blur md:flex">
        {Object.entries(ORIGINS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: v.color }} />
            {v.label}
          </span>
        ))}
      </div>

      {(selectedPerson || selectedEdge) && (
        <aside className="absolute inset-x-0 bottom-0 z-40 max-h-[68vh] space-y-4 overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0b101d]/95 p-4 shadow-2xl backdrop-blur-md sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:rounded-none sm:rounded-l-2xl lg:w-[430px]">
          <DetailsPanel
            person={selectedPerson}
            edge={selectedEdge}
            data={data!}
            onClose={() => {
              selectPerson(null);
              setSelectedEdgeId(null);
            }}
            onSelectPerson={(id) => selectPerson(id)}
            onChanged={async () => {
              await load();
            }}
            onClearedSelection={() => selectPerson(null)}
            onEditEdgeSelected={selectPerson}
          />
        </aside>
      )}

      {empty && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[#0b101d]/90 p-6 text-center shadow-2xl backdrop-blur">
            <IconLogo width={40} height={40} className="mx-auto text-violet-400" />
            <h1 className="text-lg font-semibold text-white">Your sky is empty</h1>
            <p className="text-sm leading-relaxed text-slate-400">
              Add the first person to your constellation, or load a sample network to explore what MonAmi can do.
              GitHub integration and people &amp; project recommendations are on the roadmap.
            </p>
            <div className="flex flex-col gap-2">
              <button className="btn-primary w-full" onClick={() => setShowAddPerson(true)}>
                <IconPlus /> Add first person
              </button>
              <button className="btn w-full" onClick={seedDemo}>
                Load sample network
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddPerson && data && (
        <AddPersonModal
          onClose={() => setShowAddPerson(false)}
          onCreated={(person: Person) => {
            setShowAddPerson(false);
            load().then(() => selectPerson(person.id));
          }}
        />
      )}

      {showRoadmap && (
        <Modal title="MonAmi roadmap" onClose={() => setShowRoadmap(false)}>
          <ul className="space-y-2.5">
            {ROADMAP.map((m) => (
              <li key={m.label} className="flex items-center gap-2.5 text-sm">
                {m.done ? (
                  <span className="chip shrink-0 border-emerald-400/30 text-emerald-300">Done</span>
                ) : (
                  <span className="chip shrink-0 border-violet-400/30 text-violet-300">Soon</span>
                )}
                <span className={m.done ? "text-slate-500 line-through" : "text-slate-200"}>
                  {m.label}
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {showAddEdge && data && (
        <AddConnectionModal
          people={data.people}
          preselectedId={selectedPersonId}
          onClose={() => setShowAddEdge(false)}
          onCreated={(edge: Relationship) => {
            setShowAddEdge(false);
            load().then(() => setSelectedEdgeId(edge.id));
          }}
        />
      )}
    </div>
  );
}
