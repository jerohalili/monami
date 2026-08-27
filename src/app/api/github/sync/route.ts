import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  company: string | null;
  location: string | null;
  bio: string | null;
}

async function fetchGitHubFriends(
  accessToken: string,
  endpoint: "followers" | "following"
): Promise<GitHubUser[]> {
  const users: GitHubUser[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await fetch(
      `https://api.github.com/user/${endpoint}?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    console.log(`[github-sync] ${endpoint} page ${page}: ${res.status}`);

    if (!res.ok) {
      const body = await res.text();
      console.error(`[github-sync] ${endpoint} failed:`, body);
      break;
    }

    const data = await res.json();
    console.log(`[github-sync] ${endpoint} page ${page}: got ${data.length} items`);
    if (data.length === 0) break;

    users.push(...data);
    if (data.length < perPage) break;
    page++;
  }

  return users;
}

async function fetchCurrentUser(
  accessToken: string
): Promise<GitHubUser | null> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  console.log(`[github-sync] /user: ${res.status}`);
  if (!res.ok) return null;
  return res.json();
}

export async function POST() {
  try {
    const session = await auth();
    console.log("[github-sync] session:", JSON.stringify(session?.user));

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await db.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "github",
      },
    });

    console.log("[github-sync] account:", JSON.stringify(account ? { id: account.id, provider: account.provider, hasToken: !!account.access_token } : null));

    if (!account?.access_token) {
      return NextResponse.json(
        { error: "GitHub account not linked or no access token. Try signing out and back in." },
        { status: 400 }
      );
    }

    const accessToken = account.access_token;

    const [currentUser, followers, following] = await Promise.all([
      fetchCurrentUser(accessToken),
      fetchGitHubFriends(accessToken, "followers"),
      fetchGitHubFriends(accessToken, "following"),
    ]);

    console.log(`[github-sync] profile: ${currentUser?.login}, followers: ${followers.length}, following: ${following.length}`);

    if (!currentUser) {
      return NextResponse.json(
        { error: "Could not fetch GitHub profile" },
        { status: 500 }
      );
    }

    const person = await db.person.findFirst({
      where: { userId: session.user.id },
    });

    console.log("[github-sync] person:", person?.id);

    if (!person) {
      return NextResponse.json(
        { error: "No person profile found for this user" },
        { status: 404 }
      );
    }

    await db.person.update({
      where: { id: person.id },
      data: {
        githubLogin: currentUser.login,
        avatarUrl: currentUser.avatar_url,
        name: currentUser.name || currentUser.login,
        company: currentUser.company,
        location: currentUser.location,
      },
    });

    const allGitHubUsers = new Map<
      string,
      GitHubUser & { isFollower: boolean; isFollowing: boolean }
    >();

    for (const u of followers) {
      allGitHubUsers.set(u.login, { ...u, isFollower: true, isFollowing: false });
    }
    for (const u of following) {
      const existing = allGitHubUsers.get(u.login);
      if (existing) {
        existing.isFollowing = true;
      } else {
        allGitHubUsers.set(u.login, { ...u, isFollower: false, isFollowing: true });
      }
    }

    let createdPeople = 0;
    let createdEdges = 0;

    for (const [, ghUser] of allGitHubUsers) {
      let targetPerson = await db.person.findFirst({
        where: { githubLogin: ghUser.login },
      });

      if (!targetPerson) {
        targetPerson = await db.person.create({
          data: {
            name: ghUser.name || ghUser.login,
            githubLogin: ghUser.login,
            avatarUrl: ghUser.avatar_url,
            company: ghUser.company,
            location: ghUser.location,
            skills: [],
            interests: [],
            tags: [],
            links: {},
          },
        });
        createdPeople++;
      }

      if (ghUser.isFollowing) {
        const exists = await db.edge.findUnique({
          where: {
            sourceId_targetId: { sourceId: person.id, targetId: targetPerson.id },
          },
        });
        if (!exists) {
          await db.edge.create({
            data: {
              sourceId: person.id,
              targetId: targetPerson.id,
              origin: "github",
              context: "GitHub following",
              communities: [],
              projects: [],
              strength: 2,
            },
          });
          createdEdges++;
        }
      }

      if (ghUser.isFollower) {
        const exists = await db.edge.findUnique({
          where: {
            sourceId_targetId: { sourceId: targetPerson.id, targetId: person.id },
          },
        });
        if (!exists) {
          await db.edge.create({
            data: {
              sourceId: targetPerson.id,
              targetId: person.id,
              origin: "github",
              context: "GitHub follower",
              communities: [],
              projects: [],
              strength: 2,
            },
          });
          createdEdges++;
        }
      }
    }

    console.log(`[github-sync] done: ${createdPeople} people, ${createdEdges} edges`);

    return NextResponse.json({
      synced: true,
      followers: followers.length,
      following: following.length,
      peopleCreated: createdPeople,
      edgesCreated: createdEdges,
    });
  } catch (err) {
    console.error("[github-sync] error:", err);
    return NextResponse.json(
      { error: "Failed to sync GitHub data" },
      { status: 500 }
    );
  }
}
