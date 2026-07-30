import { and, desc, eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { baseJobKey, isStaleApplication, normalizeJobUrl } from "@/lib/job-key";

function ashbyIdFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!url.hostname.includes("ashbyhq.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.find((p, i) => i > 0 && /^[0-9a-f-]{8,}$/i.test(p)) || parts[1] || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";
  const jobKeyParam = (searchParams.get("jobKey") || "").trim();
  const normalized = url ? normalizeJobUrl(url) : "";
  const rawCandidates = [...new Set([jobKeyParam, normalized].filter(Boolean))];
  if (rawCandidates.length === 0 && !url) {
    return NextResponse.json({ error: "jobKey or url required" }, { status: 400 });
  }

  const db = getDb();
  const bases = [...new Set(rawCandidates.map(baseJobKey))];

  // Latest row for this posting family (includes #2, #3 cycles)
  for (const base of bases) {
    const rows = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.userId, user.id),
          or(eq(applications.jobKey, base), sql`${applications.jobKey} like ${`${base}#%`}`),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);

    if (rows[0]) {
      const app = rows[0];
      const stale = isStaleApplication(app);
      return NextResponse.json({
        found: true,
        stale,
        application: app,
        baseJobKey: base,
        // Fresh revisit of an active cycle
        sameCycle: !stale,
      });
    }
  }

  const ashbyId = ashbyIdFromUrl(url);
  if (ashbyId || url) {
    const filters = [];
    if (ashbyId) {
      filters.push(sql`${applications.jobKey} like ${`%:${ashbyId}%`}`);
      filters.push(sql`${applications.url} like ${`%/${ashbyId}%`}`);
    }
    if (url) filters.push(eq(applications.url, url));
    if (filters.length) {
      const rows = await db
        .select()
        .from(applications)
        .where(and(eq(applications.userId, user.id), or(...filters)))
        .orderBy(desc(applications.updatedAt))
        .limit(1);
      if (rows[0]) {
        const stale = isStaleApplication(rows[0]);
        return NextResponse.json({
          found: true,
          stale,
          application: rows[0],
          baseJobKey: baseJobKey(rows[0].jobKey),
          sameCycle: !stale,
        });
      }
    }
  }

  return NextResponse.json({
    found: false,
    stale: false,
    application: null,
    sameCycle: false,
  });
}
