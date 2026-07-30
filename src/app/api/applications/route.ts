import { and, desc, eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { newId, requireUser } from "@/lib/auth";
import {
  baseJobKey,
  cleanRoleTitle,
  detectSource,
  isJunkRole,
  isStaleApplication,
  normalizeJobUrl,
} from "@/lib/job-key";
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

  // Fix titles that captured confirmation chrome (e.g. "You have applied for …")
  const cleaned = await Promise.all(
    rows.map(async (row) => {
      const role = cleanRoleTitle(row.role);
      if (role && role !== row.role) {
        const [updated] = await db
          .update(applications)
          .set({ role, updatedAt: new Date() })
          .where(eq(applications.id, row.id))
          .returning();
        return updated || { ...row, role };
      }
      return row;
    }),
  );

  return NextResponse.json({ applications: cleaned });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const url = String(body.url || "").trim();
    const company = String(body.company || "Unknown").trim() || "Unknown";
    const role =
      cleanRoleTitle(String(body.role || "Unknown role").trim()) || "Unknown role";
    const status = isStatus(String(body.status || "applied"))
      ? String(body.status)
      : "applied";
    const notes = String(body.notes || "");
    const rawKey = typeof body.jobKey === "string" ? body.jobKey.trim() : "";
    const baseKey = baseJobKey(rawKey || normalizeJobUrl(url));
    const forceNewCycle = Boolean(body.newCycle);
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const db = getDb();
    const family = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.userId, user.id),
          or(eq(applications.jobKey, baseKey), sql`${applications.jobKey} like ${`${baseKey}#%`}`),
        ),
      )
      .orderBy(desc(applications.updatedAt));

    const latest = family[0];
    const now = new Date();
    const followUpAt =
      status === "applied" || status === "oa" || status === "interview"
        ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        : null;

    const shouldNewCycle =
      forceNewCycle || (latest && isStaleApplication(latest) && status !== "saved");

    if (latest && !shouldNewCycle) {
      const incomingJunk = isJunkRole(role);
      const latestJunk = isJunkRole(latest.role);
      const cleanedLatest = cleanRoleTitle(latest.role);
      const betterRole =
        role &&
        !incomingJunk &&
        (latestJunk ||
          cleanedLatest !== latest.role ||
          latest.role.length < role.length ||
          /engineer|developer|manager|analyst|designer|scientist/i.test(role));
      const nextRole = betterRole
        ? role
        : latestJunk
          ? cleanedLatest || latest.role
          : cleanedLatest !== latest.role
            ? cleanedLatest
            : latest.role;
      const nextCompany =
        company && company !== "Unknown"
          ? company
          : latest.company;
      const [updated] = await db
        .update(applications)
        .set({
          company: nextCompany,
          role: nextRole,
          url,
          status,
          notes: notes || latest.notes,
          source: detectSource(url),
          appliedAt: status === "saved" ? latest.appliedAt : latest.appliedAt || now,
          followUpAt: followUpAt ?? latest.followUpAt,
          updatedAt: now,
        })
        .where(eq(applications.id, latest.id))
        .returning();
      return NextResponse.json({
        application: updated,
        created: false,
        newCycle: false,
      });
    }

    const cycle = family.length + 1;
    const jobKey = cycle === 1 ? baseKey : `${baseKey}#${cycle}`;
    const cleanRole = isJunkRole(role) ? "Unknown role" : role;

    const [created] = await db
      .insert(applications)
      .values({
        id: newId("app"),
        userId: user.id,
        jobKey,
        company,
        role: cleanRole,
        url,
        status,
        notes:
          cycle > 1
            ? `${notes ? `${notes}\n` : ""}Re-opened posting / new apply cycle #${cycle}`.trim()
            : notes,
        source: detectSource(url),
        appliedAt: status === "saved" ? null : now,
        followUpAt,
      })
      .returning();

    return NextResponse.json(
      { application: created, created: true, newCycle: cycle > 1 },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
