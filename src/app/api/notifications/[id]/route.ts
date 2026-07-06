import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { notificationChannels } from "@/lib/db/schema";

const patch = z.object({
  enabled: z.boolean().optional(),
  label: z.string().trim().min(1).max(80).optional(),
});

function serializeChannel(row: typeof notificationChannels.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    enabled: row.enabled,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const [row] = await db
    .update(notificationChannels)
    .set(parsed.data)
    .where(and(eq(notificationChannels.userId, session.user.id), eq(notificationChannels.id, id)))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(serializeChannel(row));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db
    .delete(notificationChannels)
    .where(and(eq(notificationChannels.userId, session.user.id), eq(notificationChannels.id, id)));
  return NextResponse.json({ ok: true });
}
