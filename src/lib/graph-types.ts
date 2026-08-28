/**
 * graph-types.ts
 *
 * Minimal shape needed by GraphView + graph-utils. Replace with (or merge
 * into) your existing Person/Edge types from prisma/schema — the fields
 * below are the only ones the fixes in this patch actually touch.
 */

export interface GraphNode {
  id: string;
  name?: string;
  avatar?: string | null;
  headline?: string | null;
  company?: string | null;
  // d3-force adds these at runtime once the simulation starts ticking:
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  [key: string]: unknown;
}

export interface GraphLink {
  // Starts as a plain ID string from your API; d3-force mutates this to a
  // GraphNode reference in place once the simulation runs. Never assume
  // either shape directly — always go through getEndpointId().
  source: string | GraphNode;
  target: string | GraphNode;
  origin?: string;
  context?: string;
  [key: string]: unknown;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
