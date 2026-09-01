// GET /api/recommendations — multi-signal people recommendations.
// Combines: mutual connections, skills/interests overlap, company/location,
// GitHub contributors.
// Improvements: skill normalization, edge strength weighting, recency weighting,
// diversity cap.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import { autoAvatarUrl, overlap } from "@/lib/model";
import { normalizeSkills, extractSkillsFromRepos } from "@/lib/skills";
import {
  getGitHubToken,
  fetchGitHubRepos,
  fetchGitHubRepoContributors,
  fetchUserRepos,
  githubFetch,
} from "@/lib/github";

interface Candidate {
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  company: string | null;
  location: string | null;
  skills: string[];
  interests: string[];
  githubLogin: string | null;
  score: number;
  reasons: string[];
  reasonDetails: {
    mutualConnections?: string[];
    sharedSkills?: string[];
    sharedInterests?: string[];
    company?: string;
    location?: string;
    contributedRepos?: string[];
    starredBy?: string[];
  };
  candidateKey?: string;
}

export async function GET() {
  try {
    const userId = await requireUserId();

    // Fetch the user's "me" node for skills/interests/company/location comparison
    const meNode = await db.person.findFirst({
      where: { userId, tags: { array_contains: "me" } },
    });

    // Normalize meNode skills/interests for consistent comparison
    const mySkills = meNode
      ? normalizeSkills(Array.isArray(meNode.skills) ? (meNode.skills as string[]) : [])
      : [];
    const myInterests = meNode
      ? normalizeSkills(Array.isArray(meNode.interests) ? (meNode.interests as string[]) : [])
      : [];
    const myCompany = meNode?.company?.toLowerCase() ?? null;
    const myLocation = meNode?.location?.toLowerCase() ?? null;

    // Fetch all existing people in the network (to find mutual connections and exclude)
    const existingPeople = await db.person.findMany({
      where: { userId },
      select: {
        id: true,
        githubLogin: true,
        name: true,
        skills: true,
        interests: true,
        company: true,
        location: true,
        headline: true,
        updatedAt: true,
      },
    });

    const existingIds = new Set(existingPeople.map((p) => p.id));
    const existingLogins = new Set(
      existingPeople.map((p) => p.githubLogin).filter((l): l is string => l !== null),
    );

    // Fetch all edges in the user's network
    const edges = await db.edge.findMany({
      where: {
        OR: [
          { source: { userId } },
          { target: { userId } },
        ],
      },
      select: { sourceId: true, targetId: true, strength: true },
    });

    // Build adjacency and edge strength maps (bidirectional)
    const adjacency = new Map<string, Set<string>>();
    const edgeStrength = new Map<string, Map<string, number>>();
    for (const e of edges) {
      if (!adjacency.has(e.sourceId)) adjacency.set(e.sourceId, new Set());
      if (!adjacency.has(e.targetId)) adjacency.set(e.targetId, new Set());
      adjacency.get(e.sourceId)!.add(e.targetId);
      adjacency.get(e.targetId)!.add(e.sourceId);

      if (!edgeStrength.has(e.sourceId)) edgeStrength.set(e.sourceId, new Map());
      if (!edgeStrength.has(e.targetId)) edgeStrength.set(e.targetId, new Map());
      edgeStrength.get(e.sourceId)!.set(e.targetId, e.strength);
      edgeStrength.get(e.targetId)!.set(e.sourceId, e.strength);
    }

    const candidates = new Map<string, Candidate>();

    const getOrCreate = (key: string, data: Partial<Candidate> & { name: string }): Candidate => {
      const existing = candidates.get(key);
      if (existing) return existing;
      const c: Candidate = {
        name: data.name,
        avatarUrl: data.avatarUrl ?? autoAvatarUrl(data.name),
        headline: data.headline ?? null,
        company: data.company ?? null,
        location: data.location ?? null,
        skills: data.skills ?? [],
        interests: data.interests ?? [],
        githubLogin: data.githubLogin ?? null,
        score: 0,
        reasons: [],
        reasonDetails: {},
      };
      candidates.set(key, c);
      return c;
    };

    // --- Signal 1: Mutual connections (second-degree people) ---
    // Find people connected to 2+ of the user's existing contacts but not in the network.
    // Edge strength weighting: stronger connections contribute more to the score.
    const secondDegreeCounts = new Map<string, {
      count: number;
      connections: string[];
      totalStrength: number;
    }>();

    for (const [personId, neighbors] of adjacency) {
      if (!existingIds.has(personId)) continue;
      for (const neighborId of neighbors) {
        if (existingIds.has(neighborId)) continue;
        const strength = edgeStrength.get(personId)?.get(neighborId) ?? 2;
        const existing = secondDegreeCounts.get(neighborId);
        if (existing) {
          existing.count++;
          existing.totalStrength += strength;
          const person = existingPeople.find((p) => p.id === personId);
          if (person) existing.connections.push(person.name);
        } else {
          const person = existingPeople.find((p) => p.id === personId);
          secondDegreeCounts.set(neighborId, {
            count: 1,
            connections: person ? [person.name] : [],
            totalStrength: strength,
          });
        }
      }
    }

    for (const [personId, { count, connections, totalStrength }] of secondDegreeCounts) {
      if (count < 2) continue;
      const person = await db.person.findUnique({ where: { id: personId } });
      if (!person) continue;

      // Edge strength weighting: avgStrength 1→1.0, 2→1.33, 3→1.67
      const avgStrength = totalStrength / count;
      const strengthMultiplier = 1 + (avgStrength - 1) * 0.33;

      const c = getOrCreate(personId, {
        name: person.name,
        avatarUrl: person.avatarUrl,
        headline: person.headline,
        company: person.company,
        location: person.location,
        skills: normalizeSkills(Array.isArray(person.skills) ? (person.skills as string[]) : []),
        interests: normalizeSkills(Array.isArray(person.interests) ? (person.interests as string[]) : []),
        githubLogin: person.githubLogin,
      });
      c.score += count * 2 * strengthMultiplier;
      c.reasons.push(`${count} mutual connection${count > 1 ? "s" : ""}`);
      c.reasonDetails.mutualConnections = connections;
    }

    // --- Signal 2: Skills & interests overlap with "me" node ---
    // Checks existing people in the DB who aren't yet connected to anyone.
    // Recency weighting: recently updated profiles get a small freshness boost.
    if (meNode) {
      for (const person of existingPeople) {
        if (person.id === meNode.id) continue;
        if (adjacency.has(person.id)) continue;
        const personSkills = normalizeSkills(Array.isArray(person.skills) ? (person.skills as string[]) : []);
        const personInterests = normalizeSkills(Array.isArray(person.interests) ? (person.interests as string[]) : []);

        const sharedSkills = overlap(mySkills, personSkills);
        const sharedInterests = overlap(myInterests, personInterests);

        if (sharedSkills.length > 0 || sharedInterests.length > 0) {
          // Recency boost: profiles updated in last 30 days get 1.1x
          const profileAgeDays = (Date.now() - new Date(person.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
          const freshnessBoost = profileAgeDays < 30 ? 1.1 : 1.0;

          const c = getOrCreate(person.id, {
            name: person.name,
            company: person.company,
            location: person.location,
            githubLogin: person.githubLogin,
          });
          c.score += (sharedSkills.length + sharedInterests.length * 1.5) * freshnessBoost;
          if (sharedSkills.length > 0) {
            c.reasons.push(`Shares skills: ${sharedSkills.slice(0, 3).join(", ")}`);
            c.reasonDetails.sharedSkills = sharedSkills;
          }
          if (sharedInterests.length > 0) {
            c.reasons.push(`Shares interests: ${sharedInterests.slice(0, 3).join(", ")}`);
            c.reasonDetails.sharedInterests = sharedInterests;
          }
        }
      }
    }

    // --- Signal 3: Company & location matches ---
    if (meNode) {
      for (const person of existingPeople) {
        if (person.id === meNode.id) continue;
        if (adjacency.has(person.id)) continue;

        const c = getOrCreate(person.id, {
          name: person.name,
          company: person.company,
          location: person.location,
          githubLogin: person.githubLogin,
        });

        if (myCompany && person.company?.toLowerCase() === myCompany) {
          c.score += 2;
          c.reasons.push(`Works at ${person.company}`);
          c.reasonDetails.company = person.company;
        }
        if (myLocation && person.location?.toLowerCase() === myLocation) {
          c.score += 1;
          c.reasons.push(`Located in ${person.location}`);
          c.reasonDetails.location = person.location;
        }
      }
    }

    // --- Signal 4: GitHub contributors (with recency weighting) ---
    const token = await getGitHubToken(userId);
    if (token) {
      try {
        const repos = await fetchGitHubRepos(token);
        for (const repo of repos.slice(0, 5)) {
          try {
            const [owner, repoName] = repo.full_name.split("/");
            const contributors = await fetchGitHubRepoContributors(token, owner, repoName);

            // Recency factor: repos updated in last 90 days get full score,
            // decaying to 0.3 over ~2 years
            const repoAgeDays = (Date.now() - new Date(repo.updated_at).getTime()) / (1000 * 60 * 60 * 24);
            const recencyFactor = repoAgeDays < 90
              ? 1
              : repoAgeDays < 365
                ? 1 - ((repoAgeDays - 90) / 510) * 0.7
                : 0.3;

            for (const contributor of contributors) {
              if (existingLogins.has(contributor.login)) continue;

              const c = getOrCreate(contributor.login, {
                name: contributor.name ?? contributor.login,
                avatarUrl: contributor.avatar_url,
                githubLogin: contributor.login,
              });
              c.score += recencyFactor;
              if (!c.reasonDetails.contributedRepos) {
                c.reasonDetails.contributedRepos = [];
              }
              if (!c.reasonDetails.contributedRepos.includes(repo.name)) {
                c.reasonDetails.contributedRepos.push(repo.name);
              }
              if (!c.reasons.some((r) => r.startsWith("Contributor to"))) {
                c.reasons.push(`Contributor to ${repo.name}`);
              } else {
                const idx = c.reasons.findIndex((r) => r.startsWith("Contributor to"));
                if (idx >= 0) {
                  c.reasons[idx] = `Contributor to multiple repos`;
                }
              }
            }
          } catch {
            // Skip repos where we can't fetch contributors
          }
        }
      } catch {
        // GitHub token might be expired or invalid, skip GitHub signals
      }
}

    // --- Step 6: Enrich GitHub-only candidates ---
    // For candidates with a githubLogin, merge DB profile data and fetch
    // GitHub profiles to enable skills/interests/company/location matching.

    const loginToPerson = new Map<string, (typeof existingPeople)[number]>();
    for (const p of existingPeople) {
      if (p.githubLogin) loginToPerson.set(p.githubLogin, p);
    }

    const sortedCandidates = Array.from(candidates.values())
      .filter((c) => c.githubLogin && c.score > 0)
      .sort((a, b) => b.score - a.score);

    const needsGithubFetch: Candidate[] = [];
    for (const c of sortedCandidates) {
      if (!c.githubLogin) continue;
      const dbPerson = loginToPerson.get(c.githubLogin);
      if (dbPerson) {
        const dbSkills = normalizeSkills(Array.isArray(dbPerson.skills) ? (dbPerson.skills as string[]) : []);
        const dbInterests = normalizeSkills(Array.isArray(dbPerson.interests) ? (dbPerson.interests as string[]) : []);
        if (c.skills.length === 0 && dbSkills.length > 0) c.skills = dbSkills;
        if (c.interests.length === 0 && dbInterests.length > 0) c.interests = dbInterests;
        if (!c.company && dbPerson.company) c.company = dbPerson.company;
        if (!c.location && dbPerson.location) c.location = dbPerson.location;
        if (!c.headline && dbPerson.headline) c.headline = dbPerson.headline;
      } else if (!c.company && !c.location) {
        needsGithubFetch.push(c);
      }
    }

    // Fetch GitHub profiles for top candidates missing company/location (max 10)
    // Also fetch their repos to extract skills (language + topics)
    if (token && needsGithubFetch.length > 0) {
      const toFetch = needsGithubFetch.slice(0, 10);
      await Promise.allSettled(
        toFetch.map(async (c) => {
          if (!c.githubLogin || !token) return;
          try {
            const profile = await githubFetch<{
              company: string | null;
              location: string | null;
              bio: string | null;
              avatar_url: string;
              name: string | null;
            }>(token, `/users/${c.githubLogin}`);
            if (!c.company && profile.company) c.company = profile.company;
            if (!c.location && profile.location) c.location = profile.location;
            if (!c.headline && profile.bio) c.headline = profile.bio;
            if (profile.name && c.name === c.githubLogin) c.name = profile.name;
            if (profile.avatar_url && c.avatarUrl === autoAvatarUrl(c.name)) {
              c.avatarUrl = profile.avatar_url;
            }
          } catch {
            // Skip on rate limit or other errors
          }

          // Extract skills from repos (always overwrite)
          try {
            const repos = await fetchUserRepos(token, c.githubLogin, 1);
            const skills = extractSkillsFromRepos(repos);
            c.skills = skills;
          } catch {
            // Skip repo fetch on error
          }
        }),
      );
    }

    // Re-run skills/interests/company/location overlap with "me" node
    // (now using normalized skills for accurate matching)
    for (const c of sortedCandidates) {
      const normalizedSkills = normalizeSkills(c.skills);
      const normalizedInterests = normalizeSkills(c.interests);

      if (normalizedSkills.length > 0 || normalizedInterests.length > 0) {
        const sharedSkills = overlap(mySkills, normalizedSkills);
        const sharedInterests = overlap(myInterests, normalizedInterests);

        if (sharedSkills.length > 0 && !c.reasonDetails.sharedSkills) {
          c.score += sharedSkills.length;
          c.reasons.push(`Shares skills: ${sharedSkills.slice(0, 3).join(", ")}`);
          c.reasonDetails.sharedSkills = sharedSkills;
        }
        if (sharedInterests.length > 0 && !c.reasonDetails.sharedInterests) {
          c.score += sharedInterests.length * 1.5;
          c.reasons.push(`Shares interests: ${sharedInterests.slice(0, 3).join(", ")}`);
          c.reasonDetails.sharedInterests = sharedInterests;
        }
      }

      // Company & location match
      if (myCompany && c.company?.toLowerCase() === myCompany && !c.reasonDetails.company) {
        c.score += 2;
        c.reasons.push(`Works at ${c.company}`);
        c.reasonDetails.company = c.company;
      }
      if (myLocation && c.location?.toLowerCase() === myLocation && !c.reasonDetails.location) {
        c.score += 1;
        c.reasons.push(`Located in ${c.location}`);
        c.reasonDetails.location = c.location;
      }
    }

    // --- Step 7: Sort, diversity cap, and return ---
    const sorted = Array.from(candidates.values())
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    // Diversity: cap at 4 from same company, 3 from same location
    const companyCounts = new Map<string, number>();
    const locationCounts = new Map<string, number>();
    const diversified: Candidate[] = [];

    for (const c of sorted) {
      const compKey = c.company?.toLowerCase() ?? "";
      const locKey = c.location?.toLowerCase() ?? "";

      if (compKey && (companyCounts.get(compKey) ?? 0) >= 4) continue;
      if (locKey && (locationCounts.get(locKey) ?? 0) >= 3) continue;

      diversified.push(c);
      if (compKey) companyCounts.set(compKey, (companyCounts.get(compKey) ?? 0) + 1);
      if (locKey) locationCounts.set(locKey, (locationCounts.get(locKey) ?? 0) + 1);
    }

    const results = diversified.slice(0, 20);

    return NextResponse.json({ recommendations: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
