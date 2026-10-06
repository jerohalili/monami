// Refresh the own profile node from the GitHub profile.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import { getGitHubToken, fetchGitHubProfile, fetchGitHubRepos } from "@/lib/github";
import { extractSkillsFromRepos } from "@/lib/skills";
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
      console.warn("github profile fetch failed", e);
      return NextResponse.json({ error: "GitHub request failed" }, { status: 502 });
    }

    // Find the user's own person node by the "me" tag
    const people = await db.person.findMany({ where: { userId } });
    const you = people.find((p) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return tags.includes("me");
    });

    if (!you) {
      return NextResponse.json({ error: "Own profile node not found" }, { status: 404 });
    }

    // Extract skills from the user's own repos
    let extractedSkills: string[] = [];
    try {
      const repos = await fetchGitHubRepos(token);
      extractedSkills = extractSkillsFromRepos(repos);
    } catch (e) {
      console.warn("repo skill extract failed", e);
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
      skills: extractedSkills,
    };

    const updated = await db.person.update({
      where: { id: you.id },
      data,
    });

    return NextResponse.json(personDTO(updated));
  } catch (e) {
    console.warn("sync-profile failed", e);
    return NextResponse.json({ error: "Profile sync failed" }, { status: 500 });
  }
}
