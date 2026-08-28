/**
 * graph-utils.ts
 *
 * d3-force (used internally by react-force-graph) mutates `link.source` and
 * `link.target` in place: they start as string IDs (from your API response)
 * but after the simulation ticks once, d3 replaces them with references to
 * the actual node objects ({ id, x, y, vx, vy, ... }).
 *
 * Any code that does `link.source === someId` will work correctly before
 * the first tick and silently break after it (object !== string). That
 * mismatch is what corrupts neighbor-highlight state, dimming/search logic,
 * and delete/filter operations, which is why zoomToFit and friends end up
 * reading garbage bounding boxes.
 *
 * Always resolve endpoints through `getEndpointId` instead of comparing
 * `link.source` / `link.target` directly.
 */

import type { GraphLink, GraphNode } from "./graph-types";

/** A link endpoint as d3-force may leave it: a raw ID string, or a mutated node reference. */
export type LinkEndpoint = string | GraphNode | { id: string } | null | undefined;

/**
 * Resolve a link endpoint to its string ID, whether d3-force has
 * mutated it into a node object yet or not.
 */
export function getEndpointId(endpoint: LinkEndpoint): string {
  if (endpoint == null) return "";
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

/** True if the link connects the two given node IDs, in either direction. */
export function linkConnects(link: GraphLink, idA: string, idB: string): boolean {
  const source = getEndpointId(link.source);
  const target = getEndpointId(link.target);
  return (source === idA && target === idB) || (source === idB && target === idA);
}

/** True if the link touches the given node ID, as either source or target. */
export function linkTouchesNode(link: GraphLink, nodeId: string): boolean {
  return getEndpointId(link.source) === nodeId || getEndpointId(link.target) === nodeId;
}

/** Remove every link that touches the given (deleted) node ID. Safe post-mutation. */
export function removeLinksForNode(links: GraphLink[], deletedId: string): GraphLink[] {
  return links.filter((l) => !linkTouchesNode(l, deletedId));
}

/**
 * Build a Set of node IDs that are direct neighbors of `nodeId`, plus the
 * node itself. Use this for hover/click neighbor-highlighting instead of
 * inline `link.source === nodeId` checks scattered through render code.
 */
export function getNeighborIds(links: GraphLink[], nodeId: string): Set<string> {
  const neighbors = new Set<string>([nodeId]);
  for (const link of links) {
    const source = getEndpointId(link.source);
    const target = getEndpointId(link.target);
    if (source === nodeId) neighbors.add(target);
    if (target === nodeId) neighbors.add(source);
  }
  return neighbors;
}
