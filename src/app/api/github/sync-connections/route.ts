// POST /api/github/sync-connections — import GitHub followers and following as graph nodes.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import {
  getGitHubToken,
  fetchGitHubProfile,
  fetchGitHubFollowers,
  fetchGitHubFollowing,
  type GitHubUser,
} from "@/lib/github";

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

export async function POST() {
  try {
    const userId = await requireUserId();

    const token = await getGitHubToken(userId);
    if (!token) {
      return NextResponse.json(
        { error: "GitHub account not linked or token expired. Please sign in with GitHub again." },
        { status: 400 },
      );
    }

    // Validate token is still valid by fetching profile
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
      // Other errors (rate limit, network) — continue, will be caught below
    }

    // Fetch following and followers with retry, using allSettled for partial success
    const [followingResult, followersResult] = await Promise.allSettled([
      fetchWithRetry(() => fetchGitHubFollowing(token)),
      fetchWithRetry(() => fetchGitHubFollowers(token)),
    ]);

    const following: GitHubUser[] = followingResult.status === "fulfilled" ? followingResult.value : [];
    const followers: GitHubUser[] = followersResult.status === "fulfilled" ? followersResult.value : [];

    // If both failed, return error
    if (followingResult.status === "rejected" && followersResult.status === "rejected") {
      const msg = followingResult.reason instanceof Error
        ? followingResult.reason.message
        : "GitHub API request failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Track partial failures for user notification
    const warnings: string[] = [];
    if (followingResult.status === "rejected") {
      warnings.push("Could not fetch following list");
    }
    if (followersResult.status === "rejected") {
      warnings.push("Could not fetch followers list");
    }

    // Build sets for relationship classification
    const followingLogins = new Set(following.map((u) => u.login));
    const followerLogins = new Set(followers.map((u) => u.login));

    // Deduplicate by login into a single list
    const allUsers = new Map<string, GitHubUser>();
    for (const u of [...following, ...followers]) {
      if (!allUsers.has(u.login)) allUsers.set(u.login, u);
    }

    // Find the user's "You" person node
    const people = await db.person.findMany({ where: { userId } });
    const you = people.find((p) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return tags.includes("me");
    });

    if (!you) {
      return NextResponse.json(
        { error: "No 'You' node found" },
        { status: 404 },
      );
    }

    // Index existing people by githubLogin for fast lookup
    const byGithubLogin = new Map<string, (typeof people)[0]>();
    for (const p of people) {
      if (p.githubLogin) byGithubLogin.set(p.githubLogin, p);
    }

    let created = 0;
    let matched = 0;
    let skipped = 0;

    // Process each GitHub user
    for (const [login, gh] of allUsers) {
      // Find or create person
      let person = byGithubLogin.get(login) ?? null;

      if (!person) {
        // Create new Person node with appropriate tags
        const tags: string[] = ["github"];
        const isFollowing = followingLogins.has(login);
        const isFollower = followerLogins.has(login);

        if (isFollowing && !isFollower) {
          tags.push("github_following");
        } else if (!isFollowing && isFollower) {
          tags.push("github_follower");
        }
        // Mutual follow → just "github"

        person = await db.person.create({
          data: {
            userId,
            name: gh.login,
            avatarUrl: gh.avatar_url,
            githubLogin: gh.login,
            skills: [],
            interests: [],
            tags,
            links: {},
          },
        });
        created++;
      } else {
        matched++;

        // Overwrite details for auto-imported nodes (has "github" tag)
        const personTags = Array.isArray(person.tags) ? person.tags : [];
        if (personTags.includes("github")) {
          const newTags = [...personTags];
          const isFollowing = followingLogins.has(login);
          const isFollower = followerLogins.has(login);

          // Update following tag
          if (isFollowing && !newTags.includes("github_following")) {
            newTags.push("github_following");
          } else if (!isFollowing) {
            const idx = newTags.indexOf("github_following");
            if (idx !== -1) newTags.splice(idx, 1);
          }

          // Update follower tag
          if (isFollower && !newTags.includes("github_follower")) {
            newTags.push("github_follower");
          } else if (!isFollower) {
            const idx = newTags.indexOf("github_follower");
            if (idx !== -1) newTags.splice(idx, 1);
          }

          await db.person.update({
            where: { id: person.id },
            data: {
              name: gh.login,
              avatarUrl: gh.avatar_url,
              tags: newTags,
            },
          });
        }
      }

      // Delete any reverse-direction edge before upserting to avoid duplicates
      try {
        const reverseEdge = await db.edge.findUnique({
          where: { sourceId_targetId: { sourceId: person.id, targetId: you.id } },
        });
        if (reverseEdge) {
          await db.edge.delete({ where: { id: reverseEdge.id } });
        }
      } catch { /* ignore */ }

      // Upsert edge between "You" and this person
      const isMutual = followingLogins.has(login) && followerLogins.has(login);
      const strength = isMutual ? 2 : 1;
      const context = isMutual
        ? "Mutual follow on GitHub"
        : followingLogins.has(login)
          ? "You follow them on GitHub"
          : "They follow you on GitHub";

      try {
        await db.edge.upsert({
          where: {
            sourceId_targetId: {
              sourceId: you.id,
              targetId: person.id,
            },
          },
          create: {
            sourceId: you.id,
            targetId: person.id,
            origin: "github",
            strength,
            context,
            communities: [],
            projects: [],
          },
          update: {
            strength,
            context,
          },
        });
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({ created, matched, skipped, warnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
