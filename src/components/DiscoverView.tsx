// Discover tab: shows people recommendations and repos (recommended, starred, your repos).

"use client";

import { useEffect, useMemo, useState } from "react";
import type { GitHubRepo } from "@/lib/github";
import type { RecommendedPerson, Person, RecommendedRepo } from "@/lib/model";
import { IconExternal, IconStar, IconGitBranch, IconCompass, IconPlus } from "./icons";
import AddPersonModal from "./AddPersonModal";

type Tab = "people" | "repos";
type RepoSubTab = "recommended" | "starred" | "yours";

export default function DiscoverView({
  query,
  onSwitchToNetwork,
}: {
  query: string;
  onSwitchToNetwork?: (person: Person) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("people");
  const [activeRepoSubTab, setActiveRepoSubTab] = useState<RepoSubTab>("recommended");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [peopleRecommendations, setPeopleRecommendations] = useState<RecommendedPerson[]>([]);
  const [repoRecommendations, setRepoRecommendations] = useState<RecommendedRepo[]>([]);
  const [recommendedRepos, setRecommendedRepos] = useState<RecommendedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [addPersonPrefill, setAddPersonPrefill] = useState<RecommendedPerson | null>(null);

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((repo) => {
      const searchable = [repo.name, repo.description ?? "", repo.language ?? ""].join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [repos, query]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return peopleRecommendations;
    return peopleRecommendations.filter((person) => {
      const searchable = [person.name, person.githubLogin ?? "", ...person.reasons].join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [peopleRecommendations, query]);

  const filteredRepoRecommendations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repoRecommendations;
    return repoRecommendations.filter((repo) => {
      const searchable = [repo.name, repo.full_name, repo.description ?? "", repo.language ?? ""].join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [repoRecommendations, query]);

  const filteredRecommendedRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recommendedRepos;
    return recommendedRepos.filter((repo) => {
      const searchable = [repo.name, repo.full_name, repo.description ?? "", repo.language ?? "", ...repo.reasons].join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [recommendedRepos, query]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      setSectionErrors({});
      try {
        const [peopleRes, reposRecRes, reposRes, recommendedRes] = await Promise.all([
          fetch("/api/recommendations"),
          fetch("/api/github/recommendations?type=repos"),
          fetch("/api/github/repos"),
          fetch("/api/github/recommendations?type=recommended-repos"),
        ]);

        const errors: Record<string, string> = {};

        if (peopleRes.ok) {
          const peopleData = await peopleRes.json();
          setPeopleRecommendations(peopleData.recommendations || []);
        } else {
          const body = await peopleRes.json().catch(() => null);
          errors.people = body?.error || `Failed to fetch recommendations (HTTP ${peopleRes.status})`;
        }

        if (reposRecRes.ok) {
          const reposRecData = await reposRecRes.json();
          setRepoRecommendations(reposRecData.recommendations || []);
        } else {
          const body = await reposRecRes.json().catch(() => null);
          errors.repos = body?.error || `Failed to fetch starred repos (HTTP ${reposRecRes.status})`;
        }

        if (reposRes.ok) {
          const reposData = await reposRes.json();
          setRepos(reposData.repos || []);
        } else {
          const body = await reposRes.json().catch(() => null);
          errors.repos = body?.error || `Failed to fetch repos (HTTP ${reposRes.status})`;
        }

        if (recommendedRes.ok) {
          const recommendedData = await recommendedRes.json();
          setRecommendedRepos(recommendedData.recommendations || []);
        } else {
          const body = await recommendedRes.json().catch(() => null);
          errors.recommended = body?.error || `Failed to fetch recommended repos (HTTP ${recommendedRes.status})`;
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
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Main Tabs */}
        <div className="flex gap-1 rounded-xl p-1" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
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
              activeTab === "repos" ? "bg-violet-500/20 text-violet-400" : "hover:bg-white/5"
            }`}
            style={{ color: activeTab === "repos" ? undefined : "var(--text-muted)" }}
            onClick={() => setActiveTab("repos")}
          >
            Repos
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {query.trim() && (
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>
              {activeTab === "people" && `${filteredPeople.length} match${filteredPeople.length === 1 ? "" : "es"}`}
              {activeTab === "repos" && (
                <>
                  {activeRepoSubTab === "recommended" && `${filteredRecommendedRepos.length} match${filteredRecommendedRepos.length === 1 ? "" : "es"}`}
                  {activeRepoSubTab === "starred" && `${filteredRepoRecommendations.length} match${filteredRepoRecommendations.length === 1 ? "" : "es"}`}
                  {activeRepoSubTab === "yours" && `${filteredRepos.length} match${filteredRepos.length === 1 ? "" : "es"}`}
                </>
              )}
            </div>
          )}
          {activeTab === "people" && (
            <PeopleSection recommendations={filteredPeople} error={sectionErrors.people} onAdd={setAddPersonPrefill} />
          )}
          {activeTab === "repos" && (
            <ReposSection
              recommendedRepos={filteredRecommendedRepos}
              starredRepos={filteredRepoRecommendations}
              yourRepos={filteredRepos}
              activeSubTab={activeRepoSubTab}
              setActiveSubTab={setActiveRepoSubTab}
              errors={{
                recommended: sectionErrors.recommended,
                starred: sectionErrors.repos,
                yours: sectionErrors.repos,
              }}
            />
          )}
        </div>
      </div>

      {/* Add person modal from recommendation */}
      {addPersonPrefill && (
        <AddPersonModal
          onClose={() => setAddPersonPrefill(null)}
          onCreated={(person: Person) => {
            setAddPersonPrefill(null);
            onSwitchToNetwork?.(person);
          }}
          prefilled={addPersonPrefill}
        />
      )}
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 8) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 4) return "bg-amber-500/20 text-amber-400";
  return "bg-white/10 text-[var(--text-dim)]";
}

function PeopleSection({ recommendations, error, onAdd }: { recommendations: RecommendedPerson[]; error?: string; onAdd: (person: RecommendedPerson) => void }) {
  if (error) {
    return <ErrorState message={error} />;
  }
  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={<IconCompass width={24} height={24} />}
        title="No recommendations yet"
        description="Add more connections with skills, interests, and company info to get personalized recommendations."
      />
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((person) => (
        <PersonCard
          key={person.candidateKey ?? person.githubLogin ?? person.name}
          person={person}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}

function PersonCard({ person, onAdd }: { person: RecommendedPerson; onAdd: (person: RecommendedPerson) => void }) {
  const [expanded, setExpanded] = useState(false);
  const d = person.reasonDetails;
  const hasExpandableDetail = (d.mutualConnections && d.mutualConnections.length > 0) ||
    (d.contributedRepos && d.contributedRepos.length > 1);

  return (
    <div className="rounded-xl transition-colors hover:bg-white/5" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      <div className="flex items-start gap-4 p-4">
        <img
          src={person.avatarUrl ?? `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(person.name)}&backgroundColor=334155`}
          alt={person.name}
          className="h-12 w-12 shrink-0 rounded-full"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {person.name}
            </h3>
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${scoreColor(person.score)}`}>
              {person.score}
            </span>
          </div>
          {person.githubLogin && (
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              @{person.githubLogin}
            </p>
          )}
          {(person.headline || person.company || person.location) && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {[person.headline, person.company, person.location].filter(Boolean).join(" at ").replace(/^ at /, "")}
            </p>
          )}
          {person.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {person.skills.slice(0, 5).map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs"
                  style={{ background: "var(--bg-main)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  {skill}
                </span>
              ))}
              {person.skills.length > 5 && (
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  +{person.skills.length - 5}
                </span>
              )}
            </div>
          )}
          {person.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {person.reasons.slice(0, 3).map((reason, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-md bg-violet-500/10 px-1.5 py-0.5 text-xs text-violet-400"
                >
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {person.githubLogin && (
            <a
              href={`https://github.com/${person.githubLogin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: "var(--text-muted)" }}
            >
              View <IconExternal width={12} height={12} />
            </a>
          )}
          <button
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-400 transition-colors hover:bg-violet-500/10"
            onClick={() => onAdd(person)}
          >
            <IconPlus width={12} height={12} /> Add
          </button>
        </div>
      </div>

      {hasExpandableDetail && (
        <div style={{ borderTop: expanded ? "1px solid var(--border)" : "none" }}>
          <button
            className="flex w-full items-center justify-between px-4 py-2 text-xs transition-colors hover:bg-white/5"
            style={{ color: "var(--text-dim)" }}
            onClick={() => setExpanded(!expanded)}
          >
            <span>Why recommended</span>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </button>
          {expanded && (
            <div className="space-y-3 px-4 pb-4">
              {d.mutualConnections && d.mutualConnections.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Mutual connections</p>
                  <div className="flex flex-wrap gap-1">
                    {d.mutualConnections.map((name) => (
                      <span key={name} className="inline-flex items-center rounded-md bg-violet-500/10 px-1.5 py-0.5 text-xs text-violet-400">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {d.contributedRepos && d.contributedRepos.length > 1 && (
                <div>
                  <p className="mb-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Contributed to</p>
                  <div className="flex flex-wrap gap-1">
                    {d.contributedRepos.map((repo) => (
                      <span key={repo} className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs" style={{ background: "var(--bg-main)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                        {repo}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReposSection({
  recommendedRepos,
  starredRepos,
  yourRepos,
  activeSubTab,
  setActiveSubTab,
  errors,
}: {
  recommendedRepos: RecommendedRepo[];
  starredRepos: RecommendedRepo[];
  yourRepos: GitHubRepo[];
  activeSubTab: RepoSubTab;
  setActiveSubTab: (tab: RepoSubTab) => void;
  errors: { recommended?: string; starred?: string; yours?: string };
}) {
  const hasAnyData = recommendedRepos.length > 0 || starredRepos.length > 0 || yourRepos.length > 0;
  if (!hasAnyData) {
    return (
      <EmptyState
        icon={<IconGitBranch width={24} height={24} />}
        title="No repos found"
        description="Connect your GitHub account to see your repositories."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Repo Sub-navigation */}
      <div className="flex gap-1 rounded-xl p-1" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <button
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            activeSubTab === "recommended" ? "bg-violet-500/20 text-violet-400" : "hover:bg-white/5"
          }`}
          style={{ color: activeSubTab === "recommended" ? undefined : "var(--text-muted)" }}
          onClick={() => setActiveSubTab("recommended")}
        >
          Recommended
        </button>
        {starredRepos.length > 0 && (
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeSubTab === "starred" ? "bg-violet-500/20 text-violet-400" : "hover:bg-white/5"
            }`}
            style={{ color: activeSubTab === "starred" ? undefined : "var(--text-muted)" }}
            onClick={() => setActiveSubTab("starred")}
          >
            Starred
          </button>
        )}
        {yourRepos.length > 0 && (
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeSubTab === "yours" ? "bg-violet-500/20 text-violet-400" : "hover:bg-white/5"
            }`}
            style={{ color: activeSubTab === "yours" ? undefined : "var(--text-muted)" }}
            onClick={() => setActiveSubTab("yours")}
          >
            Your Repos
          </button>
        )}
      </div>

      {/* Content */}
      {activeSubTab === "recommended" && (
        <RepoSection
          title="Recommended for You"
          repos={recommendedRepos}
          error={errors.recommended}
          showReasons={true}
          emptyTitle="No recommendations yet"
          emptyDescription="Sync your GitHub connections and they'll need to star some repos for recommendations to appear."
        />
      )}
      {activeSubTab === "starred" && (
        <RepoSection
          title="Your Starred Repositories"
          repos={starredRepos}
          error={errors.starred}
          showReasons={false}
        />
      )}
      {activeSubTab === "yours" && (
        <RepoSection
          title="Your Repositories"
          repos={yourRepos}
          error={errors.yours}
          showReasons={false}
        />
      )}
    </div>
  );
}

function RepoSection({
  title,
  repos,
  error,
  showReasons,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  repos: (GitHubRepo | RecommendedRepo)[];
  error?: string;
  showReasons: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (error) {
    return <ErrorState message={error} />;
  }
  if (repos.length === 0) {
    return (
      <EmptyState
        icon={<IconGitBranch width={24} height={24} />}
        title={emptyTitle ?? "No repositories"}
        description={emptyDescription ?? "No repositories match your current filter."}
      />
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
        {title}
      </h3>
      <div className="space-y-3">
        {repos.map((repo) => (
          <RepoDiscoverCard key={repo.full_name} repo={repo} showReasons={showReasons} />
        ))}
      </div>
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

function isRecommendedRepo(repo: GitHubRepo | RecommendedRepo): repo is RecommendedRepo {
  return "reasons" in repo;
}

function RepoDiscoverCard({ repo, showReasons }: { repo: GitHubRepo | RecommendedRepo; showReasons?: boolean }) {
  const recommended = isRecommendedRepo(repo);

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
      {showReasons && recommended && repo.reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {repo.reasons.map((reason, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-md bg-violet-500/10 px-1.5 py-0.5 text-xs text-violet-400"
            >
              {reason}
            </span>
          ))}
        </div>
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
        {recommended && repo.starred_by && repo.starred_by > 1 && (
          <span className="text-violet-400">
            Starred by {repo.starred_by} connection{repo.starred_by === 1 ? "" : "s"}
          </span>
        )}
        {!recommended && (
          <span className="flex items-center gap-1">
            <IconGitBranch width={12} height={12} />
            {repo.forks_count}
          </span>
        )}
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