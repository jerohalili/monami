// Discover tab: shows user's GitHub repos and recommendations.

"use client";

import { useEffect, useMemo, useState } from "react";
import type { GitHubRepo } from "@/lib/github";
import { IconExternal, IconStar, IconGitBranch, IconCompass } from "./icons";

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

type Tab = "repos" | "people" | "repos-discover";

export default function DiscoverView({ query }: { query: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("repos");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [peopleRecommendations, setPeopleRecommendations] = useState<RecommendedPerson[]>([]);
  const [repoRecommendations, setRepoRecommendations] = useState<RecommendedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});

  // Filter repos based on query
  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((repo) => {
      const searchable = [repo.name, repo.description ?? "", repo.language ?? ""].join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [repos, query]);

  // Filter people recommendations based on query
  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return peopleRecommendations;
    return peopleRecommendations.filter((person) => {
      const searchable = [person.name ?? "", person.login, person.reason].join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [peopleRecommendations, query]);

  // Filter starred repos based on query
  const filteredRepoRecommendations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repoRecommendations;
    return repoRecommendations.filter((repo) => {
      const searchable = [repo.name, repo.full_name, repo.description ?? "", repo.language ?? ""].join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [repoRecommendations, query]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      setSectionErrors({});
      try {
        const [reposRes, peopleRes, reposRecRes] = await Promise.all([
          fetch("/api/github/repos"),
          fetch("/api/github/recommendations?type=people"),
          fetch("/api/github/recommendations?type=repos"),
        ]);

        const errors: Record<string, string> = {};

        // Process repos
        if (reposRes.ok) {
          const reposData = await reposRes.json();
          setRepos(reposData.repos || []);
        } else {
          const body = await reposRes.json().catch(() => null);
          errors.repos = body?.error || `Failed to fetch repos (HTTP ${reposRes.status})`;
        }

        // Process people recommendations
        if (peopleRes.ok) {
          const peopleData = await peopleRes.json();
          setPeopleRecommendations(peopleData.recommendations || []);
        } else {
          const body = await peopleRes.json().catch(() => null);
          errors.people = body?.error || `Failed to fetch recommendations (HTTP ${peopleRes.status})`;
        }

        // Process repo recommendations
        if (reposRecRes.ok) {
          const reposRecData = await reposRecRes.json();
          setRepoRecommendations(reposRecData.recommendations || []);
        } else {
          const body = await reposRecRes.json().catch(() => null);
          errors["repos-discover"] = body?.error || `Failed to fetch recommendations (HTTP ${reposRecRes.status})`;
        }

        if (Object.keys(errors).length > 0) {
          setSectionErrors(errors);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <div className="flex flex-col items-center gap-3">
          <IconCompass width={36} height={36} className="animate-pulse text-violet-400" />
          <p className="text-sm">Loading discover data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center" style={{ color: "var(--text)" }}>
        <div className="space-y-3">
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 pt-20">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl p-1" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "repos" ? "bg-violet-500/20 text-violet-400" : "hover:bg-white/5"
            }`}
            style={{ color: activeTab === "repos" ? undefined : "var(--text-muted)" }}
            onClick={() => setActiveTab("repos")}
          >
            My Repos
          </button>
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "people" ? "bg-violet-500/20 text-violet-400" : "hover:bg-white/5"
            }`}
            style={{ color: activeTab === "people" ? undefined : "var(--text-muted)" }}
            onClick={() => setActiveTab("people")}
          >
            People
          </button>
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "repos-discover" ? "bg-violet-500/20 text-violet-400" : "hover:bg-white/5"
            }`}
            style={{ color: activeTab === "repos-discover" ? undefined : "var(--text-muted)" }}
            onClick={() => setActiveTab("repos-discover")}
          >
            Starred Repos
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {query.trim() && (
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>
              {activeTab === "repos" && `${filteredRepos.length} match${filteredRepos.length === 1 ? "" : "es"}`}
              {activeTab === "people" && `${filteredPeople.length} match${filteredPeople.length === 1 ? "" : "es"}`}
              {activeTab === "repos-discover" && `${filteredRepoRecommendations.length} match${filteredRepoRecommendations.length === 1 ? "" : "es"}`}
            </div>
          )}
          {activeTab === "repos" && (
            <ReposSection repos={filteredRepos} error={sectionErrors.repos} />
          )}
          {activeTab === "people" && (
            <PeopleSection recommendations={filteredPeople} error={sectionErrors.people} />
          )}
          {activeTab === "repos-discover" && (
            <RepoDiscoverSection recommendations={filteredRepoRecommendations} error={sectionErrors["repos-discover"]} />
          )}
        </div>
      </div>
    </div>
  );
}

function ReposSection({ repos, error }: { repos: GitHubRepo[]; error?: string }) {
  if (error) {
    return <ErrorState message={error} />;
  }
  if (repos.length === 0) {
    return (
      <EmptyState
        icon={<IconGitBranch width={24} height={24} />}
        title="No repos found"
        description="Connect your GitHub account to see your repositories."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {repos.map((repo) => (
        <RepoCard key={repo.id} repo={repo} />
      ))}
    </div>
  );
}

function RepoCard({ repo }: { repo: GitHubRepo }) {
  return (
    <div className="rounded-xl p-4 transition-colors hover:bg-white/5" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {repo.name}
        </h3>
        <a
          href={repo.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300"
        >
          <IconExternal width={14} height={14} />
        </a>
      </div>
      {repo.description && (
        <p className="mt-2 text-xs line-clamp-2" style={{ color: "var(--text-muted)" }}>
          {repo.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: "var(--text-dim)" }}>
        {repo.language && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-violet-400" />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <IconStar width={12} height={12} />
          {repo.stargazers_count}
        </span>
        <span className="flex items-center gap-1">
          <IconGitBranch width={12} height={12} />
          {repo.forks_count}
        </span>
      </div>
    </div>
  );
}

function PeopleSection({ recommendations, error }: { recommendations: RecommendedPerson[]; error?: string }) {
  if (error) {
    return <ErrorState message={error} />;
  }
  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={<IconCompass width={24} height={24} />}
        title="No recommendations yet"
        description="Add more connections to get personalized recommendations."
      />
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((person) => (
        <PersonCard key={person.login} person={person} />
      ))}
    </div>
  );
}

function PersonCard({ person }: { person: RecommendedPerson }) {
  return (
    <div className="flex items-center gap-4 rounded-xl p-4 transition-colors hover:bg-white/5" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      <img
        src={person.avatar_url}
        alt={person.login}
        className="h-12 w-12 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {person.name || person.login}
        </h3>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          @{person.login}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {person.reason}
        </p>
      </div>
      <a
        href={`https://github.com/${person.login}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-violet-400 transition-colors hover:bg-violet-500/10"
      >
        View
      </a>
    </div>
  );
}

function RepoDiscoverSection({ recommendations, error }: { recommendations: RecommendedRepo[]; error?: string }) {
  if (error) {
    return <ErrorState message={error} />;
  }
  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={<IconStar width={24} height={24} />}
        title="No repo recommendations"
        description="Star some repos to get personalized recommendations."
      />
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((repo) => (
        <RepoDiscoverCard key={repo.full_name} repo={repo} />
      ))}
    </div>
  );
}

function RepoDiscoverCard({ repo }: { repo: RecommendedRepo }) {
  return (
    <div className="rounded-xl p-4 transition-colors hover:bg-white/5" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {repo.name}
          </h3>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            {repo.full_name}
          </p>
        </div>
        <a
          href={repo.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300"
        >
          <IconExternal width={14} height={14} />
        </a>
      </div>
      {repo.description && (
        <p className="mt-2 text-xs line-clamp-2" style={{ color: "var(--text-muted)" }}>
          {repo.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: "var(--text-dim)" }}>
        {repo.language && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-violet-400" />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <IconStar width={12} height={12} />
          {repo.stargazers_count}
        </span>
        <span className="text-violet-400">
          Starred by {repo.starred_by} connection{repo.starred_by === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl p-8 text-center" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      <div className="mb-3 text-violet-400">{icon}</div>
      <h3 className="text-sm font-medium" style={{ color: "var(--text)" }}>{title}</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
      <p className="text-xs" style={{ color: "#ef4444" }}>{message}</p>
    </div>
  );
}
