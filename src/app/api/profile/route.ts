import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser, requireUser } from "@/lib/auth";

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
    })
    .where(eq(users.id, session.id))
    .returning({
      email: users.email,
      displayName: users.displayName,
      headline: users.headline,
      resumeText: users.resumeText,
      writingStyle: users.writingStyle,
    });

  return NextResponse.json({ profile: updated });
}
