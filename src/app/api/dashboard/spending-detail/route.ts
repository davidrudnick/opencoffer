import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { transactions, financialAccounts } from "@/lib/db/schema";
import { householdUserIds } from "@/lib/household";
import { effectiveCategorySQL, spendKindWhere } from "@/lib/finance/tools";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const month = url.searchParams.get("month"); // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 });

  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const ids = await householdUserIds(session.user.id);

  const effectiveCategory = effectiveCategorySQL();
  const consumptionWhere = and(
    inArray(transactions.userId, ids),
    gte(transactions.date, start),
    lte(transactions.date, end),
    sql`${transactions.amount} < 0`,
    eq(transactions.pending, false),
    spendKindWhere("consumption"),
  );

  const [cats, tx] = await Promise.all([
    db
      .select({
        category: effectiveCategory,
        total: sql<string>`abs(sum(${transactions.amount}))::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(consumptionWhere)
      .groupBy(effectiveCategory)
      .orderBy(sql`sum(${transactions.amount}) asc`),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        name: transactions.name,
        merchant: transactions.merchantName,
        category: effectiveCategory,
        account: financialAccounts.name,
      })
      .from(transactions)
      .leftJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
      .where(consumptionWhere)
      .orderBy(desc(sql`abs(${transactions.amount})`))
      .limit(8),
  ]);

  return NextResponse.json({
    cats: cats.map((c) => ({ category: c.category, total: Number(c.total), count: c.count })),
    tx: tx.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      amount: Number(t.amount),
      name: t.name,
      merchant: t.merchant,
      category: t.category,
      account: t.account,
    })),
  });
}
