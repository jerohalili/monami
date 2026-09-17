// Single member: fetch, update, delete.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { optionalString, personDTO, toLinksInput, toStringArrayInput } from "@/lib/dto";
import { requireUserId } from "@/lib/auth-guard";

type Params = { params: Promise<{ id: string }> };

const OPTIONAL_STRINGS = [
  "nickname", "avatarUrl", "headline", "company",
  "location", "email", "notes", "githubLogin",
] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const person = await db.person.findFirst({ where: { id, userId } });
    if (!person) return NextResponse.json({ error: "That circle member is gone" }, { status: 404 });
    return NextResponse.json(personDTO(person));
  } catch {
    return NextResponse.json({ error: "Sign in to view your circle" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.person.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "That circle member is gone — reload your constellation" }, { status: 404 });

    const b = await req.json().catch(() => null);
    if (!b || typeof b !== "object") {
      return NextResponse.json({ error: "Couldn't read those edits — try again" }, { status: 400 });
    }
    const r = b as Record<string, unknown>;
    const data: Prisma.PersonUpdateInput = {};
    if ("name" in r && typeof r.name === "string" && r.name.trim()) {
      data.name = r.name.trim();
    }
    for (const key of OPTIONAL_STRINGS) {
      if (key in r) data[key] = optionalString(r[key]);
    }
    if ("skills" in r) data.skills = toStringArrayInput(r.skills);
    if ("interests" in r) data.interests = toStringArrayInput(r.interests);
    if ("tags" in r) data.tags = toStringArrayInput(r.tags);
    if ("links" in r) data.links = toLinksInput(r.links);

    try {
      const person = await db.person.update({ where: { id }, data });
      return NextResponse.json(personDTO(person));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return NextResponse.json({ error: "That circle member is gone" }, { status: 404 });
      }
      return NextResponse.json({ error: "Couldn't save — check headline/links and retry" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Sign in to edit your circle" }, { status: 401 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.person.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "That circle member is already gone" }, { status: 404 });

    try {
      await db.person.delete({ where: { id } });
      return new NextResponse(null, { status: 204 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return NextResponse.json({ error: "That circle member is already gone" }, { status: 404 });
      }
      return NextResponse.json({ error: "Couldn't remove them — try again" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Sign in to edit your circle" }, { status: 401 });
  }
}
