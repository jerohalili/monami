// Force-directed graph canvas rendered with react-force-graph-2d.
// Handles node/link painting, hover tooltips, selection highlighting, and zoom controls.

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import { forceX, forceY } from "d3-force-3d";
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
  fx?: number;
  fy?: number;
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
  pendingPlacement,
  onPlaceNode,
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
  const graphDataRef = useRef<{ nodes: GNode[]; links: (Relationship & { source: string; target: string })[]; _nodeSig: string; _linkSig: string }>({ nodes: [], links: [], _nodeSig: "", _linkSig: "" });
  const unpinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedByAddTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNodeCountRef = useRef<number | null>(null);

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

  // Build graph data. Persistent node objects so force graph keeps positions.
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
        // Skip metadata update for the actively dragged node — the library is
        // continuously setting fx/fy and Object.assign would overwrite them,
        // causing the node to snap back.
        if (!(isDraggingRef.current && existing.id === dragNodeIdRef.current)) {
          Object.assign(existing, { ...p, degree: degree[p.id] ?? 0 });
        }
        // Re-apply pin if this node was just placed (Object.assign overwrites fx/fy)
        const pin = pendingPinRef.current;
        if (pin && pin.id === p.id) {
          existing.fx = pin.x;
          existing.fy = pin.y;
        }
      } else {
        existing = { ...p, degree: degree[p.id] ?? 0 } as GNode;
        map.set(p.id, existing);
        addedNodeRef.current = true;
      }
      nodes.push(existing);
    }
    // Garbage-collect removed nodes and links from maps
    for (const id of map.keys()) {
      if (!data.people.find((p) => p.id === id)) map.delete(id);
    }
    for (const key of linkMapRef.current.keys()) {
      if (!data.edges.find((e) => `${e.sourceId}->${e.targetId}` === key)) {
        linkMapRef.current.delete(key);
      }
    }
    // Build links: reuse existing objects to preserve identity across renders
    const links: (Relationship & { source: string; target: string })[] = [];
    for (const e of data.edges) {
      const key = `${e.sourceId}->${e.targetId}`;
      let existing = linkMapRef.current.get(key);
      if (existing) {
        Object.assign(existing, { ...e, source: e.sourceId, target: e.targetId });
      } else {
        existing = { ...e, source: e.sourceId, target: e.targetId };
        linkMapRef.current.set(key, existing);
      }
      links.push(existing);
    }
    // Cache: return the same object reference when node IDs and link topology
    // are unchanged.  react-force-graph reinitializes on every new reference,
    // so preserving identity here is the primary defence against jolts on
    // metadata-only edits.
    const nodeSig = nodes.map((n) => n.id).sort().join(",");
    const linkSig = links.map((l) => `${lid(l.source)}->${lid(l.target)}`).sort().join(",");
    const prev = graphDataRef.current;
    if (nodeSig === prev._nodeSig && linkSig === prev._linkSig) return prev;
    const result = { nodes, links, _nodeSig: nodeSig, _linkSig: linkSig };
    graphDataRef.current = result;
    return result;
  }, [data, pendingPlacement]);

  // Fit when new nodes are added.
  const prevCount = useRef(graphData.nodes.length);
  const didInitialFit = useRef(false);
  const didMarkEngineReady = useRef(false);
  useEffect(() => {
    if (graphData.nodes.length > prevCount.current) {
      // New node added — fit after physics settles.
      // Skip if the user just manually placed the node themselves (pinned via
      // click-to-place): re-centering the camera right after that is a second,
      // unwanted jolt on top of the one they just intentionally caused.
      const t = setTimeout(() => {
        if (pendingPinRef.current) return;
        try { fgRef.current?.zoomToFit(400, 100); } catch { /* noop */ }
      }, 250);
      prevCount.current = graphData.nodes.length;
      return () => clearTimeout(t);
    }
    prevCount.current = graphData.nodes.length;
  }, [graphData]);

  // Unpin placed node after physics settles.
  // Uses a ref-based timer so it survives re-renders — the cleanup MUST fire
  // even if graphData changes again before the timeout (e.g. a data refresh
  // during the unpin window).  Previous impl used effect cleanup which could
  // cancel the timer and permanently freeze the node.
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

  // Configure charge force: weaker repulsion for unconnected nodes.
  // Add center attraction to keep nodes from drifting too far from the "You" node.
  useEffect(() => {
    const g = fgRef.current;
    if (!g) return;

    // Charge (repulsion): weaker for unconnected nodes
    const charge = g.d3Force("charge");
    if (charge) {
      charge.strength((n: object) => {
        const node = n as GNode;
        return (node.degree ?? 0) === 0 ? -30 : -150;
      });
    }

    // Center attraction: pulls nodes toward the "You" node
    // Stronger pull for unconnected nodes to keep them near the cluster
    // NOTE: 'x'/'y' aren't registered by default (only 'link'/'charge'/'center' are),
    // so d3Force("x")/d3Force("y") always returned undefined and this block was a
    // silent no-op — the "keep unconnected nodes near the cluster" fix never actually
    // ran, which is why they kept drifting.
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
    // Drop the default 'center' force — it recenters on graph-space (0,0) and
    // was fighting the anchor-to-"You"-node forces above, which is what pushed
    // unconnected nodes off toward a competing center instead of settling near the cluster.
    g.d3Force("center", null);
    // Only reheat when the actual topology changed (nodes or links added/removed) —
    // not on every referential change of `graphData`. That memo also changes
    // reference when unrelated state updates (e.g. pendingPlacement toggling,
    // or a data refresh where a pending node is still excluded) cause it to
    // recompute, even though the node list is identical. Reheating on every
    // such reference change caused a visible jolt with no real layout change
    // behind it — including, ironically, jolts while a new node was still
    // pending placement and hadn't entered the simulation at all.
    const nodeSig = graphData.nodes.map((n) => n.id).sort().join(",");
    const linkSig = graphData.links
      .map((l) => `${lid(l.source)}->${lid(l.target)}`)
      .sort()
      .join(",");
    if (nodeSig !== nodeSigRef.current || linkSig !== linkSigRef.current) {
      nodeSigRef.current = nodeSig;
      linkSigRef.current = linkSig;

      // Track node count for deletion detection
      const prevCount = prevNodeCountRef.current;
      prevNodeCountRef.current = graphData.nodes.length;

      // When a new node was just added, pin existing nodes temporarily so the
      // new node settles into place without dragging the whole layout.
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

      // Defer reheat if a node is being dragged — reheating mid-drag causes
      // d3-force to fight the locked fx/fy, resulting in viewport drift.
      if (!isDraggingRef.current) {
        g.d3ReheatSimulation();
      } else {
        pendingReheatRef.current = true;
      }
    }
  }, [graphData, engineReady]);

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

  const isYouNode = (n: GNode) =>
    n.name === "You" && !n.headline && !n.company && !n.location;

  const radiusOf = (n: GNode) =>
    5 + Math.min(n.degree, 10) * 0.9 + (isYouNode(n) ? 4 : 0);

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
    const isY = isYouNode(n);
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
      ctx.fillStyle = isY ? "#fbbf24" : colorForName(n.name);
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
    if (isY || isSel) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.5 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = isY && !isSel ? "#fbbf24" : "#ffffff";
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

  // --- Link styling (handled entirely by paintCustomLink in replace mode) ---

  // Base width scales with strength: weak=1.5, normal=2.5, strong=3.5.
  const baseWidth = (strength: number) => [1.5, 2.5, 3.5][Math.min(Math.max(strength, 1), 3) - 1] ?? 2.5;

  // Custom link painting: replaces default rendering so nodes always draw on top.
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

    // Glow behind selected edges
    if (e.id === selectedEdgeId) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = hexToRgba(base, 0.25);
      ctx.lineWidth = (baseWidth(e.strength) + 8) / globalScale;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = hexToRgba(base, alpha);
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
          linkCanvasObject={paintCustomLink}
          linkCanvasObjectMode={() => "replace"}
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
              fgRef.current?.d3ReheatSimulation();
            }
          }}
          enablePanInteraction={(e: MouseEvent) => !isDraggingRef.current && !pendingPlacement}
          onLinkClick={(l: object) => onSelectEdge((l as Relationship).id)}
          onLinkHover={(l: object | null) => setHoverLink(l ? (l as Relationship) : null)}
          onEngineTick={() => {
            if (!didMarkEngineReady.current) {
              didMarkEngineReady.current = true;
              setEngineReady(true);
            }
            if (!didInitialFit.current && graphData.nodes.length > 0) {
              didInitialFit.current = true;
              try { fgRef.current?.zoomToFit(0, 110); } catch { /* noop */ }
            }
          }}
          onEngineStop={() => {
            if (!didMarkEngineReady.current) {
              didMarkEngineReady.current = true;
              setEngineReady(true);
            }
            if (!didInitialFit.current && graphData.nodes.length > 0) {
              didInitialFit.current = true;
              try { fgRef.current?.zoomToFit(0, 110); } catch { /* noop */ }
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
          cooldownTime={1000}
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
              background: colorForName(pendingPlacement.name),
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
