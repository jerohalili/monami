// POST /api/github/sync-indirect — discover followers/following of your GitHub connections.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import {
  getGitHubToken,
  fetchGitHubProfile,
  fetchUserFollowers,
  fetchUserFollowing,
  getRateLimitRemaining,
  type GitHubUser,
} from "@/lib/github";

const MIN_RATE_LIMIT = 500;

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const isRetryable = msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("503");
    if (retries > 0 && isRetryable) {
      await new Promise((r) => setTimeout(r, 2000));
      return fetchWithRetry(fn, retries - 1);
    }
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();

    const token = await getGitHubToken(userId);
    if (!token) {
      return NextResponse.json(
        { error: "GitHub account not linked or token expired. Please sign in with GitHub again." },
        { status: 400 },
      );
    }

    // Validate token
    try {
      await fetchGitHubProfile(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("401")) {
        return NextResponse.json(
          { error: "GitHub token is invalid. Please sign in with GitHub again." },
          { status: 401 },
        );
      }
    }

    // Parse optional body
    let maxConnections = 20;
    try {
      const body = await req.json().catch(() => null);
      if (body?.maxConnections != null && typeof body.maxConnections === "number") {
        maxConnections = Math.min(Math.max(Math.round(body.maxConnections), 0), 100);
      }
    } catch { /* GET or invalid JSON — use default */ }

    // Check initial rate limit
    const rateLimit = await getRateLimitRemaining(token);
    if (rateLimit.remaining < MIN_RATE_LIMIT) {
      return NextResponse.json(
        { error: `GitHub API rate limit low (${rateLimit.remaining} remaining). Try again after ${new Date(rateLimit.reset * 1000).toLocaleTimeString()}.` },
        { status: 429 },
      );
    }

    // Clean up previous indirect nodes first (raw SQL for JSON array matching)
    const staleIds: { id: string }[] = await db.$queryRaw`
      SELECT id FROM "Person" WHERE tags::text LIKE '%github_indirect%'
    `;
    if (staleIds.length > 0) {
      const ids = staleIds.map((p) => p.id);
      await db.edge.deleteMany({
        where: {
          OR: [
            { sourceId: { in: ids } },
            { targetId: { in: ids } },
          ],
        },
      });
      await db.person.deleteMany({ where: { id: { in: ids } } });
    }

    // If maxConnections is 0, just clean up and return
    if (maxConnections === 0) {
      return NextResponse.json({
        connectionsExplored: 0,
        indirectFound: 0,
        created: 0,
        skipped: 0,
        apiCallsUsed: 0,
        warnings: [],
        cleanedUp: staleIds.length,
      });
    }

    // Re-fetch people after cleanup
    const people = await db.person.findMany({ where: { userId } });
    const you = people.find((p) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return tags.includes("me");
    });

    if (!you) {
      return NextResponse.json({ error: "No 'You' node found" }, { status: 404 });
    }

    // Get direct GitHub connections (prioritize mutuals, then by edge strength)
    const edges = await db.edge.findMany({
      where: {
        sourceId: you.id,
        origin: "github",
      },
    });

    const edgeByTarget = new Map(edges.map((e) => [e.targetId, e]));
    const directConnections = people
      .filter((p) => {
        const tags = Array.isArray(p.tags) ? p.tags : [];
        return tags.includes("github") && p.githubLogin && p.id !== you.id;
      })
      .sort((a, b) => {
        const edgeA = edgeByTarget.get(a.id);
        const edgeB = edgeByTarget.get(b.id);
        const strengthA = edgeA?.strength ?? 0;
        const strengthB = edgeB?.strength ?? 0;
        return strengthB - strengthA;
      })
      .slice(0, maxConnections);

    if (directConnections.length === 0) {
      return NextResponse.json(
        { error: "No GitHub connections found. Run 'Sync' first to import your followers/following." },
        { status: 400 },
      );
    }

    // Index existing people by githubLogin
    const byGithubLogin = new Map<string, (typeof people)[0]>();
    for (const p of people) {
      if (p.githubLogin) byGithubLogin.set(p.githubLogin, p);
    }

    let apiCallsUsed = 0;
    let indirectFound = 0;
    let created = 0;
    let skipped = 0;
    const warnings: string[] = [];
    const processedLogins = new Set<string>();

    // Process each direct connection
    for (const connection of directConnections) {
      // Check rate limit every 5 connections
      if (apiCallsUsed > 0 && apiCallsUsed % 5 === 0) {
        const rl = await getRateLimitRemaining(token);
        if (rl.remaining < MIN_RATE_LIMIT) {
          warnings.push(`Rate limit low — stopped after exploring ${apiCallsUsed / 2} connections`);
          break;
        }
      }

      const login = connection.githubLogin!;

      // Fetch only 1 page (max 100) for followers and following
      const [followersResult, followingResult] = await Promise.allSettled([
        fetchWithRetry(() => fetchUserFollowers(token, login, 1)),
        fetchWithRetry(() => fetchUserFollowing(token, login, 1)),
      ]);

      apiCallsUsed += 2;

      const allFollowers: GitHubUser[] = followersResult.status === "fulfilled" ? followersResult.value : [];
      const allFollowing: GitHubUser[] = followingResult.status === "fulfilled" ? followingResult.value : [];

      if (followersResult.status === "rejected") {
        const reason = followersResult.reason;
        const msg = reason instanceof Error ? reason.message : "";
        if (!msg.includes("403") && !msg.includes("404")) {
          warnings.push(`Could not fetch followers of ${login}`);
        }
      }
      if (followingResult.status === "rejected") {
        const reason = followingResult.reason;
        const msg = reason instanceof Error ? reason.message : "";
        if (!msg.includes("403") && !msg.includes("404")) {
          warnings.push(`Could not fetch following of ${login}`);
        }
      }

      // Limit to top N per list
      const followers = allFollowers.slice(0, maxConnections);
      const following = allFollowing.slice(0, maxConnections);

      // Combine and dedupe
      const allIndirect = new Map<string, GitHubUser>();
      for (const u of [...followers, ...following]) {
        if (!allIndirect.has(u.login)) allIndirect.set(u.login, u);
      }

      for (const [indirectLogin, gh] of allIndirect) {
        if (byGithubLogin.has(indirectLogin) || processedLogins.has(indirectLogin)) continue;
        if (indirectLogin === login) continue;

        processedLogins.add(indirectLogin);
        indirectFound++;

        const isFollowerOfConnection = followers.some((u) => u.login === indirectLogin);
        const isFollowingConnection = following.some((u) => u.login === indirectLogin);

        let relationshipLabel: string;
        if (isFollowerOfConnection && isFollowingConnection) {
          relationshipLabel = `Mutual follow with ${login} on GitHub`;
        } else if (isFollowingConnection) {
          relationshipLabel = `${login} follows them on GitHub`;
        } else {
          relationshipLabel = `Followed by ${login} on GitHub`;
        }

        try {
          const person = await db.person.create({
            data: {
              userId,
              name: gh.login,
              avatarUrl: gh.avatar_url,
              githubLogin: gh.login,
              skills: [],
              interests: [],
              tags: ["github", "github_indirect"],
              links: {},
            },
          });

          // Edge goes from the connection to the indirect person, not from You
          await db.edge.create({
            data: {
              sourceId: connection.id,
              targetId: person.id,
              origin: "github_indirect",
              strength: 1,
              context: relationshipLabel,
              communities: [],
              projects: [],
            },
          });

          created++;
        } catch {
          skipped++;
        }
      }
    }

    return NextResponse.json({
      connectionsExplored: directConnections.length,
      indirectFound,
      created,
      skipped,
      apiCallsUsed,
      warnings,
      cleanedUp: staleIds.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
