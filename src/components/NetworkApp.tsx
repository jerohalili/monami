// Main app shell: loads graph data, manages selection state, renders the
// graph canvas, header bar, details sidebar, and add-person/add-edge modals.

"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphPayload, Person, Relationship } from "@/lib/model";
import { ORIGINS } from "@/lib/model";
import GraphView, { type GraphApi } from "./GraphView";
import DetailsPanel from "./DetailsPanel";
import AddPersonModal from "./AddPersonModal";
import AddConnectionModal from "./AddConnectionModal";
import {
  IconFit, IconLink, IconLogo, IconPlus, IconRefresh,
  IconSearch, IconSun, IconMoon, IconX, IconZoomIn, IconZoomOut,
} from "./icons";
import { ConfirmProvider } from "./ConfirmDialog";

function getInitialTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function NetworkApp() {
  const { data: session } = useSession();
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);
  const [data, setData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddEdge, setShowAddEdge] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<{ id: string; name: string } | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const [syncingConnections, setSyncingConnections] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const apiRef = useRef<GraphApi | null>(null);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const githubId = (session?.user as { githubId?: string })?.githubId ?? null;

  const handleSyncConnections = async () => {
    setSyncingConnections(true);
    try {
      const res = await fetch("/api/github/sync-connections", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const parts: string[] = [];
        if (body.created > 0) parts.push(`${body.created} new`);
        if (body.matched > 0) parts.push(`${body.matched} updated`);
        if (body.skipped > 0) parts.push(`${body.skipped} skipped`);
        const msg = parts.length > 0 ? `Synced: ${parts.join(", ")}` : "Nothing to sync";
        const warnings: string[] = body.warnings ?? [];
        setToast({
          message: warnings.length > 0 ? `${msg} (${warnings.join("; ")})` : msg,
          type: warnings.length > 0 ? "error" : "success",
        });
        await load();
      } else {
        setToast({ message: body?.error ?? `Sync failed (HTTP ${res.status})`, type: "error" });
      }
    } catch {
      setToast({ message: "Sync failed — network error", type: "error" });
    }
    setSyncingConnections(false);
  };

  // --- Data fetching ---

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/graph", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as GraphPayload);
    } catch {
      setError("Could not load your constellation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Apply theme to document and persist.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // --- Selection ---

  const selectPerson = useCallback((id: string | null) => {
    setSelectedPersonId(id);
    setSelectedEdgeId(null);
  }, []);

  const selectEdge = useCallback((id: string | null) => {
    setSelectedEdgeId(id);
    setSelectedPersonId(null);
  }, []);

  // --- Search filtering ---

  const matchedIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return null;
    const s = new Set<string>();
    for (const p of data.people) {
      const hay = [p.name, p.nickname ?? ""].join(" ").toLowerCase();
      if (hay.includes(q)) s.add(p.id);
    }
    return s;
  }, [query, data]);

  const selectedPerson = useMemo(
    () => data && selectedPersonId ? data.people.find((p) => p.id === selectedPersonId) ?? null : null,
    [data, selectedPersonId],
  );
  const selectedEdge = useMemo(
    () => data && selectedEdgeId ? data.edges.find((e) => e.id === selectedEdgeId) ?? null : null,
    [data, selectedEdgeId],
  );

  // --- Loading / error states ---

  if (loading && !data) {
    return (
      <div className="flex h-dvh items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <div className="flex flex-col items-center gap-3">
          <IconLogo width={36} height={36} className="animate-pulse text-violet-400" />
          <p className="text-sm">Charting your constellation...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center" style={{ color: "var(--text)" }}>
        <div className="space-y-3">
          <p className="text-sm">{error}</p>
          <button className="btn-primary" onClick={() => { setLoading(true); load(); }}>Retry</button>
        </div>
      </div>
    );
  }

  const empty = data !== null && data.people.length === 0;

  return (
    <ConfirmProvider>
    <div className="relative h-dvh overflow-hidden">
      <GraphView
        data={data ?? { people: [], edges: [] }}
        matchedIds={matchedIds}
        selectedPersonId={selectedPersonId}
        selectedEdgeId={selectedEdgeId}
        onSelectPerson={selectPerson}
        onSelectEdge={selectEdge}
        apiRef={apiRef}
        pendingPlacement={pendingPlacement}
        onPlaceNode={async () => {
          const p = pendingPlacement;
          setPendingPlacement(null);
          await load();
          if (p) selectPerson(p.id);
        }}
        onReady={() => setGraphReady(true)}
      />

      {/* Loading overlay — covers everything while simulation runs */}
      {!graphReady && data && data.people.length > 0 && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ color: "var(--text-muted)", background: "var(--bg)" }}>
          <div className="flex flex-col items-center gap-3">
            <IconLogo width={36} height={36} className="animate-pulse text-violet-400" />
            <p className="text-sm">Charting your constellation...</p>
          </div>
        </div>
      )}

      {/* Header bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-center gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2 backdrop-blur" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <IconLogo width={20} height={20} className="text-violet-400" />
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Mon<span className="text-violet-400">Ami</span>
          </span>
          {data && (
            <span className="ml-1 hidden text-xs sm:inline" style={{ color: "var(--text-dim)" }}>
              {data.people.length} people · {data.edges.length} connections
            </span>
          )}
        </div>

        {/* Search */}
        <div className="pointer-events-auto relative min-w-45 flex-1 sm:max-w-md">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
          <input
            className="field rounded-xl backdrop-blur pl-9"
            placeholder="Search skills, interests, names..."
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
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 hover:opacity-80" style={{ color: "var(--text-dim)" }} aria-label="Clear search">
              <IconX width={14} height={14} />
            </button>
          )}
          {matchedIds && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-dim)" }}>
              {matchedIds.size} match{matchedIds.size === 1 ? "" : "es"}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pointer-events-auto flex gap-1 rounded-xl p-1 backdrop-blur" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <button className="btn" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
          <div className="w-px" style={{ background: "var(--border)" }} />
          <button className="btn" onClick={() => setShowAddEdge(true)} disabled={!data || data.people.length < 2} title="Add connection">
            <IconLink />
            <span className="hidden sm:inline">Connect</span>
          </button>
          {githubId && (
            <button
              className="btn"
              onClick={handleSyncConnections}
              disabled={syncingConnections}
              title="Import GitHub followers and following"
            >
              <IconRefresh className={syncingConnections ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowAddPerson(true)}>
            <IconPlus />
            <span className="hidden sm:inline">Add person</span>
          </button>
          <div className="w-px" style={{ background: "var(--border)" }} />
          <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })} title="Sign out">
            <span className="hidden sm:inline">Sign out</span>
            <span className="sm:hidden">...</span>
          </button>
        </div>
      </header>

      {/* Zoom controls */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-30 hidden flex-col gap-1.5 rounded-xl p-1.5 backdrop-blur sm:flex" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <button className="btn px-2 py-1.5" onClick={() => apiRef.current?.zoomIn()} title="Zoom in"><IconZoomIn /></button>
        <button className="btn px-2 py-1.5" onClick={() => apiRef.current?.zoomOut()} title="Zoom out"><IconZoomOut /></button>
        <button className="btn px-2 py-1.5" onClick={() => apiRef.current?.fit()} title="Fit view"><IconFit /></button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-30 hidden max-w-[80%] flex-wrap gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-xs backdrop-blur md:flex" style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}>
        {Object.entries(ORIGINS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: v.color }} />
            {v.label}
          </span>
        ))}
        <span className="ml-1 inline-flex items-center gap-1 pl-2" style={{ borderLeft: "1px solid var(--border)" }}>
          <span className="inline-block h-0 w-3 border-t border-dashed" style={{ borderColor: "var(--text-muted)" }} /> weak
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0 w-3 border-t-2" style={{ borderColor: "var(--text-muted)" }} /> normal
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0 w-3 border-t-[3px]" style={{ borderColor: "var(--text-muted)" }} /> strong
        </span>
      </div>

      {/* Details sidebar */}
      {(selectedPerson || selectedEdge) && (
        <aside className="absolute inset-x-0 bottom-0 z-40 max-h-[68vh] overflow-y-auto rounded-t-2xl shadow-2xl backdrop-blur-md sm:bottom-4 sm:top-4 sm:left-auto sm:right-4 sm:max-h-none sm:w-100 sm:overflow-y-auto sm:rounded-2xl lg:w-107.5" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <div className="space-y-4 p-4">
            <DetailsPanel
              person={selectedPerson}
              edge={selectedEdge}
              data={data!}
              githubId={(session?.user as { githubId?: string })?.githubId ?? null}
              onClose={() => { selectPerson(null); setSelectedEdgeId(null); }}
              onSelectPerson={(id) => selectPerson(id)}
              onChanged={async () => { await load(); }}
              onClearedSelection={() => selectPerson(null)}
              onEditEdgeSelected={selectPerson}
            />
          </div>
        </aside>
      )}

      {/* Empty state */}
      {empty && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl p-6 text-center shadow-2xl backdrop-blur" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <IconLogo width={40} height={40} className="mx-auto text-violet-400" />
            <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Your sky is empty</h1>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Add the first person to your constellation to get started.
            </p>
            <button className="btn-primary w-full" onClick={() => setShowAddPerson(true)}>
              <IconPlus /> Add first person
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddPerson && data && (
        <AddPersonModal
          onClose={() => setShowAddPerson(false)}
          onCreated={async (person: Person) => {
            setShowAddPerson(false);
            // Mark as pending *before* refreshing data. GraphView excludes a
            // pending node from graphData (and therefore from the physics
            // simulation) only while pendingPlacement is already set at the
            // moment the node first appears in `data`. If load() ran first,
            // there'd be a render where the new person is in `data` but
            // pendingPlacement is still null — GraphView would add it to its
            // persistent node map right then, and once it's in that map the
            // later pendingPlacement can no longer hide it. Setting it first
            // avoids that window entirely, so the graph only reacts once the
            // user actually clicks to place the node.
            setPendingPlacement({ id: person.id, name: person.name });
            await load();
          }}
        />
      )}
      {showAddEdge && data && (
        <AddConnectionModal
          people={data.people}
          preselectedId={selectedPersonId}
          onClose={() => setShowAddEdge(false)}
          onCreated={(edge: Relationship) => { setShowAddEdge(false); load().then(() => setSelectedEdgeId(edge.id)); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-opacity ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
    </ConfirmProvider>
  );
}
