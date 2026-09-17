// Constellation canvas. Ties colored by origin, dashed = weak.

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import { forceX, forceY } from "d3-force-3d";
import {
  ORIGINS,
  hexToRgba,
  initialsOf,
  nodeColor,
  type GraphPayload,
  type Person,
  type Relationship,
} from "@/lib/model";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// Camera easing.
function monamiEaseInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Gentle reheat so nodes drift, not teleport.
function gentleReheat(g: ForceGraphMethods) {
  const sim = (g as any)?.forceGraph?.state?.forceLayout;
  if (sim) {
    sim.alpha(0.15).restart();
  } else {
    g.d3ReheatSimulation();
  }
}

export interface GraphApi {
  zoomIn: (ms?: number) => void;
  zoomOut: (ms?: number) => void;
  fit: (ms?: number) => void;
}

interface GNode extends Person {
  degree: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

// Normalize link refs (string or {id}).
function monamiLinkId(x: unknown): string {
  return typeof x === "object" && x !== null ? (x as { id: string }).id : String(x);
}
const lid = monamiLinkId;

export default function GraphView({
  data,
  matchedIds,
  selectedPersonId,
  selectedEdgeId,
  onSelectPerson,
  onSelectEdge,
  apiRef,
  pendingPlacement,
  onPlaceNode,
  onReady,
}: {
  data: GraphPayload;
  matchedIds: Set<string> | null;
  selectedPersonId: string | null;
  selectedEdgeId: string | null;
  onSelectPerson: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  apiRef: React.MutableRefObject<GraphApi | null>;
  pendingPlacement: { id: string; name: string } | null;
  onPlaceNode: () => void;
  onReady?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [engineReady, setEngineReady] = useState(false);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<Relationship | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const [, bumpTick] = useState(0);
  const avatarCache = useRef(new Map<string, HTMLImageElement>());
  const nodeMapRef = useRef(new Map<string, GNode>());
  const linkMapRef = useRef(new Map<string, Relationship & { source: string; target: string }>());
  const pendingPinRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const nodeSigRef = useRef<string>("");
  const linkSigRef = useRef<string>("");
  const addedNodeRef = useRef(false);
  const pinnedByAddRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  const dragNodeIdRef = useRef<string | null>(null);
  const pendingReheatRef = useRef(false);
  const pendingFitRef = useRef(false);
  const placingRef = useRef(false);
  const placingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphDataRef = useRef<{ nodes: GNode[]; links: (Relationship & { source: string; target: string })[]; _nodeSig: string; _linkSig: string }>({ nodes: [], links: [], _nodeSig: "", _linkSig: "" });
  const unpinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedByAddTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNodeCountRef = useRef<number | null>(null);
  const initialFitRafRef = useRef<number | null>(null);

  // Container size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Zoom/fit API.
  useEffect(() => {
    apiRef.current = {
      zoomIn: (t) => { zoomBy(1.3, t ?? 300); },
      zoomOut: (t) => { zoomBy(1 / 1.3, t ?? 300); },
      fit: (t) => fgRef.current?.zoomToFit(t ?? 400, 90),
    };
    return () => { apiRef.current = null; };
  }, [apiRef]);

  // Persistent nodes so positions stick.
  const graphData = useMemo(() => {
    const degree: Record<string, number> = {};
    for (const e of data.edges) {
      degree[e.sourceId] = (degree[e.sourceId] ?? 0) + 1;
      degree[e.targetId] = (degree[e.targetId] ?? 0) + 1;
    }
    const map = nodeMapRef.current;
    const nodes: GNode[] = [];
    for (const p of data.people) {
      if (pendingPlacement && p.id === pendingPlacement.id && !map.has(p.id)) continue;
      let existing = map.get(p.id);
      if (existing) {
        // Skip dragged node, else it snaps back.
        if (!(isDraggingRef.current && existing.id === dragNodeIdRef.current)) {
          Object.assign(existing, { ...p, degree: degree[p.id] ?? 0 });
        }
        // Re-apply pin.
        const pin = pendingPinRef.current;
        if (pin && pin.id === p.id) {
          existing.fx = pin.x;
          existing.fy = pin.y;
        }
      } else {
        existing = { ...p, degree: degree[p.id] ?? 0 } as GNode;
        // Pin new nodes to click pos.
        const pin = pendingPinRef.current;
        if (pin && pin.id === p.id) {
          existing.fx = pin.x;
          existing.fy = pin.y;
        }
        map.set(p.id, existing);
        addedNodeRef.current = true;
      }
      nodes.push(existing);
    }
    // Drop removed nodes/links.
    for (const id of map.keys()) {
      if (!data.people.find((p) => p.id === id)) map.delete(id);
    }
    for (const key of linkMapRef.current.keys()) {
      if (!data.edges.find((e) => `${e.sourceId}->${e.targetId}` === key)) {
        linkMapRef.current.delete(key);
      }
    }
    // Reuse link objects.
    const links: (Relationship & { source: string; target: string })[] = [];
    for (const e of data.edges) {
      const key = `${e.sourceId}->${e.targetId}`;
      let existing = linkMapRef.current.get(key);
      if (existing) {
        // Metadata only, keep source/target.
        Object.assign(existing, {
          id: e.id,
          origin: e.origin,
          context: e.context,
          communities: e.communities,
          projects: e.projects,
          strength: e.strength,
          metAt: e.metAt,
          sourceId: e.sourceId,
          targetId: e.targetId,
        });
      } else {
        existing = { ...e, source: e.sourceId, target: e.targetId };
        linkMapRef.current.set(key, existing);
      }
      links.push(existing);
    }
    // Same ref if topology unchanged, avoids jolts.
    const nodeSig = nodes.map((n) => n.id).sort().join(",");
    const linkSig = links.map((l) => `${lid(l.source)}->${lid(l.target)}`).sort().join(",");
    const prev = graphDataRef.current;
    if (nodeSig === prev._nodeSig && linkSig === prev._linkSig) return prev;
    // Link-only change: mutate in place, no reheat.
    if (nodeSig === prev._nodeSig) {
      prev.links = links;
      prev._linkSig = linkSig;
      // Resolve string refs to nodes.
      const nodeById = new Map(nodes.map(n => [n.id, n]));
      for (const l of links) {
        if (typeof l.source === "string") {
          const resolved = nodeById.get(l.source);
          if (resolved) (l as { source: unknown }).source = resolved;
        }
        if (typeof l.target === "string") {
          const resolved = nodeById.get(l.target);
          if (resolved) (l as { target: unknown }).target = resolved;
        }
      }
      return prev;
    }
    const result = { nodes, links, _nodeSig: nodeSig, _linkSig: linkSig };
    graphDataRef.current = result;
    return result;
  }, [data, pendingPlacement]);

  // Deferred fit on node add/remove.
  const prevCount = useRef(graphData.nodes.length);
  const didInitialFit = useRef(false);
  const didMarkEngineReady = useRef(false);
  useEffect(() => {
    if (graphData.nodes.length > prevCount.current) {
      // Track placement window to block spurious fits from load()'s render.
      if (pendingPinRef.current) {
        placingRef.current = true;
        if (placingTimerRef.current) clearTimeout(placingTimerRef.current);
        placingTimerRef.current = setTimeout(() => {
          placingRef.current = false;
          placingTimerRef.current = null;
        }, 1500);
      }
    }
    prevCount.current = graphData.nodes.length;
  }, [graphData]);

  // Cleanup timers.
  useEffect(() => {
    return () => {
      if (placingTimerRef.current) clearTimeout(placingTimerRef.current);
      if (initialFitRafRef.current !== null) cancelAnimationFrame(initialFitRafRef.current);
    };
  }, []);

  // Unpin after settle, ref timer survives re-renders.
  useEffect(() => {
    const pin = pendingPinRef.current;
    if (!pin) return;
    if (unpinTimerRef.current) clearTimeout(unpinTimerRef.current);
    unpinTimerRef.current = setTimeout(() => {
      const n = nodeMapRef.current.get(pin.id);
      if (n) { n.fx = undefined; n.fy = undefined; }
      pendingPinRef.current = null;
      unpinTimerRef.current = null;
    }, 200);
  }, [graphData]);

  // Charge + center forces.
  useEffect(() => {
    const g = fgRef.current;
    if (!g) return;

    // Weaker repulsion when unconnected.
    const charge = g.d3Force("charge");
    if (charge) {
      charge.strength((n: object) => {
        const node = n as GNode;
        return (node.degree ?? 0) === 0 ? -30 : -150;
      });
    }

    // Pull toward You-node, stronger if unconnected.
    const xForce = forceX((n: object) => {
      const youNode = graphData.nodes.find((nd) => isYouNode(nd));
      return youNode?.x ?? 0;
    }).strength((n: object) => ((n as GNode).degree ?? 0) === 0 ? 0.15 : 0.03);
    const yForce = forceY((n: object) => {
      const youNode = graphData.nodes.find((nd) => isYouNode(nd));
      return youNode?.y ?? 0;
    }).strength((n: object) => ((n as GNode).degree ?? 0) === 0 ? 0.15 : 0.03);
    g.d3Force("x", xForce);
    g.d3Force("y", yForce);
    // Drop default center, it fights the You-anchor.
    g.d3Force("center", null);
    // Reheat on topology change only.
    const nodeSig = graphData.nodes.map((n) => n.id).sort().join(",");
    const linkSig = graphData.links
      .map((l) => `${lid(l.source)}->${lid(l.target)}`)
      .sort()
      .join(",");
    if (nodeSig !== nodeSigRef.current || linkSig !== linkSigRef.current) {
      nodeSigRef.current = nodeSig;
      linkSigRef.current = linkSig;

      // Deletion check.
      const prevCount = prevNodeCountRef.current;
      prevNodeCountRef.current = graphData.nodes.length;

      // Pin old nodes so new one settles in.
      if (addedNodeRef.current) {
        addedNodeRef.current = false;
        const pinned = new Set<string>();
        for (const n of graphData.nodes) {
          if (n.fx === undefined && n.fy === undefined) {
            pinned.add(n.id);
            n.fx = n.x;
            n.fy = n.y;
          }
        }
        pinnedByAddRef.current = pinned;
        if (pinnedByAddTimerRef.current) clearTimeout(pinnedByAddTimerRef.current);
        pinnedByAddTimerRef.current = setTimeout(() => {
          for (const n of graphData.nodes) {
            if (pinned.has(n.id)) {
              n.fx = undefined;
              n.fy = undefined;
            }
          }
          pinnedByAddRef.current = new Set();
          pinnedByAddTimerRef.current = null;
        }, 200);
      } else if (prevCount !== null && graphData.nodes.length < prevCount) {
        // Node deleted — pin remaining nodes so only the deleted node's
        // absence causes a localized rebalance, not a global reshuffle.
        const pinned = new Set<string>();
        for (const n of graphData.nodes) {
          if (n.fx === undefined && n.fy === undefined) {
            pinned.add(n.id);
            n.fx = n.x;
            n.fy = n.y;
          }
        }
        if (pinnedByAddTimerRef.current) clearTimeout(pinnedByAddTimerRef.current);
        pinnedByAddTimerRef.current = setTimeout(() => {
          for (const n of graphData.nodes) {
            if (pinned.has(n.id)) {
              n.fx = undefined;
              n.fy = undefined;
            }
          }
          pinnedByAddTimerRef.current = null;
        }, 200);
      }

      // Reheat on node change only.
      if (nodeSig !== nodeSigRef.current && !isDraggingRef.current) {
        gentleReheat(g);
      } else if (nodeSig !== nodeSigRef.current) {
        pendingReheatRef.current = true;
      }
    }
  }, [graphData, engineReady]);

  // Neighbors of selected.
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

  const isYouNode = (n: GNode) =>
    n.tags.includes("me");

  const radiusOf = (n: GNode) =>
    5 + Math.min(n.degree, 10) * 0.9 + (isYouNode(n) ? 4 : 0);

  // Smooth camera tween.
  function animateCamera(targetCenter: { x: number; y: number } | null, targetZoom: number, duration: number): number | null {
    const g = fgRef.current;
    if (!g) return null;
    const startCenter = g.centerAt();
    const startZoom = g.zoom();
    const cx = targetCenter ? targetCenter.x : startCenter.x;
    const cy = targetCenter ? targetCenter.y : startCenter.y;
    const startTime = performance.now();
    let rafId: number | null = null;
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const e = monamiEaseInOut(t);
      g.centerAt(
        startCenter.x + (cx - startCenter.x) * e,
        startCenter.y + (cy - startCenter.y) * e,
        0,
      );
      g.zoom(startZoom + (targetZoom - startZoom) * e, 0);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return rafId;
  }

  // Fit to bbox.
  function fitGraph(duration = 400): number | null {
    const g = fgRef.current;
    if (!g || graphData.nodes.length === 0) return null;
    const bbox = g.getGraphBbox();
    if (!bbox) return null;
    const cx = (bbox.x[0] + bbox.x[1]) / 2;
    const cy = (bbox.y[0] + bbox.y[1]) / 2;
    const zk = Math.max(1e-12, Math.min(1e12,
      (size.w - 180) / (bbox.x[1] - bbox.x[0]),
      (size.h - 180) / (bbox.y[1] - bbox.y[0]),
    ));
    return animateCamera({ x: cx, y: cy }, zk * 1.0001, duration);
  }

  // Zoom around center.
  function zoomBy(factor: number, duration = 300): number | null {
    const g = fgRef.current;
    if (!g) return null;
    return animateCamera(null, g.zoom() * factor, duration);
  }

  // Clickable node area.
  const paintPointerArea = (raw: object, color: string, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const n = raw as GNode;
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return;
    const r = radiusOf(n) + 2; // minimal padding
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // Node painter.
  const paintNode = (raw: object, ctx: CanvasRenderingContext2D, scale: number) => {
    const n = raw as GNode;
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return;
    const r = radiusOf(n);
    const isSel = n.id === selectedPersonId;
    const isNb = neighborIds?.has(n.id) ?? false;
    const isHover = n.id === hoverNode;
    const isY = isYouNode(n);
    const dimmed = matchedIds !== null && !matchedIds.has(n.id);
    const alpha = dimmed ? 0.12 : 1;
    const isLight = document.documentElement.getAttribute("data-theme") === "light";

    ctx.save();
    ctx.globalAlpha = alpha;

    // Glow for selected / hovered / neighbor nodes.
    if (isSel || isNb || isHover) {
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = isSel ? 20 : 10;
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
      ctx.fillStyle = nodeColor(n.name);
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
    if (isSel || isNb || isHover) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.5 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2.5 / scale;
      ctx.stroke();
    } else if (isY) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.5 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = isLight ? "#7c3aed" : "#8b5cf6";
      ctx.lineWidth = 2.5 / scale;
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
      ctx.fillStyle = isLight ? "rgba(255,255,255,0.85)" : "rgba(5,7,13,0.55)";
      ctx.fillRect(cx - tw / 2 - 3 / scale, ly - 2 / scale, tw + 6 / scale, fs + 4 / scale);
      ctx.fillStyle = isSel ? (isLight ? "#0f172a" : "#ffffff") : isLight ? "#1e293b" : "#cbd5e1";
      ctx.fillText(label, cx, ly);
    }
    ctx.restore();
  };

  // Width by strength: 1.5 / 2.5 / 3.5.
  const baseWidth = (strength: number) => [1.5, 2.5, 3.5][Math.min(Math.max(strength, 1), 3) - 1] ?? 2.5;

  // Links paint under nodes.
  const paintCustomLink = (raw: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const e = raw as Relationship & { source: { x?: number; y?: number }; target: { x?: number; y?: number } };
    if (!Number.isFinite(e.source?.x) || !Number.isFinite(e.target?.x)) return;

    const sx = e.source.x!;
    const sy = e.source.y!;
    const tx = e.target.x!;
    const ty = e.target.y!;
    const base = ORIGINS[e.origin]?.color ?? "#94a3b8";

    // Dim non-matching links during search
    let alpha = 0.45;
    const sid = lid(e.source);
    const tid = lid(e.target);
    const touchesSelection =
      e.id === selectedEdgeId ||
      (selectedPersonId && (sid === selectedPersonId || tid === selectedPersonId));
    if (touchesSelection) alpha = 1;
    if (hoverLink?.id === e.id) alpha = 0.95;
    if (matchedIds && !(matchedIds.has(sid) && matchedIds.has(tid))) alpha = 0.06;

    const w = baseWidth(e.strength) / globalScale;
    const isLight = document.documentElement.getAttribute("data-theme") === "light";

    // Glow behind selected edges
    if (e.id === selectedEdgeId) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = hexToRgba("#fbbf24", 0.25);
      ctx.lineWidth = (baseWidth(e.strength) + 8) / globalScale;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    const isSelectedEdge = e.id === selectedEdgeId;
    const edgeColor = isSelectedEdge ? "#fbbf24" : base;
    ctx.strokeStyle = hexToRgba(edgeColor, alpha);
    ctx.lineWidth = w;
    ctx.lineCap = "round";

    // Dashed lines for weak ties
    if (e.strength <= 1) ctx.setLineDash([8 / globalScale, 5 / globalScale]);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Double parallel lines for strong edges (strength=3)
    if (e.strength === 3) {
      const dx = tx - sx;
      const dy = ty - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len >= 1) {
        const nx = -dy / len;
        const ny = dx / len;
        const gap = 2.5 / globalScale;

        ctx.lineWidth = 1.2 / globalScale;
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(sx + nx * gap, sy + ny * gap);
        ctx.lineTo(tx + nx * gap, ty + ny * gap);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sx - nx * gap, sy - ny * gap);
        ctx.lineTo(tx - nx * gap, ty - ny * gap);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  const personById = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of data.people) m.set(p.id, p);
    return m;
  }, [data.people]);

  return (
    <div
      ref={wrapRef}
      className="stars absolute inset-0"
      style={{ touchAction: "none", cursor: hoverNode ? "pointer" : "grab" }}
      onMouseMove={(e) => {
        const rect = wrapRef.current!.getBoundingClientRect();
        setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
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
          linkCanvasObject={paintCustomLink}
          linkCanvasObjectMode={() => "replace"}
          linkPointerAreaPaint={(raw: object, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const e = raw as Relationship & { source: { x: number; y: number }; target: { x: number; y: number } };
            if (!Number.isFinite(e.source?.x) || !Number.isFinite(e.target?.x)) return;
            ctx.beginPath();
            ctx.moveTo(e.source.x, e.source.y);
            ctx.lineTo(e.target.x, e.target.y);
            ctx.strokeStyle = color;
            ctx.lineWidth = (baseWidth(e.strength) + 10) / globalScale;
            ctx.lineCap = "round";
            ctx.stroke();
          }}
          onNodeClick={(n: object) => onSelectPerson((n as GNode).id)}
          onNodeHover={(n: object | null) => setHoverNode(n ? (n as GNode).id : null)}
          onNodeDrag={(n: object) => {
            isDraggingRef.current = true;
            dragNodeIdRef.current = (n as GNode).id;
          }}
          onNodeDragEnd={() => {
            isDraggingRef.current = false;
            dragNodeIdRef.current = null;
            if (pendingReheatRef.current) {
              pendingReheatRef.current = false;
              if (fgRef.current) gentleReheat(fgRef.current);
            }
          }}
          enablePanInteraction={(e: MouseEvent) => !isDraggingRef.current && !pendingPlacement}
          enableNodeDrag={true}
          onLinkClick={(l: object) => onSelectEdge((l as Relationship).id)}
          onLinkHover={(l: object | null) => setHoverLink(l ? (l as Relationship) : null)}
          onEngineTick={() => {
            if (!didMarkEngineReady.current) {
              didMarkEngineReady.current = true;
              setEngineReady(true);
            }
          }}
          onEngineStop={() => {
            if (!didMarkEngineReady.current) {
              didMarkEngineReady.current = true;
              setEngineReady(true);
            }
            if (!didInitialFit.current && graphData.nodes.length > 0) {
              didInitialFit.current = true;
              // Instant fit — graph appears already zoom-fitted, no animation.
              fgRef.current?.zoomToFit(0, 90);
              onReady?.();
            }
          }}
          onBackgroundClick={(e: MouseEvent) => {
            if (pendingPlacement && fgRef.current && wrapRef.current) {
              const rect = wrapRef.current.getBoundingClientRect();
              const gp = fgRef.current.screen2GraphCoords(
                e.clientX - rect.left,
                e.clientY - rect.top,
              );
              // Save pin position — will be applied after load() rebuilds graphData
              pendingPinRef.current = { id: pendingPlacement.id, x: gp.x, y: gp.y };
              onPlaceNode();
              return;
            }
            onSelectPerson(null);
            onSelectEdge(null);
          }}
          cooldownTime={3000}
          warmupTicks={200}
        />
      )}

      {/* Hover tooltip for links */}
      {hoverLink && (
        <div
          className="pointer-events-none absolute z-20 max-w-70 rounded-xl px-3 py-2 text-xs shadow-xl backdrop-blur"
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

      {pendingPlacement && (
        <>
          {/* Banner */}
          <div className="pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-medium shadow-lg backdrop-blur" style={{ top: 80, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}>
            Click anywhere to place <span className="font-semibold text-violet-400">{pendingPlacement.name}</span>
          </div>
          {/* Cursor-following node preview */}
          <div
            className="pointer-events-none absolute z-50 flex items-center justify-center rounded-full"
            style={{
              left: tipPos.x - 14,
              top: tipPos.y - 14,
              width: 28,
              height: 28,
              background: nodeColor(pendingPlacement.name),
              border: "2px solid #8b5cf6",
              boxShadow: "0 0 12px rgba(139,92,246,0.5)",
            }}
          >
            <span className="text-[10px] font-semibold" style={{ color: "#0b101d" }}>
              {initialsOf(pendingPlacement.name)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
