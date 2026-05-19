import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { connections, auditLog } from "@/lib/db/schema";

const PURGE_DAYS = 30;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [conn] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.userId, session.user.id)))
    .limit(1);
  if (!conn) return NextResponse.json({ error: "not found" }, { status: 404 });

  // SimpleFIN has no remote "revoke" — the access URL stays valid until the
  // user revokes it on the bridge. Soft-disconnect + schedule purge mirrors
  // the OpenAI 30-day window.
  const purgeAfter = new Date(Date.now() + PURGE_DAYS * 86400_000);
  await db
    .update(connections)
    .set({ status: "disconnected", disconnectedAt: new Date(), purgeAfter })
    .where(eq(connections.id, conn.id));
  await db.insert(auditLog).values({
    userId: conn.userId,
    kind: "simplefin.disconnect",
    actor: "session",
    target: conn.id,
    meta: { purgeAfter },
  });
  return NextResponse.json({ ok: true, purgeAfter });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [conn] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.userId, session.user.id)))
    .limit(1);
  if (!conn) return NextResponse.json({ error: "not found" }, { status: 404 });
  await db.delete(connections).where(eq(connections.id, conn.id));
  await db.insert(auditLog).values({
    userId: conn.userId,
    kind: "simplefin.purge",
    actor: "session",
    target: conn.id,
  });
  return NextResponse.json({ ok: true });
}
