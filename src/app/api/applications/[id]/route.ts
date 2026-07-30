import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isStatus } from "@/lib/statuses";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.company != null) patch.company = String(body.company);
    if (body.role != null) patch.role = String(body.role);
    if (body.notes != null) patch.notes = String(body.notes);
    if (body.status != null) {
      if (!isStatus(String(body.status))) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      patch.status = String(body.status);
    }
    if (body.followUpAt !== undefined) {
      patch.followUpAt = body.followUpAt ? new Date(body.followUpAt) : null;
    }

    const db = getDb();
    const [updated] = await db
      .update(applications)
      .set(patch)
      .where(and(eq(applications.id, id), eq(applications.userId, user.id)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ application: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const db = getDb();
  const [deleted] = await db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, user.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
