// GitHub API utilities for token management and API calls.

import { db } from "./db";

const GITHUB_API = "https://api.github.com";

// --- Types ---

export interface GitHubProfile {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  email: string | null;
  blog: string | null;
  html_url: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  bio: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  updated_at: string;
}

// --- Token management ---

export async function getGitHubToken(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { githubToken: true, githubTokenExpiry: true },
  });

  if (!user?.githubToken) return null;

  // Check if token is expired (with 5-minute buffer)
  if (user.githubTokenExpiry) {
    const bufferMs = 5 * 60 * 1000;
    if (new Date(user.githubTokenExpiry).getTime() - bufferMs < Date.now()) {
      return null;
    }
  }

  return user.githubToken;
}

// --- API helpers ---

export async function githubFetch<T>(
  token: string,
  path: string,
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchGitHubProfile(token: string): Promise<GitHubProfile> {
  return githubFetch<GitHubProfile>(token, "/user");
}

export async function fetchGitHubFollowers(token: string): Promise<GitHubUser[]> {
  return fetchAllPaginated<GitHubUser>(token, "/user/followers");
}

export async function fetchGitHubFollowing(token: string): Promise<GitHubUser[]> {
  return fetchAllPaginated<GitHubUser>(token, "/user/following");
}

export async function fetchGitHubRepos(token: string): Promise<GitHubRepo[]> {
  return fetchAllPaginated<GitHubRepo>(token, "/user/repos?sort=updated&direction=desc");
}

export async function fetchGitHubStarredRepos(token: string): Promise<GitHubRepo[]> {
  return fetchAllPaginated<GitHubRepo>(token, "/user/starred?sort=created&direction=desc");
}

// --- Per-user followers/following (for indirect discovery) ---

export async function fetchUserFollowers(
  token: string,
  username: string,
  maxPages = 3,
): Promise<GitHubUser[]> {
  return fetchPaginated<GitHubUser>(token, `/users/${username}/followers`, maxPages);
}

export async function fetchUserFollowing(
  token: string,
  username: string,
  maxPages = 3,
): Promise<GitHubUser[]> {
  return fetchPaginated<GitHubUser>(token, `/users/${username}/following`, maxPages);
}

export async function fetchUserStarredRepos(
  token: string,
  username: string,
  maxPages = 1,
): Promise<GitHubRepo[]> {
  return fetchPaginated<GitHubRepo>(token, `/users/${username}/starred`, maxPages);
}

export async function fetchUserRepos(
  token: string,
  username: string,
  maxPages = 1,
): Promise<GitHubRepo[]> {
  return fetchPaginated<GitHubRepo>(token, `/users/${username}/repos?sort=updated`, maxPages);
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: number;
}

export async function getRateLimitRemaining(token: string): Promise<RateLimitInfo> {
  const res = await fetch(`${GITHUB_API}/rate_limit`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    return { remaining: 5000, limit: 5000, reset: Date.now() / 1000 + 3600 };
  }
  const data = (await res.json()) as { resources: { core: { remaining: number; limit: number; reset: number } } };
  return data.resources.core;
}

// Paginate with a configurable max page count
async function fetchPaginated<T>(token: string, path: string, maxPages: number): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const perPage = 100;

  while (page <= maxPages) {
    const separator = path.includes("?") ? "&" : "?";
    const items = await githubFetch<T[]>(
      token,
      `${path}${separator}per_page=${perPage}&page=${page}`,
    );
    results.push(...items);
    if (items.length < perPage) break;
    page++;
  }

  return results;
}

export async function fetchGitHubRepoContributors(
  token: string,
  owner: string,
  repo: string,
): Promise<GitHubUser[]> {
  return fetchAllPaginated<GitHubUser>(token, `/repos/${owner}/${repo}/contributors`);
}

// Paginate through all results (up to 10 pages to avoid excessive API calls)
async function fetchAllPaginated<T>(token: string, path: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 10;

  while (page <= maxPages) {
    const separator = path.includes("?") ? "&" : "?";
    const items = await githubFetch<T[]>(
      token,
      `${path}${separator}per_page=${perPage}&page=${page}`,
    );
    results.push(...items);
    if (items.length < perPage) break;
    page++;
  }

  return results;
}
