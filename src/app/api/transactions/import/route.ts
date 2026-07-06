import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { financialAccounts, transactions } from "@/lib/db/schema";
import { snapshotNetWorthForUser } from "@/lib/finance/netWorthSnapshot";

const importRowSchema = z.object({
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date"),
  amount: z.number().finite(),
  name: z.string().trim().min(1).max(500),
  merchant: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  subcategory: z.string().trim().max(120).nullable().optional(),
});

const importSchema = z.object({
  accountId: z.string().uuid(),
  rows: z.array(importRowSchema).min(1).max(5000),
});

function externalId(row: z.infer<typeof importRowSchema>) {
  const key = `${row.date}|${row.amount}|${row.name.trim()}`;
  return `csv_${createHash("sha256").update(key).digest("hex")}`;
}

function revalidateTransactionPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/charts");
  revalidatePath("/dashboard/transactions");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = importSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const [account] = await db
    .select({
      id: financialAccounts.id,
      currency: financialAccounts.isoCurrencyCode,
    })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, parsed.data.accountId), eq(financialAccounts.userId, session.user.id)))
    .limit(1);

  if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });

  let inserted = 0;
  for (const row of parsed.data.rows) {
    const result = await db
      .insert(transactions)
      .values({
        accountId: account.id,
        userId: session.user.id,
        externalTxId: externalId(row),
        date: new Date(row.date),
        amount: String(row.amount),
        isoCurrencyCode: account.currency ?? "USD",
        name: row.name.trim(),
        merchantName: row.merchant?.trim() || null,
        category: row.category?.trim() || null,
        subcategory: row.subcategory?.trim() || null,
        pending: false,
      })
      .onConflictDoNothing({
        target: [transactions.accountId, transactions.externalTxId],
      })
      .returning({ id: transactions.id });
    if (result.length > 0) inserted++;
  }

  revalidateTransactionPaths();
  void snapshotNetWorthForUser(session.user.id).catch((error) => {
    console.error("[transactions/import] snapshot failed:", error);
  });
  import("@/lib/finance/categorize")
    .then((m) => m.categorizeUncategorized(session.user.id))
    .then((r) => console.log("[transactions/import] categorize:", r))
    .catch((error) => console.error("[transactions/import] categorize failed:", error));

  return NextResponse.json({ inserted, skipped: parsed.data.rows.length - inserted });
}
