import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const id = Math.random().toString(36).slice(2, 10);
    const email = `guest-${id}@monami.local`;
    const password = Math.random().toString(36).slice(2);

    const hashed = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: {
        name: `Guest ${id}`,
        email,
        password: hashed,
        role: "guest",
        person: {
          create: {
            name: `Guest ${id}`,
            email,
            skills: [],
            interests: [],
            tags: [],
            links: {},
            isSelf: true,
          },
        },
      },
    });

    return NextResponse.json({ email, password, userId: user.id });
  } catch {
    return NextResponse.json(
      { error: "Could not create guest account" },
      { status: 500 }
    );
  }
}
