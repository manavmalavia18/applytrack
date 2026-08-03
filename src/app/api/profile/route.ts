import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ANSWER_BANK_KEYS, type AnswerBank } from "@/lib/answer-bank";
import { getSessionUser, requireUser } from "@/lib/auth";

function sanitizeAnswerBank(input: unknown): AnswerBank {
  const out: AnswerBank = {};
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;
  for (const key of ANSWER_BANK_KEYS) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) out[key] = v.slice(0, 4000);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select({
      email: users.email,
      displayName: users.displayName,
      headline: users.headline,
      resumeText: users.resumeText,
      writingStyle: users.writingStyle,
      answerBank: users.answerBank,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile: rows[0] });
}

export async function PUT(req: NextRequest) {
  // Profile edits require session (dashboard), not just API token
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      displayName: String(body.displayName || "").slice(0, 120),
      headline: String(body.headline || "").slice(0, 255),
      resumeText: String(body.resumeText || "").slice(0, 40000),
      writingStyle: String(body.writingStyle || "").slice(0, 4000),
      answerBank: sanitizeAnswerBank(body.answerBank),
    })
    .where(eq(users.id, session.id))
    .returning({
      email: users.email,
      displayName: users.displayName,
      headline: users.headline,
      resumeText: users.resumeText,
      writingStyle: users.writingStyle,
      answerBank: users.answerBank,
    });

  return NextResponse.json({ profile: updated });
}
