export type SyncFilter = "all" | "following" | "mutual";

export interface SyncConnectionsResult {
  created: number;
  matched: number;
  skipped: number;
  crossEdgesCreated: number;
  warnings: string[];
}

export interface SyncIndirectResult {
  connectionsExplored: number;
  created: number;
  skipped: number;
  cleanedUp: number;
  warnings: string[];
}

async function readBody(res: Response) {
  return res.json().catch(() => null);
}

export async function syncConnections(filter: SyncFilter = "all"): Promise<SyncConnectionsResult> {
  const res = await fetch("/api/github/sync-connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filter }),
  });
  const body = await readBody(res);
  if (!res.ok) {
    throw new Error(body?.error ?? `GitHub sync failed (HTTP ${res.status})`);
  }
  return {
    created: body?.created ?? 0,
    matched: body?.matched ?? 0,
    skipped: body?.skipped ?? 0,
    crossEdgesCreated: body?.crossEdgesCreated ?? 0,
    warnings: body?.warnings ?? [],
  };
}

export async function syncProfile(): Promise<void> {
  const res = await fetch("/api/github/sync-profile", { method: "POST" });
  const body = await readBody(res);
  if (!res.ok) {
    throw new Error(body?.error ?? `Profile sync failed (HTTP ${res.status})`);
  }
}

export async function syncIndirect(maxConnections: number): Promise<SyncIndirectResult> {
  const res = await fetch("/api/github/sync-indirect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxConnections }),
  });
  const body = await readBody(res);
  if (!res.ok) {
    throw new Error(body?.error ?? `Second-degree sync failed (HTTP ${res.status})`);
  }
  return {
    connectionsExplored: body?.connectionsExplored ?? 0,
    created: body?.created ?? 0,
    skipped: body?.skipped ?? 0,
    cleanedUp: body?.cleanedUp ?? 0,
    warnings: body?.warnings ?? [],
  };
}

export function describeConnectionsResult(r: SyncConnectionsResult): string {
  const parts: string[] = [];
  if (r.created > 0) parts.push(`${r.created} new people`);
  if (r.matched > 0) parts.push(`${r.matched} refreshed`);
  if (r.crossEdgesCreated > 0) parts.push(`${r.crossEdgesCreated} edges between them`);
  if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
  return parts.length > 0 ? `Sync complete: ${parts.join(", ")}` : "Already up to date";
}

export function describeIndirectResult(r: SyncIndirectResult): string {
  const parts: string[] = [];
  if (r.cleanedUp > 0) parts.push(`${r.cleanedUp} stale removed`);
  if (r.created > 0) parts.push(`${r.created} second-degree added`);
  if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
  return parts.length > 0
    ? `Explored ${r.connectionsExplored} connections: ${parts.join(", ")}`
    : "No new second-degree connections found";
}
