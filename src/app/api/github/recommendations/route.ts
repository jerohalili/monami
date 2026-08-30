// GET /api/github/recommendations — fetch people and repo recommendations.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import {
  getGitHubToken,
  fetchGitHubRepos,
  fetchGitHubStarredRepos,
  fetchGitHubRepoContributors,
} from "@/lib/github";

interface RecommendedPerson {
  login: string;
  avatar_url: string;
  name: string | null;
  reason: string;
}

interface RecommendedRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  starred_by: number;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const type = request.nextUrl.searchParams.get("type") || "people";

    const token = await getGitHubToken(userId);
    if (!token) {
      return NextResponse.json(
        { error: "GitHub account not linked or token expired. Please sign in with GitHub again." },
        { status: 400 },
      );
    }

    // Get existing people in the network to exclude and find connections
    const existingPeople = await db.person.findMany({
      where: { userId },
      select: { id: true, githubLogin: true },
    });

    const existingLogins = new Set(
      existingPeople
        .map((p) => p.githubLogin)
        .filter((login): login is string => login !== null),
    );

    if (type === "people") {
      const recommendations = await getPeopleRecommendations(
        token,
        existingLogins,
        existingPeople,
      );
      return NextResponse.json({ recommendations });
    } else if (type === "repos") {
      const recommendations = await getRepoRecommendations(token);
      return NextResponse.json({ recommendations });
    } else {
      return NextResponse.json(
        { error: "Invalid type parameter. Use 'people' or 'repos'." },
        { status: 400 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function getPeopleRecommendations(
  token: string,
  existingLogins: Set<string>,
  existingPeople: { id: string; githubLogin: string | null }[],
): Promise<RecommendedPerson[]> {
  const candidates = new Map<string, { login: string; avatar_url: string; name: string | null; score: number; reasons: string[] }>();

  // Get user's repos to find contributors
  let repos;
  try {
    repos = await fetchGitHubRepos(token);
  } catch {
    return [];
  }

  // Find contributors to user's repos (limit to first 5 repos to avoid rate limits)
  for (const repo of repos.slice(0, 5)) {
    try {
      const [owner, repoName] = repo.full_name.split("/");
      const contributors = await fetchGitHubRepoContributors(token, owner, repoName);
      for (const contributor of contributors) {
        if (existingLogins.has(contributor.login)) continue;
        const existing = candidates.get(contributor.login);
        if (existing) {
          existing.score += 1;
          existing.reasons.push(`Contributor to ${repo.name}`);
        } else {
          candidates.set(contributor.login, {
            login: contributor.login,
            avatar_url: contributor.avatar_url,
            name: contributor.name,
            score: 1,
            reasons: [`Contributor to ${repo.name}`],
          });
        }
      }
    } catch {
      // Skip repos where we can't fetch contributors
    }
  }

  // Convert to array, sort by score, and return top 10
  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((c) => ({
      login: c.login,
      avatar_url: c.avatar_url,
      name: c.name,
      reason: c.reasons.slice(0, 2).join(", "),
    }));
}

async function getRepoRecommendations(
  token: string,
): Promise<RecommendedRepo[]> {
  // Get user's starred repos
  let starredRepos;
  try {
    starredRepos = await fetchGitHubStarredRepos(token);
  } catch {
    return [];
  }

  // Return top 10 starred repos sorted by stars
  return starredRepos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 10)
    .map((repo) => ({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      stargazers_count: repo.stargazers_count,
      language: repo.language,
      starred_by: 1, // User starred it
    }));
}
