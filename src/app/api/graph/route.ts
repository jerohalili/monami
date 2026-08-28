// GET /api/graph — returns all people and edges for the graph view.
// Auto-creates a "You" person if the user has no people yet.

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
          tags: [],
          links: {},
        },
      });
      people = [you];
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
