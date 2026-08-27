// GET /api/graph — returns all people and edges for the graph view.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { edgeDTO, personDTO } from "@/lib/dto";

export async function GET() {
  const [people, edges] = await Promise.all([
    db.person.findMany({ orderBy: { createdAt: "asc" } }),
    db.edge.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return NextResponse.json({
    people: people.map(personDTO),
    edges: edges.map(edgeDTO),
  });
}
