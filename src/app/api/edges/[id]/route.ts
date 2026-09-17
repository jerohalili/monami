// Edit or remove a tie.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { edgeDTO, toStringArrayInput } from "@/lib/dto";
import { isOrigin } from "@/lib/model";
import { requireUserId } from "@/lib/auth-guard";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.edge.findFirst({
      where: { id, source: { userId } },
    });
    if (!existing) return NextResponse.json({ error: "That tie is gone — reload your constellation" }, { status: 404 });

    const b = await req.json().catch(() => null);
    if (!b || typeof b !== "object") {
      return NextResponse.json({ error: "Couldn't read those tie edits — try again" }, { status: 400 });
    }
    const r = b as Record<string, unknown>;
    const data: Prisma.EdgeUpdateInput = {};
    if ("origin" in r && isOrigin(r.origin)) data.origin = r.origin;
    if ("context" in r) data.context = typeof r.context === "string" ? r.context.trim() || null : null;
    if ("communities" in r) data.communities = toStringArrayInput(r.communities);
    if ("projects" in r) data.projects = toStringArrayInput(r.projects);
    if ("strength" in r) {
      const s = Number(r.strength);
      data.strength = Number.isFinite(s) && s >= 1 && s <= 3 ? Math.round(s) : 2;
    }
    if ("metAt" in r) {
      if (typeof r.metAt === "string" && r.metAt) {
        const d = new Date(r.metAt);
        data.metAt = Number.isNaN(d.getTime()) ? null : d;
      } else {
        data.metAt = null;
      }
    }
    try {
      const edge = await db.edge.update({ where: { id }, data });
      return NextResponse.json(edgeDTO(edge));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return NextResponse.json({ error: "That tie is gone" }, { status: 404 });
      }
      return NextResponse.json({ error: "Couldn't save that tie — check origin/strength and retry" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Sign in to edit your ties" }, { status: 401 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.edge.findFirst({
      where: { id, source: { userId } },
    });
    if (!existing) return NextResponse.json({ error: "That tie is already gone" }, { status: 404 });

    try {
      await db.edge.delete({ where: { id } });
      return new NextResponse(null, { status: 204 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return NextResponse.json({ error: "That tie is already gone" }, { status: 404 });
      }
      return NextResponse.json({ error: "Couldn't remove that tie — try again" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Sign in to edit your ties" }, { status: 401 });
  }
}
