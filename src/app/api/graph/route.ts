// Whole constellation in one payload.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { edgeDTO, personDTO } from "@/lib/dto";
import { requireUserId } from "@/lib/auth-guard";

export async function GET() {
  try {
    const userId = await requireUserId();

    // Verify user exists in the database (handles stale sessions)
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    let people = await db.person.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    // Auto-create "You" person if user has no people yet
    if (people.length === 0) {
      const you = await db.person.create({
        data: {
          userId,
          name: "You",
          skills: [],
          interests: [],
          tags: ["me"],
          links: {},
        },
      });
      people = [you];
    }

    // Ensure the "You" node always has the "me" tag
    for (const p of people) {
      if (p.name === "You") {
        const tags = Array.isArray(p.tags) ? p.tags : [];
        if (!tags.includes("me")) {
          const updated = await db.person.update({
            where: { id: p.id },
            data: { tags: [...tags, "me"] },
          });
          people = people.map((x) => (x.id === p.id ? updated : x));
        }
      }
    }

    const edges = await db.edge.findMany({
      where: {
        OR: [
          { source: { userId } },
          { target: { userId } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      people: people.map(personDTO),
      edges: edges.map(edgeDTO),
    });
  } catch {
    return NextResponse.json({ error: "Sign in to view your constellation" }, { status: 401 });
  }
}
