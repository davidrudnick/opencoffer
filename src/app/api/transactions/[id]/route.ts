import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";

const patch = z.object({
  overrideCategory: z.string().max(64).nullable().optional(),
  overrideSubcategory: z.string().max(64).nullable().optional(),
  overrideMerchant: z.string().max(120).nullable().optional(),
  overrideIsTransfer: z.boolean().nullable().optional(),
  userNotes: z.string().max(500).nullable().optional(),
  isRecurring: z.boolean().optional(),
});

const FINANCE_PATHS = [
  "/dashboard",
  "/dashboard/charts",
  "/dashboard/subscriptions",
  "/dashboard/investments",
  "/dashboard/transactions",
];

function revalidateFinancePaths() {
  for (const path of FINANCE_PATHS) revalidatePath(path);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await db
    .update(transactions)
    .set(parsed.data)
    .where(and(eq(transactions.id, id), eq(transactions.userId, session.user.id)));
  revalidateFinancePaths();
  return NextResponse.json({ ok: true });
}
