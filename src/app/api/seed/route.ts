import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertDemoData } from "@/lib/demo";
import { edgeDTO, personDTO } from "@/lib/dto";

export async function POST() {
  const count = await db.person.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Graph already has data" },
      { status: 409 }
    );
  }
  await insertDemoData(db);
  const [people, edges] = await Promise.all([
    db.person.findMany(),
    db.edge.findMany(),
  ]);
  return NextResponse.json({
    people: people.map(personDTO),
    edges: edges.map(edgeDTO),
  });
}
