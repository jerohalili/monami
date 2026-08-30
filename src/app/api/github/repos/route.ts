// GET /api/github/repos — fetch user's GitHub repositories.

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-guard";
import { getGitHubToken, fetchGitHubRepos } from "@/lib/github";

export async function GET() {
  try {
    const userId = await requireUserId();

    const token = await getGitHubToken(userId);
    if (!token) {
      return NextResponse.json(
        { error: "GitHub account not linked or token expired. Please sign in with GitHub again." },
        { status: 400 },
      );
    }

    let repos;
    try {
      repos = await fetchGitHubRepos(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "GitHub API request failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    return NextResponse.json({ repos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
