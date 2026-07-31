import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PipelineBoard, type AppRow } from "@/components/PipelineBoard";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { cleanRoleTitle } from "@/lib/job-key";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = getDb();
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.userId, user.id))
    .orderBy(desc(applications.updatedAt));

  // Persist cleaned titles (confirmation chrome, etc.)
  for (const r of rows) {
    const role = cleanRoleTitle(r.role);
    if (role && role !== r.role) {
      await db
        .update(applications)
        .set({ role, updatedAt: new Date() })
        .where(eq(applications.id, r.id));
      r.role = role;
    }
  }

  const initial: AppRow[] = rows.map((r) => ({
    id: r.id,
    company: r.company,
    role: cleanRoleTitle(r.role) || r.role,
    url: r.url,
    status: r.status,
    source: r.source,
    jobKey: r.jobKey,
    reqId: r.reqId,
    notes: r.notes,
    appliedAt: r.appliedAt ? r.appliedAt.toISOString() : null,
    followUpAt: r.followUpAt ? r.followUpAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-8">
      <PipelineBoard initial={initial} />
    </main>
  );
}
