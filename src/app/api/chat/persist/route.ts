import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { chatThreads, chatMessages } from "@/lib/db/schema";

const body = z.object({
  threadId: z.string().uuid(),
  role: z.enum(["assistant", "tool"]),
  content: z.any(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const [t] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, parsed.data.threadId), eq(chatThreads.userId, session.user.id)))
    .limit(1);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  await db.insert(chatMessages).values({
    threadId: parsed.data.threadId,
    role: parsed.data.role,
    content: parsed.data.content,
  });
  await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, t.id));
  const [updated] = await db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      updatedAt: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .where(eq(chatThreads.id, t.id))
    .limit(1);
  return NextResponse.json({
    ok: true,
    thread: {
      id: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
