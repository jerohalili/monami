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
import DiscoverView from "./DiscoverView";
import {
  IconFit, IconLink, IconLogo, IconMore, IconPlus, IconRefresh,
  IconSearch, IconSettings, IconSun, IconMoon, IconX, IconZoomIn, IconZoomOut,
  IconCompass, IconGitBranch,
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
  const everLoadedRef = useRef(false);
  const [graphReady, setGraphReady] = useState(false);
  const [syncingConnections, setSyncingConnections] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [syncingIndirect, setSyncingIndirect] = useState(false);
  const [showSyncMenu, setShowSyncMenu] = useState(false);
  const [showIndirectMenu, setShowIndirectMenu] = useState(false);
  const [indirectMax, setIndirectMax] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const apiRef = useRef<GraphApi | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [activeTab, setActiveTab] = useState<"network" | "discover">("network");
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Close indirect menu when clicking outside
  useEffect(() => {
    if (!showIndirectMenu) return;
    const handler = () => setShowIndirectMenu(false);
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [showIndirectMenu]);

  // Close sync menu when clicking outside
  useEffect(() => {
    if (!showSyncMenu) return;
    const handler = () => setShowSyncMenu(false);
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [showSyncMenu]);

  // Close overflow menu when clicking outside
  useEffect(() => {
    if (!showOverflowMenu) return;
    const handler = () => setShowOverflowMenu(false);
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [showOverflowMenu]);

  const githubId = (session?.user as { githubId?: string })?.githubId ?? null;

  const handleSyncConnections = async (filter: "all" | "following" | "mutual" = "all") => {
    setSyncingConnections(true);
    try {
      const res = await fetch("/api/github/sync-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) {
        const parts: string[] = [];
        if (body.created > 0) parts.push(`${body.created} new`);
        if (body.matched > 0) parts.push(`${body.matched} updated`);
        if (body.crossEdgesCreated > 0) parts.push(`${body.crossEdgesCreated} cross-connections`);
        if (body.skipped > 0) parts.push(`${body.skipped} skipped`);
        const msg = parts.length > 0 ? `Synced: ${parts.join(", ")}` : "Nothing to sync";
        const warnings: string[] = body.warnings ?? [];
        setToast({
          message: warnings.length > 0 ? `${msg} (${warnings.join("; ")})` : msg,
          type: warnings.length > 0 ? "error" : "success",
        });
      } else {
        setToast({ message: body?.error ?? `Sync failed (HTTP ${res.status})`, type: "error" });
      }
      await load();
    } catch {
      setToast({ message: "Sync failed — network error", type: "error" });
      await load();
    }
    setSyncingConnections(false);
  };

  const handleSyncGithub = async () => {
    setSyncingGithub(true);
    try {
      const res = await fetch("/api/github/sync-profile", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setToast({ message: "Profile synced from GitHub", type: "success" });
      } else {
        setToast({ message: body?.error ?? `Sync failed (HTTP ${res.status})`, type: "error" });
      }
      await load();
    } catch {
      setToast({ message: "Sync failed — network error", type: "error" });
      await load();
    }
    setSyncingGithub(false);
  };

  const handleSyncIndirect = async (maxConnections: number) => {
    setSyncingIndirect(true);
    try {
      const res = await fetch("/api/github/sync-indirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxConnections }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) {
        const parts: string[] = [];
        if (body.cleanedUp > 0) parts.push(`${body.cleanedUp} old removed`);
        if (body.created > 0) parts.push(`${body.created} discovered`);
        if (body.skipped > 0) parts.push(`${body.skipped} skipped`);
        const msg = parts.length > 0
          ? `Explored ${body.connectionsExplored} connections — ${parts.join(", ")}`
          : "No new indirect connections found";
        const warnings: string[] = body.warnings ?? [];
        setToast({
          message: warnings.length > 0 ? `${msg} (${warnings.join("; ")})` : msg,
          type: warnings.length > 0 ? "error" : "success",
        });
      } else {
        setToast({ message: body?.error ?? `Discover failed (HTTP ${res.status})`, type: "error" });
      }
      await load();
    } catch {
      setToast({ message: "Discover failed — network error", type: "error" });
      await load();
    }
    setSyncingIndirect(false);
  };

  // --- Data fetching ---

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/graph", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.error === "Session expired") {
          setError("Session expired. Please sign in again.");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      setData((await res.json()) as GraphPayload);
      everLoadedRef.current = true;
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

  if (error && !data) {
    const isSessionExpired = error.includes("Session expired");
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center" style={{ color: "var(--text)" }}>
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <IconLogo width={32} height={32} className="text-violet-400" />
            <p className="text-sm">{error}</p>
          </div>
          <div className="flex gap-2 justify-center">
            {!isSessionExpired && (
              <button className="btn-primary" onClick={() => { setLoading(true); load(); }}>Retry</button>
            )}
            <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!everLoadedRef.current && !data) {
    return (
      <div className="flex h-dvh items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <div className="flex flex-col items-center gap-3">
          <IconLogo width={36} height={36} className="animate-pulse text-violet-400" />
          <p className="text-sm">Charting your constellation...</p>
        </div>
      </div>
    );
  }

  const empty = data !== null && data.people.length === 0;

  return (
    <ConfirmProvider>
    <div className="relative h-dvh overflow-hidden flex flex-col">
      <div className={`absolute inset-0 ${activeTab !== "network" ? "invisible pointer-events-none" : ""}`}>
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
      </div>
      {/* Header bar */}
      <header className="pointer-events-none relative z-30 flex flex-row flex-wrap items-center gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2 backdrop-blur" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <IconLogo width={20} height={20} className="text-violet-400" />
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Mon<span className="text-violet-400">Ami</span>
          </span>
          {data && (
            <span className="ml-1 hidden text-xs lg:inline" style={{ color: "var(--text-dim)" }}>
              {data.people.length} people · {data.edges.length} connections
            </span>
          )}
        </div>

        {/* Search */}
        <div className="pointer-events-auto relative min-w-40 flex-1 lg:max-w-md">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
          <input
            className="field rounded-xl backdrop-blur pl-9"
            placeholder="Search..."
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
        <div className="pointer-events-auto flex shrink-0 gap-1 rounded-xl p-1 backdrop-blur" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <button
            className={`btn ${activeTab === "network" ? "bg-violet-500/20 text-violet-400" : ""}`}
            onClick={() => setActiveTab("network")}
            title="Network view"
          >
            <IconGitBranch />
            <span className="hidden lg:inline">Network</span>
          </button>
          <button
            className={`btn ${activeTab === "discover" ? "bg-violet-500/20 text-violet-400" : ""}`}
            onClick={() => setActiveTab("discover")}
            title="Discover view"
          >
            <IconCompass />
            <span className="hidden lg:inline">Discover</span>
          </button>
          <div className="w-px" style={{ background: "var(--border)" }} />
          <button className="btn" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
          <div className="w-px" style={{ background: "var(--border)" }} />
          <button className="btn" onClick={() => setShowAddEdge(true)} disabled={!data || data.people.length < 2} title="Add connection">
            <IconLink />
            <span className="hidden lg:inline">Connect</span>
          </button>

          {/* Desktop: Sync, Expand inline */}
          {githubId && (
            <>
              <div className="relative hidden lg:block">
                <button
                  className="btn"
                  onClick={() => setShowSyncMenu((v) => !v)}
                  disabled={syncingConnections}
                  title="Import GitHub followers and following"
                >
                  <IconRefresh className={syncingConnections ? "animate-spin" : ""} />
                  <span className="hidden lg:inline">Sync</span>
                </button>
                {showSyncMenu && (
                  <div
                    className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl p-2 shadow-xl"
                    style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
                  >
                    <div className="px-2 py-1 text-xs font-medium" style={{ color: "var(--text-dim)" }}>
                      Sync filter
                    </div>
                    {([
                      { value: "all" as const, label: "All followers & following" },
                      { value: "following" as const, label: "Following only" },
                      { value: "mutual" as const, label: "Mutual only" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/5"
                        style={{ color: "var(--text)" }}
                        onClick={() => {
                          setShowSyncMenu(false);
                          handleSyncConnections(opt.value);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative hidden lg:block">
                <button
                  className="btn"
                  onClick={() => setShowIndirectMenu((v) => !v)}
                  disabled={syncingIndirect}
                  title="Discover followers/following of your connections"
                >
                  <IconCompass className={syncingIndirect ? "animate-spin" : ""} />
                  <span className="hidden lg:inline">Expand</span>
                </button>
                {showIndirectMenu && (
                  <div
                    className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl p-2 shadow-xl"
                    style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
                  >
                    <div className="px-2 py-1 text-xs font-medium" style={{ color: "var(--text-dim)" }}>
                      Max connections to explore
                    </div>
                    {[0, 5, 10, 20, 50].map((n) => (
                      <button
                        key={n}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/5"
                        style={{ color: "var(--text)" }}
                        onClick={() => {
                          setIndirectMax(n);
                          setShowIndirectMenu(false);
                          handleSyncIndirect(n);
                        }}
                      >
                        <span className={`inline-block h-2 w-2 rounded-full ${indirectMax === n ? "bg-violet-400" : "bg-transparent"}`} style={{ border: "1px solid var(--border)" }} />
                        {n === 0 ? "Remove expanded" : `${n} connections`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <button className="btn-primary" onClick={() => setShowAddPerson(true)}>
            <IconPlus />
            <span className="hidden lg:inline">Add person</span>
          </button>

          {/* Desktop: Settings, Sign out inline */}
          <div className="w-px hidden lg:block" style={{ background: "var(--border)" }} />
          <button className="btn hidden lg:inline-flex" onClick={() => window.location.href = "/settings"} title="Settings">
            <IconSettings />
            <span className="hidden lg:inline">Settings</span>
          </button>
          <button className="btn hidden lg:inline-flex" onClick={() => signOut({ callbackUrl: "/login" })} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="hidden lg:inline">Sign out</span>
          </button>

          {/* Mobile: overflow menu button */}
          <div className="relative lg:hidden">
            <button
              className="btn"
              onClick={() => setShowOverflowMenu((v) => !v)}
              title="More options"
            >
              <IconMore />
            </button>
            {showOverflowMenu && (
              <div
                className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl p-2 shadow-xl"
                style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
              >
                {githubId && (
                  <>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-white/5"
                      style={{ color: "var(--text)" }}
                      disabled={syncingConnections}
                      onClick={() => {
                        setShowOverflowMenu(false);
                        setShowSyncMenu(true);
                      }}
                    >
                      <IconRefresh className={syncingConnections ? "animate-spin" : ""} />
                      Sync connections
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-white/5"
                      style={{ color: "var(--text)" }}
                      disabled={syncingIndirect}
                      onClick={() => {
                        setShowOverflowMenu(false);
                        setShowIndirectMenu(true);
                      }}
                    >
                      <IconCompass className={syncingIndirect ? "animate-spin" : ""} />
                      Expand network
                    </button>
                    <div className="my-1 h-px" style={{ background: "var(--border)" }} />
                  </>
                )}
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-white/5"
                  style={{ color: "var(--text)" }}
                  onClick={() => {
                    setShowOverflowMenu(false);
                    window.location.href = "/settings";
                  }}
                >
                  <IconSettings />
                  Settings
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-white/5"
                  style={{ color: "var(--text)" }}
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {activeTab === "discover" && (
        <div className="relative flex-1 min-h-0 z-10">
          <DiscoverView
            query={query}
            onSwitchToNetwork={(person) => {
              setActiveTab("network");
              // Set pendingPlacement before load so GraphView excludes the node
              // from the simulation until the user clicks to place it.
              setPendingPlacement({ id: person.id, name: person.name });
              load();
            }}
          />
        </div>
      )}

      {/* Loading overlay — covers everything while simulation runs on first load */}
      {activeTab === "network" && !graphReady && data && data.people.length > 0 && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ color: "var(--text-muted)", background: "var(--bg)" }}>
          <div className="flex flex-col items-center gap-3">
            <IconLogo width={36} height={36} className="animate-pulse text-violet-400" />
            <p className="text-sm">Charting your constellation...</p>
          </div>
        </div>
      )}

      {/* Background overlays (network tab) */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {activeTab === "network" && (
          <>
            {/* Zoom controls */}
            <div className="pointer-events-auto absolute bottom-4 right-4 z-30 flex flex-col gap-1.5 rounded-xl p-1.5 backdrop-blur sm:bottom-4" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
              <button className="btn px-2 py-1.5" onClick={() => apiRef.current?.zoomIn()} title="Zoom in"><IconZoomIn /></button>
              <button className="btn px-2 py-1.5" onClick={() => apiRef.current?.zoomOut()} title="Zoom out"><IconZoomOut /></button>
              <button className="btn px-2 py-1.5" onClick={() => apiRef.current?.fit()} title="Fit view"><IconFit /></button>
            </div>

            {/* Legend — toggleable on mobile, always visible on md+ */}
            <div className="absolute bottom-4 left-3 z-30 md:left-4">
              <button
                className="pointer-events-auto flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs backdrop-blur md:hidden"
                onClick={() => setShowLegend((v) => !v)}
                style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
                title="Toggle legend"
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} />
                Legend
              </button>
              <div
                className={`${showLegend ? "flex" : "hidden"} mt-1 max-w-[80vw] flex-wrap gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-xs backdrop-blur md:mt-0 md:flex`}
                style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
              >
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
            </div>

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
          </>
        )}

      </div>

      {/* Details sidebar */}
      {(selectedPerson || selectedEdge) && (
        <aside className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 max-h-[68vh] overflow-y-auto rounded-t-2xl shadow-2xl backdrop-blur-md lg:bottom-4 lg:top-4 lg:left-auto lg:right-4 lg:max-h-none lg:w-100 lg:overflow-y-auto lg:rounded-2xl xl:w-107.5" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          {/* Drag handle — visible only on mobile */}
          <div className="flex justify-center pt-2 lg:hidden">
            <div className="h-1 w-10 rounded-full" style={{ background: "var(--border-strong)" }} />
          </div>
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
              onSyncGithub={handleSyncGithub}
              syncingGithub={syncingGithub}
            />
          </div>
        </aside>
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
          className={`fixed left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-opacity bottom-20 sm:bottom-4 ${
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
