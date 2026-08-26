import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  personDTO,
  toLinksInput,
  toStringArrayInput,
} from "@/lib/dto";

function optionalString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export async function GET() {
  const people = await db.person.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ people: people.map(personDTO) });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = optionalString((b as Record<string, unknown>).name);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const r = b as Record<string, unknown>;
  try {
    const person = await db.person.create({
      data: {
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
        discordId: optionalString(r.discordId),
      },
    });
    return NextResponse.json(personDTO(person), { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not create person" },
      { status: 500 }
    );
  }
}
