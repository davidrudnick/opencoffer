import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { aiInsights } from "@/lib/db/schema";
import { generateInsights } from "@/lib/finance/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select()
    .from(aiInsights)
    .where(and(eq(aiInsights.userId, session.user.id), isNull(aiInsights.dismissedAt)))
    .orderBy(desc(aiInsights.generatedAt))
    .limit(20);
  return NextResponse.json(rows);
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await generateInsights(session.user.id);
  return NextResponse.json(r);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] };
  if (!ids?.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
  await db
    .update(aiInsights)
    .set({ dismissedAt: new Date() })
    .where(and(eq(aiInsights.userId, session.user.id), inArray(aiInsights.id, ids)));
  return NextResponse.json({ ok: true });
}
