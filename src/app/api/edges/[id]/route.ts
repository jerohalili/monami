import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { edgeDTO, toStringArrayInput } from "@/lib/dto";
import { isOrigin } from "@/lib/model";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const r = b as Record<string, unknown>;
  const data: Prisma.EdgeUpdateInput = {};
  if ("origin" in r && isOrigin(r.origin)) data.origin = r.origin;
  if ("context" in r)
    data.context =
      typeof r.context === "string" ? r.context.trim() || null : null;
  if ("communities" in r)
    data.communities = toStringArrayInput(r.communities);
  if ("projects" in r) data.projects = toStringArrayInput(r.projects);
  if ("strength" in r) {
    const s = Number(r.strength);
    data.strength =
      Number.isFinite(s) && s >= 1 && s <= 3 ? Math.round(s) : 2;
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
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await db.edge.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
