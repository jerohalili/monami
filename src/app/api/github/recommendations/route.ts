// GET /api/github/recommendations — fetch people and repo recommendations.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";
import {
  getGitHubToken,
  fetchGitHubRepos,
  fetchGitHubStarredRepos,
  fetchGitHubRepoContributors,
  fetchUserStarredRepos,
  type GitHubRepo,
  type GitHubUser,
} from "@/lib/github";
import { normalizeSkills } from "@/lib/skills";
import { overlap } from "@/lib/model";

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
  reasons: string[];
  reasonDetails: {
    connectionsWhoStarred?: string[];
    languageMatch?: string;
  };
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

    // Get existing people in the network to find connections
    const existingPeople = await db.person.findMany({
      where: { userId },
      select: { id: true, githubLogin: true, name: true },
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
    } else if (type === "recommended-repos") {
      const recommendations = await getRecommendedRepos(token, existingPeople, userId);
      return NextResponse.json({ recommendations });
    } else {
      return NextResponse.json(
        { error: "Invalid type parameter. Use 'people', 'repos', or 'recommended-repos'." },
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
      reasons: ["You starred this"],
      reasonDetails: {},
    }));
}

async function getRecommendedRepos(
  token: string,
  existingPeople: { id: string; githubLogin: string | null; name: string }[],
  userId: string,
): Promise<RecommendedRepo[]> {
  // Get the user's "me" node for skills to match languages
  const { db } = await import("@/lib/db");
  const meNode = await db.person.findFirst({
    where: { userId, tags: { array_contains: "me" } },
  });

  // Normalize user's skills for language matching
  const userSkills = meNode
    ? normalizeSkills(Array.isArray(meNode.skills) ? (meNode.skills as string[]) : [])
    : [];

  // Map of skills to common repo languages (for fuzzy matching)
  const skillToLanguage: Record<string, string> = {
    TypeScript: "TypeScript",
    "JavaScript": "JavaScript",
    Python: "Python",
    Go: "Go",
    Rust: "Rust",
    Java: "Java",
    "C++": "C++",
    "C#": "C#",
    Ruby: "Ruby",
    PHP: "PHP",
    Swift: "Swift",
    Kotlin: "Kotlin",
    Scala: "Scala",
    "C": "C",
    "R": "R",
    Lua: "Lua",
    Shell: "Shell",
    HTML: "HTML",
    CSS: "CSS",
    SQL: "SQL",
    "Jupyter Notebook": "Jupyter Notebook",
  };

  // Build user's language set from skills
  const userLanguages = new Set<string>();
  for (const skill of userSkills) {
    const lang = skillToLanguage[skill];
    if (lang) userLanguages.add(lang);
  }

  // Get user's own repos and starred repos to exclude
  let userRepos: GitHubRepo[] = [];
  let userStarredRepos: GitHubRepo[] = [];
  try {
    [userRepos, userStarredRepos] = await Promise.all([
      fetchGitHubRepos(token),
      fetchGitHubStarredRepos(token),
    ]);
  } catch {
    // If we can't fetch, proceed without exclusion
  }

  const userOwnedLogins = new Set(userRepos.map((r) => r.full_name));
  const userStarredLogins = new Set(userStarredRepos.map((r) => r.full_name));

  // Get direct connections with GitHub logins (prioritized by edge strength)
  const people = await db.person.findMany({ where: { userId } });
  const you = people.find((p) => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return tags.includes("me");
  });

  if (!you) return [];

  const edges = await db.edge.findMany({
    where: { sourceId: you.id, origin: "github" },
  });
  const edgeByTarget = new Map(edges.map((e) => [e.targetId, e.strength]));

  const directConnections = people
    .filter((p) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return tags.includes("github") && p.githubLogin && p.id !== you.id;
    })
    .sort((a, b) => {
      const strengthA = edgeByTarget.get(a.id) ?? 0;
      const strengthB = edgeByTarget.get(b.id) ?? 0;
      return strengthB - strengthA;
    })
    .slice(0, 5); // Top 5 connections

  if (directConnections.length === 0) return [];

  // Fetch starred repos from each connection
  const repoStarredBy = new Map<string, { connectionNames: string[]; repo: GitHubRepo }>();

  for (const connection of directConnections) {
    if (!connection.githubLogin) continue;
    try {
      const starred = await fetchUserStarredRepos(token, connection.githubLogin, 1);
      for (const repo of starred.slice(0, 30)) {
        // Skip repos the user already owns or starred
        if (userOwnedLogins.has(repo.full_name) || userStarredLogins.has(repo.full_name)) continue;

        const key = repo.full_name;
        const existing = repoStarredBy.get(key);
        if (existing) {
          if (!existing.connectionNames.includes(connection.name)) {
            existing.connectionNames.push(connection.name);
          }
        } else {
          repoStarredBy.set(key, {
            connectionNames: [connection.name],
            repo,
          });
        }
      }
    } catch {
      // Skip on rate limit or error
    }
  }

  // Score repos: connections who starred × 2 + language match × 3
  const scoredRepos: Array<{ repo: GitHubRepo; score: number; connectionsWhoStarred: string[]; languageMatch?: string }> = [];

  for (const [, { connectionNames, repo }] of repoStarredBy) {
    if (connectionNames.length < 1) continue; // At least 1 connection

    const connectionsScore = connectionNames.length * 2;
    let languageScore = 0;
    let languageMatch: string | undefined;

    if (repo.language && userLanguages.has(repo.language)) {
      languageScore = 3;
      languageMatch = repo.language;
    }

    const totalScore = connectionsScore + languageScore;
    if (totalScore > 0) {
      scoredRepos.push({ repo, score: totalScore, connectionsWhoStarred: connectionNames, languageMatch });
    }
  }

  // Sort by score descending, return top 15
  return scoredRepos
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(({ repo, connectionsWhoStarred, languageMatch }) => ({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      stargazers_count: repo.stargazers_count,
      language: repo.language,
      starred_by: connectionsWhoStarred.length,
      reasons: [
        `Starred by ${connectionsWhoStarred.length} connection${connectionsWhoStarred.length > 1 ? "s" : ""}`,
        ...(languageMatch ? [`Uses ${languageMatch}`] : []),
      ],
      reasonDetails: {
        connectionsWhoStarred,
        languageMatch,
      },
    }));
}