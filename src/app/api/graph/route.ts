// GET /api/graph — returns all people and edges for the graph view.
// Auto-creates a "You" person if the user has no people yet.
// Ensures the "You" node always has the "me" tag.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { edgeDTO, personDTO } from "@/lib/dto";
import { requireUserId } from "@/lib/auth-guard";

export async function GET() {
  try {
    const userId = await requireUserId();

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
      where: { source: { userId } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      people: people.map(personDTO),
      edges: edges.map(edgeDTO),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
