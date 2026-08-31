// POST /api/github/sync-connections — import GitHub followers and following as graph nodes.
// Optional body: { filter: "all" | "following" | "mutual" }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import {
  getGitHubToken,
  fetchGitHubProfile,
  fetchGitHubFollowers,
  fetchGitHubFollowing,
  fetchUserFollowers,
  getRateLimitRemaining,
  githubFetch,
  type GitHubUser,
} from "@/lib/github";
import { fetchWithRetry, MIN_RATE_LIMIT } from "@/lib/github-utils";

type SyncFilter = "all" | "following" | "mutual";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();

    // Parse filter from body
    let filter: SyncFilter = "all";
    try {
      const body = await req.json().catch(() => null);
      if (body?.filter && ["all", "following", "mutual"].includes(body.filter)) {
        filter = body.filter;
      }
    } catch { /* GET or invalid JSON — use default */ }

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

    // Apply filter
    if (filter === "following") {
      for (const login of allUsers.keys()) {
        if (!followingLogins.has(login)) allUsers.delete(login);
      }
    } else if (filter === "mutual") {
      for (const login of allUsers.keys()) {
        if (!(followingLogins.has(login) && followerLogins.has(login))) allUsers.delete(login);
      }
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

        // Fetch GitHub profile for company/location/bio
        let profileData: { company: string | null; location: string | null; bio: string | null; name: string | null } | null = null;
        try {
          profileData = await githubFetch<{
            company: string | null;
            location: string | null;
            bio: string | null;
            name: string | null;
          }>(token, `/users/${login}`);
        } catch {
          // Skip profile fetch on error — create person with basic data
        }

        person = await db.person.create({
          data: {
            userId,
            name: profileData?.name || gh.login,
            avatarUrl: gh.avatar_url,
            githubLogin: gh.login,
            company: profileData?.company || null,
            location: profileData?.location || null,
            headline: profileData?.bio || null,
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

          // Refresh profile data for github-tagged people
          try {
            const profile = await githubFetch<{
              company: string | null;
              location: string | null;
              bio: string | null;
              name: string | null;
            }>(token, `/users/${login}`);
            const updateData: Record<string, unknown> = {};
            if (profile.company) updateData.company = profile.company;
            if (profile.location) updateData.location = profile.location;
            if (profile.bio) updateData.headline = profile.bio;
            if (profile.name) updateData.name = profile.name;
            if (Object.keys(updateData).length > 0) {
              await db.person.update({ where: { id: person.id }, data: updateData });
            }
          } catch {
            // Skip profile refresh on error
          }
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

    // --- Cross-edges: connect imported people who follow each other ---
    let crossEdgesCreated = 0;
    const importedLogins = [...allUsers.keys()];
    const apiCallsUsed = { count: 0 };

    // Check rate limit before starting cross-edge phase
    const rl = await getRateLimitRemaining(token);
    if (rl.remaining < MIN_RATE_LIMIT) {
      warnings.push("Skipped cross-edges: rate limit too low");
    } else {
      // Re-fetch people list after creation to get updated data
      const updatedPeople = await db.person.findMany({ where: { userId } });
      const updatedByLogin = new Map<string, (typeof updatedPeople)[0]>();
      for (const p of updatedPeople) {
        if (p.githubLogin) updatedByLogin.set(p.githubLogin, p);
      }

      for (const login of importedLogins) {
        // Check rate limit every 5 people
        if (apiCallsUsed.count > 0 && apiCallsUsed.count % 5 === 0) {
          const r = await getRateLimitRemaining(token);
          if (r.remaining < MIN_RATE_LIMIT) {
            warnings.push("Rate limit low — stopped cross-edges early");
            break;
          }
        }

        const personA = updatedByLogin.get(login);
        if (!personA) continue;

        // Fetch this person's followers (1 page)
        let personFollowers: GitHubUser[];
        try {
          personFollowers = await fetchWithRetry(() => fetchUserFollowers(token, login, 1));
          apiCallsUsed.count++;
        } catch {
          continue;
        }

        // Check if any of their followers are also in our graph
        for (const follower of personFollowers) {
          const personB = updatedByLogin.get(follower.login);
          if (!personB || personB.id === personA.id) continue;

          // Skip if edge already exists (either direction)
          const existingEdge = await db.edge.findUnique({
            where: { sourceId_targetId: { sourceId: personA.id, targetId: personB.id } },
          }).catch(() => null);
          const reverseEdge = await db.edge.findUnique({
            where: { sourceId_targetId: { sourceId: personB.id, targetId: personA.id } },
          }).catch(() => null);

          if (existingEdge || reverseEdge) continue;

          // Check if it's mutual (does B also follow A?)
          let isMutual = false;
          try {
            const bFollowsA = await fetch(`https://api.github.com/users/${follower.login}/following/${login}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            });
            apiCallsUsed.count++;
            isMutual = bFollowsA.status === 200;
          } catch { /* assume not mutual */ }

          try {
            await db.edge.create({
              data: {
                sourceId: personA.id,
                targetId: personB.id,
                origin: "github",
                strength: isMutual ? 2 : 1,
                context: isMutual
                  ? `Mutual follow on GitHub`
                  : `${personA.name} follows ${personB.name} on GitHub`,
                communities: [],
                projects: [],
              },
            });
            crossEdgesCreated++;
          } catch { /* ignore duplicate or constraint errors */ }
        }
      }
    }

    return NextResponse.json({ created, matched, skipped, crossEdgesCreated, warnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
