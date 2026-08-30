// PATCH /api/account — update email or password.
// DELETE /api/account — delete the authenticated user and all associated data.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth-guard";

export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (user.email === "guest@monami.app") {
      return NextResponse.json({ error: "Cannot modify the guest account" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { currentPassword, newEmail, newPassword } = body as {
      currentPassword?: string;
      newEmail?: string;
      newPassword?: string;
    };

    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }

    // Verify current password
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "No password set. Sign in with GitHub and set a password first." },
        { status: 400 },
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    // Change email
    if (newEmail && typeof newEmail === "string") {
      const trimmed = newEmail.trim().toLowerCase();
      if (!trimmed || !trimmed.includes("@")) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      if (trimmed === user.email) {
        return NextResponse.json({ error: "New email is the same as current" }, { status: 400 });
      }
      const existing = await db.user.findUnique({ where: { email: trimmed } });
      if (existing) {
        return NextResponse.json({ error: "Email is already in use" }, { status: 409 });
      }
      await db.user.update({ where: { id: userId }, data: { email: trimmed } });
      return NextResponse.json({ ok: true, field: "email" });
    }

    // Change password
    if (newPassword && typeof newPassword === "string") {
      if (newPassword.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await db.user.update({ where: { id: userId }, data: { passwordHash } });
      return NextResponse.json({ ok: true, field: "password" });
    }

    return NextResponse.json({ error: "Provide newEmail or newPassword" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Skip deletion for the shared guest account
    if (user.email === "guest@monami.app") {
      return NextResponse.json({ error: "Cannot delete the guest account" }, { status: 400 });
    }

    // Delete user — cascades to Person and Edge via onDelete: Cascade
    await db.user.delete({ where: { id: userId } });

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
