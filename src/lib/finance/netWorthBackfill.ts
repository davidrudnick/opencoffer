import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { financialAccounts, transactions, netWorthSnapshots } from "@/lib/db/schema";

/**
 * Build historical net-worth snapshots from current balances + transaction
 * history. Walks backward day by day:
 *
 *   balance_at_eod(d) = balance_at_eod(d+1) - sum(transactions on d+1 .. today)
 *
 * Simplification: this only accounts for transaction-driven changes. For
 * investment accounts, asset prices fluctuate independently — so the historical
 * curve is the "if today's holdings held those values back then" approximation.
 * Good enough for spend/save trends; explicitly NOT for portfolio benchmarking.
 *
 * Idempotent: upserts one snapshot per (user, date).
 */
export async function backfillNetWorth(userId: string, days = 180) {
  const accts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.userId, userId));
  if (accts.length === 0) return { snapshotsWritten: 0, days };

  // Per-account running balance (mutated as we walk backward).
  const liveBalances = new Map<string, number>(accts.map((a) => [a.id, Number(a.currentBalance ?? 0)]));

  // Build a day-bucketed sum of transactions per account.
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  const rows = await db
    .select({
      accountId: transactions.accountId,
      day: sql<string>`to_char(date_trunc('day', ${transactions.date}), 'YYYY-MM-DD')`,
      sum: sql<string>`sum(${transactions.amount})::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, cutoff),
        eq(transactions.pending, false),
      ),
    )
    .groupBy(transactions.accountId, sql`date_trunc('day', ${transactions.date})`);

  // txByDay.get(day).get(acctId) = signed sum that day
  const txByDay = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!txByDay.has(r.day)) txByDay.set(r.day, new Map());
    txByDay.get(r.day)!.set(r.accountId, Number(r.sum));
  }

  // Today is the anchor — we already have current balances.
  let written = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Iterate from today backward `days` days inclusive.
  for (let offset = 0; offset <= days; offset++) {
    const d = new Date(today.getTime() - offset * 86400_000);
    const dayKey = d.toISOString().slice(0, 10);

    // Compute totals at end-of-day d.
    let assets = 0;
    let liabilities = 0;
    const byGroup: Record<string, number> = {};
    for (const a of accts) {
      const bal = liveBalances.get(a.id) ?? 0;
      if (a.type === "depository" || a.type === "investment") assets += bal;
      else if (a.type === "credit" || a.type === "loan") liabilities += Math.abs(bal);
      const g = a.userAccountGroup ?? a.accountGroup;
      byGroup[g] = (byGroup[g] ?? 0) + bal;
    }
    await db
      .insert(netWorthSnapshots)
      .values({
        userId,
        snapshotDate: d,
        assets: String(assets),
        liabilities: String(liabilities),
        netWorth: String(assets - liabilities),
        byGroup,
      })
      .onConflictDoUpdate({
        target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
        set: {
          assets: String(assets),
          liabilities: String(liabilities),
          netWorth: String(assets - liabilities),
          byGroup,
        },
      });
    written++;

    // Now walk back one more day: subtract today's tx from each account.
    const today_tx = txByDay.get(dayKey);
    if (today_tx) {
      for (const [acctId, sum] of today_tx) {
        liveBalances.set(acctId, (liveBalances.get(acctId) ?? 0) - sum);
      }
    }
  }
  return { snapshotsWritten: written, days };
}

/** Has this user ever had a snapshot? Used to decide whether to backfill on first sync. */
export async function hasAnySnapshots(userId: string): Promise<boolean> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId));
  return count > 0;
}
