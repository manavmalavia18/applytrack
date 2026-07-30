import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { newId, requireUser } from "@/lib/auth";
import { detectSource, normalizeJobUrl } from "@/lib/job-key";
import { isStatus } from "@/lib/statuses";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.userId, user.id))
    .orderBy(desc(applications.updatedAt));

  return NextResponse.json({ applications: rows });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const url = String(body.url || "").trim();
    const company = String(body.company || "Unknown").trim() || "Unknown";
    const role = String(body.role || "Unknown role").trim() || "Unknown role";
    const status = isStatus(String(body.status || "applied"))
      ? String(body.status)
      : "applied";
    const notes = String(body.notes || "");
    const jobKey = String(body.jobKey || "").trim() || normalizeJobUrl(url);
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db
      .select()
      .from(applications)
      .where(and(eq(applications.userId, user.id), eq(applications.jobKey, jobKey)))
      .limit(1);

    const now = new Date();
    const followUpAt =
      status === "applied" || status === "oa" || status === "interview"
        ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        : null;

    if (existing[0]) {
      const [updated] = await db
        .update(applications)
        .set({
          company,
          role,
          url,
          status,
          notes: notes || existing[0].notes,
          source: detectSource(url),
          appliedAt: status === "saved" ? existing[0].appliedAt : existing[0].appliedAt || now,
          followUpAt: followUpAt ?? existing[0].followUpAt,
          updatedAt: now,
        })
        .where(eq(applications.id, existing[0].id))
        .returning();
      return NextResponse.json({ application: updated, created: false });
    }

    const [created] = await db
      .insert(applications)
      .values({
        id: newId("app"),
        userId: user.id,
        jobKey,
        company,
        role,
        url,
        status,
        notes,
        source: detectSource(url),
        appliedAt: status === "saved" ? null : now,
        followUpAt,
      })
      .returning();

    return NextResponse.json({ application: created, created: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
