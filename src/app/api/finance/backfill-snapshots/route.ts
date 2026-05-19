import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { backfillNetWorth } from "@/lib/finance/netWorthBackfill";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.min(730, Math.max(7, Number(url.searchParams.get("days") ?? 180)));
  try {
    const r = await backfillNetWorth(session.user.id, days);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "backfill failed";
    console.error("[backfill-api] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
