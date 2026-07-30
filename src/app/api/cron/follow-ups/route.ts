import { and, eq, isNotNull, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications, users } from "@/db/schema";

/**
 * Daily cron: find applications past followUpAt that are still mid-pipeline.
 * Logs nudges (wire email later). Protect with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const due = await db
    .select({
      id: applications.id,
      company: applications.company,
      role: applications.role,
      status: applications.status,
      followUpAt: applications.followUpAt,
      email: users.email,
    })
    .from(applications)
    .innerJoin(users, eq(applications.userId, users.id))
    .where(
      and(
        isNotNull(applications.followUpAt),
        lte(applications.followUpAt, now),
        eq(applications.status, "applied"),
      ),
    );

  // Also OA / interview stages
  const dueMore = await db
    .select({
      id: applications.id,
      company: applications.company,
      role: applications.role,
      status: applications.status,
      followUpAt: applications.followUpAt,
      email: users.email,
    })
    .from(applications)
    .innerJoin(users, eq(applications.userId, users.id))
    .where(
      and(
        isNotNull(applications.followUpAt),
        lte(applications.followUpAt, now),
        eq(applications.status, "oa"),
      ),
    );

  const nudges = [...due, ...dueMore].map((row) => ({
    to: row.email,
    subject: `Follow up: ${row.role} at ${row.company}`,
    body: `It's been a week+. Status: ${row.status}. Time to nudge?`,
    applicationId: row.id,
  }));

  console.log("[cron/follow-ups]", JSON.stringify({ count: nudges.length, nudges }));

  return NextResponse.json({
    ok: true,
    count: nudges.length,
    nudges,
    note: "Email delivery not wired yet — check logs / response for due follow-ups.",
  });
}
