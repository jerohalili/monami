import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { edgeDTO, personDTO } from "@/lib/dto";

export async function GET() {
  const session = await auth();

  if (session?.user?.id) {
    const existingPerson = await db.person.findFirst({
      where: { userId: session.user.id },
    });

    if (!existingPerson) {
      const ghAccount = await db.account.findFirst({
        where: { userId: session.user.id, provider: "github" },
      });

      if (ghAccount?.access_token) {
        try {
          const ghRes = await fetch("https://api.github.com/user", {
            headers: {
              Authorization: `Bearer ${ghAccount.access_token}`,
              Accept: "application/vnd.github+json",
            },
          });
          if (ghRes.ok) {
            const gh = await ghRes.json();
            await db.person.create({
              data: {
                userId: session.user.id,
                name: gh.name || gh.login,
                email: session.user.email,
                avatarUrl: gh.avatar_url,
                githubLogin: gh.login,
                company: gh.company,
                location: gh.location,
                skills: [],
                interests: [],
                tags: [],
                links: {},
                isSelf: true,
              },
            });
          }
        } catch {}
      }

      const stillMissing = await db.person.findFirst({
        where: { userId: session.user.id },
      });
      if (!stillMissing) {
        const user = await db.user.findUnique({ where: { id: session.user.id } });
        await db.person.create({
          data: {
            userId: session.user.id,
            name: user?.name || session.user.name || "Me",
            email: session.user.email,
            avatarUrl: session.user.image,
            skills: [],
            interests: [],
            tags: [],
            links: {},
            isSelf: true,
          },
        });
      }
    }
  }

  let people: any[] = [];
  let edges: any[] = [];

  if (session?.user?.id) {
    const myPerson = await db.person.findFirst({
      where: { userId: session.user.id },
    });

    if (myPerson) {
      const connectedPersonIds = new Set<string>();
      connectedPersonIds.add(myPerson.id);

      const myEdges = await db.edge.findMany({
        where: {
          OR: [{ sourceId: myPerson.id }, { targetId: myPerson.id }],
        },
      });

      for (const edge of myEdges) {
        connectedPersonIds.add(edge.sourceId);
        connectedPersonIds.add(edge.targetId);
      }

      people = await db.person.findMany({
        where: { id: { in: Array.from(connectedPersonIds) } },
        orderBy: { createdAt: "asc" },
      });

      edges = await db.edge.findMany({
        where: {
          OR: [{ sourceId: myPerson.id }, { targetId: myPerson.id }],
        },
        orderBy: { createdAt: "asc" },
      });
    } else {
      people = [];
      edges = [];
    }
  } else {
    [people, edges] = await Promise.all([
      db.person.findMany({ orderBy: { createdAt: "asc" } }),
      db.edge.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
  }

  return NextResponse.json({
    people: people.map(personDTO),
    edges: edges.map(edgeDTO),
  });
}
