// DELETE /api/account/github — unlink GitHub from the authenticated user.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";

export async function DELETE() {
  try {
    const userId = await requireUserId();

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (user.email === "guest@monami.app") {
      return NextResponse.json({ error: "Cannot modify the guest account" }, { status: 400 });
    }

    if (!user.githubId) {
      return NextResponse.json({ error: "GitHub is not linked" }, { status: 400 });
    }

    // Must have a password to unlink GitHub (prevents lockout)
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Set a password first before unlinking GitHub" },
        { status: 400 },
      );
    }

    await db.user.update({
      where: { id: userId },
      data: {
        githubId: null,
        githubToken: null,
        githubTokenExpiry: null,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
