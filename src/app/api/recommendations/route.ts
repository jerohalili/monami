// GET /api/recommendations — multi-signal people recommendations.
// Combines: skills/interests overlap, company/location, GitHub contributors,
// GitHub starred repos, GitHub followers/following.
// Improvements: skill normalization, recency weighting, diversity cap.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import { autoAvatarUrl, overlap } from "@/lib/model";
import { normalizeSkills, extractSkillsFromRepos } from "@/lib/skills";
import {
  getGitHubToken,
  fetchGitHubRepos,
  fetchGitHubStarredRepos,
  fetchGitHubRepoContributors,
  fetchGitHubFollowers,
  fetchGitHubFollowing,
  fetchUserRepos,
  githubFetch,
  getRateLimitRemaining,
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

    // Build adjacency map (bidirectional)
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

    // --- Signal 1: Skills & interests overlap with "me" node ---
    // Checks people in the DB who aren't directly connected to "you".
    // Recency weighting: recently updated profiles get a small freshness boost.
    if (meNode) {
      const myConnections = adjacency.get(meNode.id) ?? new Set();
      for (const person of existingPeople) {
        if (person.id === meNode.id) continue;
        if (myConnections.has(person.id)) continue;
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

    // --- Signal 2: Company & location matches ---
    if (meNode) {
      const myConnections = adjacency.get(meNode.id) ?? new Set();
      for (const person of existingPeople) {
        if (person.id === meNode.id) continue;
        if (myConnections.has(person.id)) continue;

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

    // --- Signal 3: GitHub contributors (with recency weighting) ---
    const token = await getGitHubToken(userId);
    let canCallGitHub = true;
    if (token) {
      try {
        const rateLimit = await getRateLimitRemaining(token);
        if (rateLimit.remaining < 30) canCallGitHub = false;
      } catch {
        // If we can't check rate limit, assume we can proceed
      }
    }

    if (token && canCallGitHub) {
      try {
        // Own repos (up to 15)
        const repos = await fetchGitHubRepos(token);
        for (const repo of repos.slice(0, 15)) {
          try {
            const [owner, repoName] = repo.full_name.split("/");
            const contributors = await fetchGitHubRepoContributors(token, owner, repoName);

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

        // Starred repos contributors (up to 10)
        try {
          const starredRepos = await fetchGitHubStarredRepos(token);
          for (const repo of starredRepos.slice(0, 10)) {
            try {
              const [owner, repoName] = repo.full_name.split("/");
              const contributors = await fetchGitHubRepoContributors(token, owner, repoName);

              const repoAgeDays = (Date.now() - new Date(repo.updated_at).getTime()) / (1000 * 60 * 60 * 24);
              const recencyFactor = (repoAgeDays < 90 ? 1 : repoAgeDays < 365 ? 1 - ((repoAgeDays - 90) / 510) * 0.7 : 0.3) * 0.5;

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
          // Starred repos fetch might fail on rate limit
        }
      } catch {
        // GitHub token might be expired or invalid, skip GitHub signals
      }
    }

    // --- Signal 4: GitHub followers/following not in network ---
    if (token && canCallGitHub) {
      try {
        const [followers, following] = await Promise.all([
          fetchGitHubFollowers(token),
          fetchGitHubFollowing(token),
        ]);

        const followerLogins = new Set(followers.map((u) => u.login));
        const followingLogins = new Set(following.map((u) => u.login));

        // Mutual follows (both follower and following) get higher score
        for (const user of followers) {
          if (existingLogins.has(user.login)) continue;
          const isMutual = followingLogins.has(user.login);
          const c = getOrCreate(user.login, {
            name: user.login,
            avatarUrl: user.avatar_url,
            githubLogin: user.login,
          });
          c.score += isMutual ? 3 : 1;
          if (isMutual && !c.reasons.some((r) => r.includes("mutual follow"))) {
            c.reasons.push(`Mutual follow on GitHub`);
          } else if (!isMutual && !c.reasons.some((r) => r.includes("follows you"))) {
            c.reasons.push(`Follows you on GitHub`);
          }
        }

        for (const user of following) {
          if (existingLogins.has(user.login)) continue;
          const isMutual = followerLogins.has(user.login);
          const c = getOrCreate(user.login, {
            name: user.login,
            avatarUrl: user.avatar_url,
            githubLogin: user.login,
          });
          // Only add score if not already scored from followers loop
          if (!c.reasons.some((r) => r.includes("follow"))) {
            c.score += isMutual ? 3 : 1;
            if (isMutual) {
              c.reasons.push(`Mutual follow on GitHub`);
            } else {
              c.reasons.push(`You follow on GitHub`);
            }
          }
        }
      } catch {
        // Followers/following fetch might fail on rate limit
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

    // Diversity: cap at 6 from same company, 5 from same location
    const companyCounts = new Map<string, number>();
    const locationCounts = new Map<string, number>();
    const diversified: Candidate[] = [];

    for (const c of sorted) {
      const compKey = c.company?.toLowerCase() ?? "";
      const locKey = c.location?.toLowerCase() ?? "";

      if (compKey && (companyCounts.get(compKey) ?? 0) >= 6) continue;
      if (locKey && (locationCounts.get(locKey) ?? 0) >= 5) continue;

      diversified.push(c);
      if (compKey) companyCounts.set(compKey, (companyCounts.get(compKey) ?? 0) + 1);
      if (locKey) locationCounts.set(locKey, (locationCounts.get(locKey) ?? 0) + 1);
    }

    for (const c of diversified) {
      c.score = Math.round(c.score * 100) / 100;
    }

    const results = diversified.slice(0, 30);

    return NextResponse.json({ recommendations: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
