import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { chatMessages, chatThreads } from "@/lib/db/schema";
import { normalizeStoredMessage, toClientMessage } from "@/lib/chat/history";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, session.user.id)))
    .limit(1);
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, id))
    .orderBy(asc(chatMessages.createdAt));

  const messages = rows.map(normalizeStoredMessage).map(toClientMessage);

  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt.toISOString(),
    },
    messages,
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await db
    .delete(chatThreads)
    .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
