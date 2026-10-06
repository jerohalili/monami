export function recencyFactor(updatedAt: string | Date, now = Date.now()): number {
  const ageDays = (now - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 90) return 1;
  if (ageDays < 365) return 1 - ((ageDays - 90) / 510) * 0.7;
  return 0.3;
}

export function freshnessBoost(updatedAt: string | Date, now = Date.now()): number {
  const ageDays = (now - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays < 30 ? 1.1 : 1.0;
}

export function scoreSharedTraits(sharedSkills: number, sharedInterests: number, boost = 1): number {
  return (sharedSkills + sharedInterests * 1.5) * boost;
}

export interface Diversifiable {
  company?: string | null;
  location?: string | null;
}

export function applyDiversityCap<T extends Diversifiable>(
  sorted: T[],
  maxPerCompany = 6,
  maxPerLocation = 5,
): T[] {
  const companyCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const out: T[] = [];

  for (const item of sorted) {
    const companyKey = item.company?.toLowerCase() ?? "";
    const locationKey = item.location?.toLowerCase() ?? "";
    if (companyKey && (companyCounts.get(companyKey) ?? 0) >= maxPerCompany) continue;
    if (locationKey && (locationCounts.get(locationKey) ?? 0) >= maxPerLocation) continue;
    out.push(item);
    if (companyKey) companyCounts.set(companyKey, (companyCounts.get(companyKey) ?? 0) + 1);
    if (locationKey) locationCounts.set(locationKey, (locationCounts.get(locationKey) ?? 0) + 1);
  }

  return out;
}
