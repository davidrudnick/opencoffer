import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { notificationChannels } from "@/lib/db/schema";
import { sendTestNotification } from "@/lib/notifications/deliver";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(and(eq(notificationChannels.userId, session.user.id), eq(notificationChannels.id, id)))
    .limit(1);
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    await sendTestNotification(channel);
    await db
      .update(notificationChannels)
      .set({ lastSuccessAt: new Date(), lastError: null })
      .where(and(eq(notificationChannels.userId, session.user.id), eq(notificationChannels.id, id)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = (error as Error).message.slice(0, 500);
    await db
      .update(notificationChannels)
      .set({ lastError: message })
      .where(and(eq(notificationChannels.userId, session.user.id), eq(notificationChannels.id, id)));
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
