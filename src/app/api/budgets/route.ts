import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { budgets } from "@/lib/db/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select().from(budgets).where(eq(budgets.userId, session.user.id));
  return NextResponse.json(rows);
}

const body = z.object({
  category: z.string().min(1).max(64),
  monthlyAmount: z.number().positive(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const [row] = await db
    .insert(budgets)
    .values({
      userId: session.user.id,
      category: parsed.data.category,
      monthlyAmount: String(parsed.data.monthlyAmount),
    })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.category],
      set: { monthlyAmount: String(parsed.data.monthlyAmount), updatedAt: new Date() },
    })
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}
