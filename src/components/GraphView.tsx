// Force-directed graph canvas rendered with react-force-graph-2d.
// Handles node/link painting, hover tooltips, selection highlighting, and zoom controls.

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import {
  ORIGINS,
  colorForName,
  hexToRgba,
  initialsOf,
  type GraphPayload,
  type Person,
  type Relationship,
} from "@/lib/model";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// --- Types ---

export interface GraphApi {
  zoomIn: (ms?: number) => void;
  zoomOut: (ms?: number) => void;
  fit: (ms?: number) => void;
}

interface GNode extends Person {
  degree: number;
  x?: number;
  y?: number;
}

/** Extract the string id from a node/link ref (force-graph mutates these). */
function lid(x: unknown): string {
  return typeof x === "object" && x !== null ? (x as { id: string }).id : String(x);
}

// --- Component ---

export default function GraphView({
  data,
  matchedIds,
  selectedPersonId,
  selectedEdgeId,
  onSelectPerson,
  onSelectEdge,
  apiRef,
}: {
  data: GraphPayload;
  matchedIds: Set<string> | null;
  selectedPersonId: string | null;
  selectedEdgeId: string | null;
  onSelectPerson: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  apiRef: React.MutableRefObject<GraphApi | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<Relationship | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const [, bumpTick] = useState(0);
  const avatarCache = useRef(new Map<string, HTMLImageElement>());

  // Track container size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Expose zoom/fit methods via apiRef.
  useEffect(() => {
    apiRef.current = {
      zoomIn: (t) => {
        const g = fgRef.current;
        if (g) g.zoom(g.zoom() * 1.3, t ?? 200);
      },
      zoomOut: (t) => {
        const g = fgRef.current;
        if (g) g.zoom(g.zoom() / 1.3, t ?? 200);
      },
      fit: (t) => fgRef.current?.zoomToFit(t ?? 400, 90),
    };
    return () => { apiRef.current = null; };
  }, [apiRef]);

  // Build graph data with degree counts.
  const graphData = useMemo(() => {
    const degree: Record<string, number> = {};
    for (const e of data.edges) {
      degree[e.sourceId] = (degree[e.sourceId] ?? 0) + 1;
      degree[e.targetId] = (degree[e.targetId] ?? 0) + 1;
    }
    return {
      nodes: data.people.map((p) => ({ ...p, degree: degree[p.id] ?? 0 })) as GNode[],
      links: data.edges.map((e) => ({ ...e, source: e.sourceId, target: e.targetId })),
    };
  }, [data]);

  // Auto-fit once nodes settle.
  useEffect(() => {
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      const settled =
        graphData.nodes.length > 0 &&
        graphData.nodes.every((n) => Number.isFinite((n as GNode).x));
      if ((settled && tries >= 3) || tries >= 32) {
        clearInterval(iv);
        try { fgRef.current?.zoomToFit(700, 110); } catch { /* noop */ }
      }
    }, 250);
    return () => clearInterval(iv);
  }, [graphData]);

  // Neighbor set for the selected person.
  const neighborIds = useMemo(() => {
    if (!selectedPersonId) return null;
    const s = new Set<string>();
    for (const e of data.edges) {
      if (e.sourceId === selectedPersonId) s.add(e.targetId);
      if (e.targetId === selectedPersonId) s.add(e.sourceId);
    }
    return s;
  }, [data.edges, selectedPersonId]);

  const selectedEdge = useMemo(
    () => data.edges.find((e) => e.id === selectedEdgeId) ?? null,
    [data.edges, selectedEdgeId],
  );

  // --- Canvas helpers ---

  function ensureAvatar(url: string): HTMLImageElement | undefined {
    const cached = avatarCache.current.get(url);
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : undefined;
    if (typeof window === "undefined") return undefined;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => bumpTick((t) => t + 1);
    img.src = url;
    avatarCache.current.set(url, img);
    return undefined;
  }

  const radiusOf = (n: GNode) =>
    5 + Math.min(n.degree, 10) * 0.9 + (n.isSelf ? 4 : 0);

  // Define clickable hit area for each node (required when nodeCanvasObjectMode is "replace").
  const paintPointerArea = (raw: object, color: string, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const n = raw as GNode;
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return;
    const r = radiusOf(n) + 4; // small padding for easier targeting
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // --- Node painter ---

  const paintNode = (raw: object, ctx: CanvasRenderingContext2D, scale: number) => {
    const n = raw as GNode;
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return;
    const r = radiusOf(n);
    const isSel = n.id === selectedPersonId;
    const isNb = neighborIds?.has(n.id) ?? false;
    const isHover = n.id === hoverNode;
    const dimmed = matchedIds !== null && !matchedIds.has(n.id);
    const alpha = dimmed ? 0.12 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Glow for selected / hovered / neighbor nodes.
    if (isSel || isNb || isHover) {
      ctx.shadowColor = "#8b5cf6";
      ctx.shadowBlur = isSel ? 20 : 10;
    }
    // Selection ring.
    if (isSel) {
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r + 5 / scale, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba("#8b5cf6", 0.25);
      ctx.fill();
    }

    const cx = n.x!;
    const cy = n.y!;

    // Draw avatar image or fallback circle with initials.
    let drewAvatar = false;
    if (n.avatarUrl) {
      const img = ensureAvatar(n.avatarUrl);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const ratio = Math.max((r * 2) / img.naturalWidth, (r * 2) / img.naturalHeight);
        const w = img.naturalWidth * ratio;
        const h = img.naturalHeight * ratio;
        ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
        ctx.restore();
        drewAvatar = true;
      }
    }
    if (!drewAvatar) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = n.isSelf ? "#fbbf24" : colorForName(n.name);
      ctx.fill();
      const fs = r * (initialsOf(n.name).length > 1 ? 0.9 : 1.2);
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      ctx.fillStyle = "#0b101d";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initialsOf(n.name), cx, cy + fs * 0.05);
    }
    ctx.shadowBlur = 0;

    // Border ring.
    if (n.isSelf || isSel) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.5 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = n.isSelf && !isSel ? "#fbbf24" : "#ffffff";
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    } else if (isNb || isHover) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.5 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba("#a78bfa", 0.8);
      ctx.lineWidth = 1.6 / scale;
      ctx.stroke();
    }

    // Label below the node.
    if (!dimmed) {
      const fs = 12 / scale;
      ctx.font = `${fs}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const label = n.nickname || n.name;
      const ly = cy + r + 4 / scale;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(5,7,13,0.55)";
      ctx.fillRect(cx - tw / 2 - 3 / scale, ly - 2 / scale, tw + 6 / scale, fs + 4 / scale);
      ctx.fillStyle = isSel ? "#ffffff" : "#cbd5e1";
      ctx.fillText(label, cx, ly);
    }
    ctx.restore();
  };

  // --- Link styling ---

  const linkColorFn = (raw: object) => {
    const e = raw as Relationship & { source: unknown; target: unknown };
    const sid = lid(e.source);
    const tid = lid(e.target);
    const base = ORIGINS[e.origin]?.color ?? "#94a3b8";
    const touchesSelection =
      e.id === selectedEdgeId ||
      (selectedPersonId && (sid === selectedPersonId || tid === selectedPersonId));
    if (touchesSelection) return base;
    if (matchedIds) {
      if (!(matchedIds.has(sid) && matchedIds.has(tid))) return hexToRgba(base, 0.06);
    }
    return hexToRgba(base, hoverLink?.id === e.id ? 0.95 : 0.45);
  };

  // Base width scales with strength: weak=1.5, normal=2.5, strong=3.5.
  const baseWidth = (strength: number) => [1.5, 2.5, 3.5][Math.min(Math.max(strength, 1), 3) - 1] ?? 2.5;

  const linkWidthFn = (raw: object) => {
    const e = raw as Relationship & { source: unknown; target: unknown };
    const sid = lid(e.source);
    const tid = lid(e.target);
    const base = baseWidth(e.strength);
    if (e.id === selectedEdgeId) return base + 2;
    if (selectedPersonId && (sid === selectedPersonId || tid === selectedPersonId)) return base + 0.8;
    if (hoverLink?.id === e.id) return base + 1;
    return base;
  };

  // Dashed lines for weak ties (strength=1), more dashes for visibility.
  const linkLineDashFn = (raw: object) => {
    const e = raw as Relationship;
    return e.strength <= 1 ? [8, 5] : null;
  };

  // Custom link painting: glow for selected, double lines for strong.
  const paintCustomLink = (raw: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const e = raw as Relationship & { source: { x?: number; y?: number }; target: { x?: number; y?: number } };
    if (!Number.isFinite(e.source?.x) || !Number.isFinite(e.target?.x)) return;

    const sx = e.source.x!;
    const sy = e.source.y!;
    const tx = e.target.x!;
    const ty = e.target.y!;
    const base = ORIGINS[e.origin]?.color ?? "#94a3b8";

    // Glow behind selected edges
    if (e.id === selectedEdgeId) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = hexToRgba(base, 0.25);
      ctx.lineWidth = baseWidth(e.strength) + 8 / globalScale;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    // Double parallel lines for strong edges (strength=3)
    if (e.strength === 3) {
      const dx = tx - sx;
      const dy = ty - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const nx = -dy / len;
      const ny = dx / len;
      const gap = 2.5 / globalScale;

      ctx.save();
      ctx.strokeStyle = hexToRgba(base, e.id === selectedEdgeId ? 1 : 0.45);
      ctx.lineWidth = 1.2 / globalScale;
      ctx.lineCap = "round";

      // First parallel line
      ctx.beginPath();
      ctx.moveTo(sx + nx * gap, sy + ny * gap);
      ctx.lineTo(tx + nx * gap, ty + ny * gap);
      ctx.stroke();

      // Second parallel line
      ctx.beginPath();
      ctx.moveTo(sx - nx * gap, sy - ny * gap);
      ctx.lineTo(tx - nx * gap, ty - ny * gap);
      ctx.stroke();

      ctx.restore();
    }
  };

  const personById = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of data.people) m.set(p.id, p);
    return m;
  }, [data.people]);

  // --- Render ---

  return (
    <div
      ref={wrapRef}
      className="stars absolute inset-0"
      onMouseMove={(e) => {
        const rect = wrapRef.current!.getBoundingClientRect();
        setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      style={{ cursor: hoverNode ? "pointer" : "grab" }}
    >
      {size.w > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          minZoom={0.25}
          maxZoom={12}
          nodeRelSize={4}
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => "replace"}
          nodePointerAreaPaint={paintPointerArea}
          nodeLabel={() => ""}
          linkLabel={() => ""}
          linkColor={linkColorFn}
          linkWidth={linkWidthFn}
          linkLineDash={linkLineDashFn}
          linkCanvasObject={paintCustomLink}
          linkCanvasObjectMode={() => "before"}
          onNodeClick={(n: object) => onSelectPerson((n as GNode).id)}
          onNodeHover={(n: object | null) => setHoverNode(n ? (n as GNode).id : null)}
          onLinkClick={(l: object) => onSelectEdge((l as Relationship).id)}
          onLinkHover={(l: object | null) => setHoverLink(l ? (l as Relationship) : null)}
          onBackgroundClick={() => { onSelectPerson(null); onSelectEdge(null); }}
          cooldownTime={3500}
        />
      )}

      {/* Hover tooltip for links */}
      {hoverLink && (
        <div
          className="pointer-events-none absolute z-20 max-w-[280px] rounded-xl px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{
            left: Math.min(tipPos.x + 16, size.w - 300 > 0 ? tipPos.x + 16 : Math.max(8, size.w - 296)),
            top: tipPos.y + 16,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-card)",
            color: "var(--text)",
          }}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: ORIGINS[hoverLink.origin].color }} />
            {personById.get(hoverLink.sourceId)?.name ?? "?"} ↔{" "}
            {personById.get(hoverLink.targetId)?.name ?? "?"}
          </div>
          <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>{ORIGINS[hoverLink.origin].label}</div>
          {hoverLink.context && (
            <div className="mt-1.5 line-clamp-4 leading-snug" style={{ color: "var(--text-muted)" }}>{hoverLink.context}</div>
          )}
          {(hoverLink.communities.length > 0 || hoverLink.projects.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {hoverLink.communities.map((c) => (
                <span key={c} className="chip">{c}</span>
              ))}
              {hoverLink.projects.map((p) => (
                <span key={p} className="chip border-violet-400/30 text-violet-300">{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedEdge && (
        <div className="absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 rounded-full px-3 py-1.5 text-xs backdrop-blur sm:block" style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}>
          Click the connection card to edit · click empty space to deselect
        </div>
      )}
    </div>
  );
}
