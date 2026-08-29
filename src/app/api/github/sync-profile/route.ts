// POST /api/github/sync-profile — sync GitHub profile data to the "You" person node.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import { getGitHubToken, fetchGitHubProfile } from "@/lib/github";
import { personDTO } from "@/lib/dto";

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

    let profile;
    try {
      profile = await fetchGitHubProfile(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "GitHub API request failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Find the user's "You" person node by the "me" tag
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

    // Full overwrite: always set fields from GitHub profile
    const data: Record<string, unknown> = {
      name: profile.name ?? profile.login,
      githubLogin: profile.login,
      avatarUrl: profile.avatar_url,
      headline: profile.bio ?? null,
      company: profile.company ?? null,
      location: profile.location ?? null,
      email: profile.email ?? null,
    };

    // Add GitHub profile link
    const links = (you.links as Record<string, string>) ?? {};
    links["GitHub"] = profile.html_url;
    data.links = links;

    const updated = await db.person.update({
      where: { id: you.id },
      data,
    });

    return NextResponse.json(personDTO(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
