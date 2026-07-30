import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  createSessionToken,
  hashPassword,
  newId,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    if (!email.includes("@") || password.length < 8) {
      return NextResponse.json(
        { error: "Email and password (8+ chars) required." },
        { status: 400 },
      );
    }

    const db = getDb();
    const id = newId("usr");
    await db.insert(users).values({
      id,
      email,
      passwordHash: await hashPassword(password),
    });

    const token = await createSessionToken(id, email);
    await setSessionCookie(token);
    return NextResponse.json({ id, email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    const status = message.includes("unique") || message.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
