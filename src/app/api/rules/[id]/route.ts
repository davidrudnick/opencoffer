import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { categoryRules } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/finance/categorize";
import { applyCategoryRules } from "@/lib/finance/rules";

const categoryValues = [CATEGORIES[0], ...CATEGORIES.slice(1)] as [string, ...string[]];

const patch = z.object({
  enabled: z.boolean().optional(),
  field: z.enum(["merchant", "name"]).optional(),
  matchType: z.enum(["contains", "equals"]).optional(),
  pattern: z.string().trim().min(1).max(200).optional(),
  category: z.enum(categoryValues).optional(),
  subcategory: z.string().trim().max(64).nullable().optional(),
  applyRetroactively: z.boolean().optional(),
});

function serializeRule(row: typeof categoryRules.$inferSelect) {
  return {
    id: row.id,
    field: row.field,
    matchType: row.matchType,
    pattern: row.pattern,
    category: row.category,
    subcategory: row.subcategory,
    enabled: row.enabled,
    appliedCount: row.appliedCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function revalidateFinancePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/charts");
  revalidatePath("/dashboard/transactions");
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { applyRetroactively, ...values } = parsed.data;
  const [row] = await db
    .update(categoryRules)
    .set(values)
    .where(and(eq(categoryRules.userId, session.user.id), eq(categoryRules.id, id)))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = applyRetroactively ? await applyCategoryRules(session.user.id, { ruleId: row.id }) : { affected: 0 };
  if (result.affected > 0) revalidateFinancePaths();
  const [fresh] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, session.user.id), eq(categoryRules.id, id)))
    .limit(1);

  return NextResponse.json({ rule: serializeRule(fresh ?? row), affected: result.affected });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db
    .delete(categoryRules)
    .where(and(eq(categoryRules.userId, session.user.id), eq(categoryRules.id, id)));
  return NextResponse.json({ ok: true });
}
