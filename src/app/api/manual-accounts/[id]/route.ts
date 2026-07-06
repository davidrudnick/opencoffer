import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { financialAccounts } from "@/lib/db/schema";
import { snapshotNetWorthForUser } from "@/lib/finance/netWorthSnapshot";
import { ACCOUNT_GROUPS } from "@/lib/manualAccounts";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  accountGroup: z.enum(ACCOUNT_GROUPS).optional(),
  balance: z.number().finite().optional(),
});

function revalidateAccountPaths() {
  revalidatePath("/settings/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/charts");
  revalidatePath("/dashboard/investments");
}

function snapshotUser(userId: string) {
  void snapshotNetWorthForUser(userId).catch((error) => {
    console.error("[manual-accounts] snapshot failed:", error);
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const hasBalance = "balance" in parsed.data;
  const [account] = await db
    .update(financialAccounts)
    .set({
      ...("name" in parsed.data ? { name: parsed.data.name } : {}),
      ...("accountGroup" in parsed.data ? { accountGroup: parsed.data.accountGroup } : {}),
      ...(hasBalance
        ? {
            currentBalance: String(parsed.data.balance),
            availableBalance: String(parsed.data.balance),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialAccounts.id, id),
        eq(financialAccounts.userId, session.user.id),
        eq(financialAccounts.source, "manual"),
      ),
    )
    .returning();

  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });

  revalidateAccountPaths();
  if (hasBalance) snapshotUser(session.user.id);
  return NextResponse.json(account);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const deleted = await db
    .delete(financialAccounts)
    .where(
      and(
        eq(financialAccounts.id, id),
        eq(financialAccounts.userId, session.user.id),
        eq(financialAccounts.source, "manual"),
      ),
    )
    .returning({ id: financialAccounts.id });

  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  revalidateAccountPaths();
  snapshotUser(session.user.id);
  return NextResponse.json({ ok: true });
}
