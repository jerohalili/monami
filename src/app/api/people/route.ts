// GET /api/people — list all people.
// POST /api/people — create a new person.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { optionalString, personDTO, toLinksInput, toStringArrayInput } from "@/lib/dto";
import { requireUserId } from "@/lib/auth-guard";

export async function GET() {
  try {
    const userId = await requireUserId();
    const people = await db.person.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ people: people.map(personDTO) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const b = await req.json().catch(() => null);
    if (!b || typeof b !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const r = b as Record<string, unknown>;
    const name = optionalString(r.name);
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    try {
      const person = await db.person.create({
        data: {
          userId,
          name,
          nickname: optionalString(r.nickname),
          avatarUrl: optionalString(r.avatarUrl),
          headline: optionalString(r.headline),
          company: optionalString(r.company),
          location: optionalString(r.location),
          email: optionalString(r.email),
          skills: toStringArrayInput(r.skills),
          interests: toStringArrayInput(r.interests),
          tags: toStringArrayInput(r.tags),
          notes: optionalString(r.notes),
          links: toLinksInput(r.links),
          githubLogin: optionalString(r.githubLogin),
        },
      });
      return NextResponse.json(personDTO(person), { status: 201 });
    } catch {
      return NextResponse.json({ error: "Could not create person" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
