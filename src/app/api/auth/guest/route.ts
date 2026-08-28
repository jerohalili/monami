import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const GUEST_EMAIL = "guest@monami.app";
const GUEST_PASSWORD = "guest123";

export async function POST() {
  let user = await db.user.findUnique({ where: { email: GUEST_EMAIL } });

  if (!user) {
    const passwordHash = await bcrypt.hash(GUEST_PASSWORD, 10);
    user = await db.user.create({
      data: {
        email: GUEST_EMAIL,
        passwordHash,
        name: "Guest",
      },
    });
  }

  return NextResponse.json({ email: user.email, password: GUEST_PASSWORD });
}
