import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { categoryRules } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/finance/categorize";
import { applyCategoryRules } from "@/lib/finance/rules";

const categoryValues = [CATEGORIES[0], ...CATEGORIES.slice(1)] as [string, ...string[]];

const body = z.object({
  field: z.enum(["merchant", "name"]),
  matchType: z.enum(["contains", "equals"]),
  pattern: z.string().trim().min(1).max(200),
  category: z.enum(categoryValues),
  subcategory: z.string().trim().max(64).nullable().optional(),
  enabled: z.boolean().optional(),
  applyRetroactively: z.boolean().default(true),
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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select()
    .from(categoryRules)
    .where(eq(categoryRules.userId, session.user.id))
    .orderBy(desc(categoryRules.createdAt));
  return NextResponse.json(rows.map(serializeRule));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const [row] = await db
    .insert(categoryRules)
    .values({
      userId: session.user.id,
      field: parsed.data.field,
      matchType: parsed.data.matchType,
      pattern: parsed.data.pattern,
      category: parsed.data.category,
      subcategory: parsed.data.subcategory || null,
      enabled: parsed.data.enabled ?? true,
    })
    .returning();

  const result = parsed.data.applyRetroactively
    ? await applyCategoryRules(session.user.id, { ruleId: row.id })
    : { affected: 0 };
  if (result.affected > 0) revalidateFinancePaths();
  const [fresh] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, session.user.id), eq(categoryRules.id, row.id)))
    .limit(1);

  return NextResponse.json({ rule: serializeRule(fresh ?? row), affected: result.affected });
}
