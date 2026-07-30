import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { normalizeJobUrl } from "@/lib/job-key";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";
  const jobKeyParam = searchParams.get("jobKey") || "";
  const jobKey = jobKeyParam || (url ? normalizeJobUrl(url) : "");
  if (!jobKey) {
    return NextResponse.json({ error: "jobKey or url required" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, user.id), eq(applications.jobKey, jobKey)))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ found: false, application: null });
  }
  return NextResponse.json({ found: true, application: rows[0] });
}
