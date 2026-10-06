export type SyncFilter = "all" | "following" | "mutual";

export function applySyncFilter(
  logins: Set<string>,
  following: Set<string>,
  followers: Set<string>,
  filter: SyncFilter,
): Set<string> {
  const out = new Set<string>();
  for (const login of logins) {
    if (filter === "following" && !following.has(login)) continue;
    if (filter === "mutual" && !(following.has(login) && followers.has(login))) continue;
    out.add(login);
  }
  return out;
}

export function edgeContextFor(login: string, following: Set<string>, followers: Set<string>): {
  strength: number;
  context: string;
} {
  const isFollowing = following.has(login);
  const isFollower = followers.has(login);
  if (isFollowing && isFollower) return { strength: 2, context: "Mutual follow on GitHub" };
  if (isFollowing) return { strength: 1, context: "You follow them on GitHub" };
  return { strength: 1, context: "They follow you on GitHub" };
}

export function personTagsFor(login: string, following: Set<string>, followers: Set<string>): string[] {
  const tags = ["github"];
  if (following.has(login) && !followers.has(login)) tags.push("github_following");
  if (followers.has(login) && !following.has(login)) tags.push("github_follower");
  return tags;
}
