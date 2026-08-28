// GET /api/edges — list all edges.
// POST /api/edges — create a new edge between two people.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { edgeDTO, toStringArrayInput } from "@/lib/dto";
import { ORIGIN_KEYS, type Origin } from "@/lib/model";
import { requireUserId } from "@/lib/auth-guard";

function parseOrigin(v: unknown): Origin | null {
  return typeof v === "string" && (ORIGIN_KEYS as string[]).includes(v) ? (v as Origin) : null;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const edges = await db.edge.findMany({
      where: { source: { userId } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ edges: edges.map(edgeDTO) });
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
    const sourceId = typeof r.sourceId === "string" ? r.sourceId : "";
    const targetId = typeof r.targetId === "string" ? r.targetId : "";
    if (!sourceId || !targetId) {
      return NextResponse.json({ error: "Both people are required" }, { status: 400 });
    }
    if (sourceId === targetId) {
      return NextResponse.json({ error: "A person cannot be connected to themselves" }, { status: 400 });
    }
    const strengthRaw = Number(r.strength);
    let metAt: Date | null = null;
    if (typeof r.metAt === "string" && r.metAt) {
      const d = new Date(r.metAt);
      if (!Number.isNaN(d.getTime())) metAt = d;
    }
    try {
      const [source, target] = await Promise.all([
        db.person.findFirst({ where: { id: sourceId, userId } }),
        db.person.findFirst({ where: { id: targetId, userId } }),
      ]);
      if (!source || !target) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }
      const edge = await db.edge.create({
        data: {
          sourceId,
          targetId,
          origin: parseOrigin(r.origin) ?? "other",
          context: typeof r.context === "string" ? r.context.trim() || null : null,
          communities: toStringArrayInput(r.communities),
          projects: toStringArrayInput(r.projects),
          strength: Number.isFinite(strengthRaw) && strengthRaw >= 1 && strengthRaw <= 3 ? Math.round(strengthRaw) : 2,
          metAt,
        },
      });
      return NextResponse.json(edgeDTO(edge), { status: 201 });
    } catch {
      return NextResponse.json({ error: "These two are already connected" }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
