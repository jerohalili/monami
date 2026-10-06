// Own GitHub repos, most recently updated first.
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
      console.warn("github repos fetch failed", e);
      return NextResponse.json({ error: "GitHub request failed" }, { status: 502 });
    }

    return NextResponse.json({ repos });
  } catch (e) {
    console.warn("repos route failed", e);
    return NextResponse.json({ error: "Could not load repositories" }, { status: 500 });
  }
}
