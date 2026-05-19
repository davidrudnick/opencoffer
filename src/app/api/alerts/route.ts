import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { alerts, alertRules } from "@/lib/db/schema";
import { evaluateAlerts } from "@/lib/finance/alerts";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.userId, session.user.id))
    .orderBy(desc(alerts.createdAt))
    .limit(100);
  const unread = rows.filter((r) => !r.readAt).length;
  return NextResponse.json({ alerts: rows, unread });
}

const markRead = z.object({ ids: z.array(z.string().uuid()) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "evaluate") {
    await evaluateAlerts(session.user.id);
    return NextResponse.json({ ok: true });
  }
  const parsed = markRead.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await db
    .update(alerts)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(alerts.userId, session.user.id),
        inArray(alerts.id, parsed.data.ids),
        isNull(alerts.readAt),
      ),
    );
  return NextResponse.json({ ok: true });
}

// ---- /api/alerts/rules ----

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    kind: string;
    threshold?: number;
    category?: string;
    accountId?: string;
    enabled?: boolean;
    id?: string;
  } | null;
  if (!body || !body.kind)
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (body.id) {
    await db
      .update(alertRules)
      .set({
        kind: body.kind,
        threshold: body.threshold != null ? String(body.threshold) : null,
        category: body.category ?? null,
        accountId: body.accountId ?? null,
        enabled: body.enabled !== false,
      })
      .where(and(eq(alertRules.id, body.id), eq(alertRules.userId, session.user.id)));
  } else {
    await db.insert(alertRules).values({
      userId: session.user.id,
      kind: body.kind,
      threshold: body.threshold != null ? String(body.threshold) : null,
      category: body.category ?? null,
      accountId: body.accountId ?? null,
      enabled: body.enabled !== false,
    });
  }
  return NextResponse.json({ ok: true });
}
