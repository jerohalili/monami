// GET /api/recommendations — multi-signal people recommendations.
// Combines: mutual connections, skills/interests overlap, company/location, GitHub data.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import { autoAvatarUrl, overlap } from "@/lib/model";
import {
  getGitHubToken,
  fetchGitHubRepos,
  fetchGitHubRepoContributors,
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
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();

    // Fetch the user's "me" node for skills/interests/company/location comparison
    const meNode = await db.person.findFirst({
      where: { userId, tags: { array_contains: "me" } },
    });

    // Fetch all existing people in the network (to find mutual connections and exclude)
    const existingPeople = await db.person.findMany({
      where: { userId },
      select: { id: true, githubLogin: true, name: true, skills: true, interests: true, company: true, location: true, headline: true },
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

    // Build adjacency: personId -> Set of connected personIds
    const adjacency = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!adjacency.has(e.sourceId)) adjacency.set(e.sourceId, new Set());
      if (!adjacency.has(e.targetId)) adjacency.set(e.targetId, new Set());
      adjacency.get(e.sourceId)!.add(e.targetId);
      adjacency.get(e.targetId)!.add(e.sourceId);
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
    // Find people connected to 2+ of the user's existing contacts but not in the network
    const secondDegreeCounts = new Map<string, { count: number; connections: string[] }>();

    for (const [personId, neighbors] of adjacency) {
      if (!existingIds.has(personId)) continue;
      for (const neighborId of neighbors) {
        if (existingIds.has(neighborId)) continue;
        const existing = secondDegreeCounts.get(neighborId);
        if (existing) {
          existing.count++;
          const person = existingPeople.find((p) => p.id === personId);
          if (person) existing.connections.push(person.name);
        } else {
          const person = existingPeople.find((p) => p.id === personId);
          secondDegreeCounts.set(neighborId, {
            count: 1,
            connections: person ? [person.name] : [],
          });
        }
      }
    }

    // These are people in the DB who are second-degree connections
    for (const [personId, { count, connections }] of secondDegreeCounts) {
      if (count < 2) continue; // Need at least 2 mutual connections
      const person = await db.person.findUnique({ where: { id: personId } });
      if (!person) continue;

      const c = getOrCreate(personId, {
        name: person.name,
        avatarUrl: person.avatarUrl,
        headline: person.headline,
        company: person.company,
        location: person.location,
        skills: Array.isArray(person.skills) ? (person.skills as string[]) : [],
        interests: Array.isArray(person.interests) ? (person.interests as string[]) : [],
        githubLogin: person.githubLogin,
      });
      c.score += count * 2;
      c.reasons.push(`${count} mutual connection${count > 1 ? "s" : ""}`);
      c.reasonDetails.mutualConnections = connections;
    }

    // --- Signal 2: Skills & interests overlap with "me" node ---
    if (meNode) {
      const mySkills: string[] = Array.isArray(meNode.skills) ? (meNode.skills as string[]) : [];
      const myInterests: string[] = Array.isArray(meNode.interests) ? (meNode.interests as string[]) : [];

      // Check skills/interests overlap with existing people (might be useful for weak connections)
      for (const person of existingPeople) {
        if (adjacency.has(person.id)) continue; // Skip people already connected to someone
        const personSkills: string[] = Array.isArray(person.skills) ? (person.skills as string[]) : [];
        const personInterests: string[] = Array.isArray(person.interests) ? (person.interests as string[]) : [];

        const sharedSkills = overlap(mySkills, personSkills);
        const sharedInterests = overlap(myInterests, personInterests);

        if (sharedSkills.length > 0 || sharedInterests.length > 0) {
          const c = getOrCreate(person.id, {
            name: person.name,
            company: person.company,
            location: person.location,
            githubLogin: person.githubLogin,
          });
          c.score += sharedSkills.length + sharedInterests.length * 1.5;
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
      const myCompany = meNode.company?.toLowerCase();
      const myLocation = meNode.location?.toLowerCase();

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

    // --- Signal 4: GitHub contributors ---
    const token = await getGitHubToken(userId);
    if (token) {
      try {
        const repos = await fetchGitHubRepos(token);
        for (const repo of repos.slice(0, 5)) {
          try {
            const [owner, repoName] = repo.full_name.split("/");
            const contributors = await fetchGitHubRepoContributors(token, owner, repoName);
            for (const contributor of contributors) {
              if (existingLogins.has(contributor.login)) continue;

              const c = getOrCreate(contributor.login, {
                name: contributor.name ?? contributor.login,
                avatarUrl: contributor.avatar_url,
                githubLogin: contributor.login,
              });
              c.score += 1;
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

    // --- Step 5: Enrich GitHub-only candidates ---
    // For candidates with a githubLogin, merge DB profile data and fetch
    // GitHub profiles to enable skills/interests/company/location matching.

    // Build a lookup: githubLogin -> existingPerson
    const loginToPerson = new Map<string, (typeof existingPeople)[number]>();
    for (const p of existingPeople) {
      if (p.githubLogin) loginToPerson.set(p.githubLogin, p);
    }

    // Sort candidates by score to prioritize enrichment of top candidates
    const sortedCandidates = Array.from(candidates.values())
      .filter((c) => c.githubLogin && c.score > 0)
      .sort((a, b) => b.score - a.score);

    // Merge DB profiles and collect logins needing GitHub profile fetch
    const needsGithubFetch: Candidate[] = [];
    for (const c of sortedCandidates) {
      if (!c.githubLogin) continue;
      const dbPerson = loginToPerson.get(c.githubLogin);
      if (dbPerson) {
        // Merge profile data from DB if candidate is missing it
        const dbSkills: string[] = Array.isArray(dbPerson.skills) ? (dbPerson.skills as string[]) : [];
        const dbInterests: string[] = Array.isArray(dbPerson.interests) ? (dbPerson.interests as string[]) : [];
        if (c.skills.length === 0 && dbSkills.length > 0) c.skills = dbSkills;
        if (c.interests.length === 0 && dbInterests.length > 0) c.interests = dbInterests;
        if (!c.company && dbPerson.company) c.company = dbPerson.company;
        if (!c.location && dbPerson.location) c.location = dbPerson.location;
        if (!c.headline && dbPerson.headline) c.headline = dbPerson.headline;
      } else if (!c.company && !c.location) {
        // No DB match and missing profile data — fetch from GitHub
        needsGithubFetch.push(c);
      }
    }

    // Fetch GitHub profiles for top candidates missing company/location (max 10)
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
        }),
      );
    }

    // Re-run skills/interests/company/location overlap with "me" node
    if (meNode) {
      const mySkills: string[] = Array.isArray(meNode.skills) ? (meNode.skills as string[]) : [];
      const myInterests: string[] = Array.isArray(meNode.interests) ? (meNode.interests as string[]) : [];
      const myCompany = meNode.company?.toLowerCase();
      const myLocation = meNode.location?.toLowerCase();

      for (const c of sortedCandidates) {
        // Skills & interests overlap
        if (c.skills.length > 0 || c.interests.length > 0) {
          const sharedSkills = overlap(mySkills, c.skills);
          const sharedInterests = overlap(myInterests, c.interests);

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
    }

    // Sort by score descending, return top 20
    const results = Array.from(candidates.values())
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    return NextResponse.json({ recommendations: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
