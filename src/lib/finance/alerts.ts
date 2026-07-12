import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  alertRules,
  alerts as alertsTable,
  transactions,
  financialAccounts,
  budgets,
} from "@/lib/db/schema";
import { effectiveCategorySQL, effectiveIsTransferSQL, spendKindWhere } from "@/lib/finance/tools";

/**
 * Evaluate every active rule for a user and persist any new alerts.
 * Idempotent per (rule, day, entity) — we don't repeat alerts for the same
 * transaction or category overrun within a single calendar day.
 */
export async function evaluateAlerts(userId: string) {
  const rules = await db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.userId, userId), eq(alertRules.enabled, true)));
  if (rules.length === 0) return;

  for (const rule of rules) {
    try {
      if (rule.kind === "large_tx") await evaluateLargeTx(userId, rule);
      else if (rule.kind === "category_overspend") await evaluateOverspend(userId, rule);
      else if (rule.kind === "low_balance") await evaluateLowBalance(userId, rule);
    } catch (e) {
      console.error("[alerts] rule eval failed", rule.id, e);
    }
  }
}

async function emit(opts: {
  userId: string;
  ruleId: string;
  kind: string;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
  dedupeKey: string;
}) {
  // Don't emit the same alert twice in 24h.
  const existing = await db
    .select({ id: alertsTable.id })
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.userId, opts.userId),
        eq(alertsTable.kind, opts.kind),
        sql`${alertsTable.meta} ->> 'dedupeKey' = ${opts.dedupeKey}`,
        gte(alertsTable.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    )
    .limit(1);
  if (existing.length) return;
  await db.insert(alertsTable).values({
    userId: opts.userId,
    ruleId: opts.ruleId,
    kind: opts.kind,
    title: opts.title,
    body: opts.body ?? null,
    meta: { ...(opts.meta ?? {}), dedupeKey: opts.dedupeKey },
  });
}

async function evaluateLargeTx(userId: string, rule: typeof alertRules.$inferSelect) {
  const threshold = Number(rule.threshold ?? 500);
  const since = new Date(Date.now() - 3 * 86400_000);
  const rows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      name: transactions.name,
      date: transactions.date,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, since),
        sql`abs(${transactions.amount}) >= ${threshold}`,
        sql`${effectiveIsTransferSQL()} = false`,
      ),
    )
    .orderBy(desc(transactions.date))
    .limit(50);
  for (const t of rows) {
    const amount = Number(t.amount);
    await emit({
      userId,
      ruleId: rule.id,
      kind: "large_tx",
      title: `${amount < 0 ? "Large spend" : "Large inflow"}: $${Math.abs(amount).toLocaleString()}`,
      body: t.name.slice(0, 200),
      meta: { txId: t.id, amount },
      dedupeKey: `tx:${t.id}`,
    });
  }
}

async function evaluateOverspend(userId: string, rule: typeof alertRules.$inferSelect) {
  // Find this month's category total vs budget.
  if (!rule.category) return;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [budgetRow] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.category, rule.category)))
    .limit(1);
  if (!budgetRow) return;
  const cap = Number(budgetRow.monthlyAmount);
  const [{ spent }] = await db
    .select({
      spent: sql<string>`coalesce(abs(sum(${transactions.amount})), 0)::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, monthStart),
        sql`${transactions.amount} < 0`,
        eq(transactions.pending, false),
        spendKindWhere("consumption"),
        sql`${effectiveCategorySQL()} = ${rule.category}`,
      ),
    );
  const total = Number(spent);
  if (total >= cap) {
    await emit({
      userId,
      ruleId: rule.id,
      kind: "category_overspend",
      title: `Over budget — ${rule.category}: $${total.toLocaleString()} of $${cap.toLocaleString()}`,
      body: `You hit your monthly ${rule.category} budget on ${new Date().toLocaleDateString()}.`,
      meta: { category: rule.category, spent: total, budget: cap },
      dedupeKey: `overspend:${rule.category}:${monthStart.toISOString().slice(0, 7)}`,
    });
  }
}

async function evaluateLowBalance(userId: string, rule: typeof alertRules.$inferSelect) {
  if (!rule.accountId || rule.threshold == null) return;
  const [acct] = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.id, rule.accountId))
    .limit(1);
  if (!acct) return;
  const bal = Number(acct.currentBalance ?? 0);
  if (bal <= Number(rule.threshold)) {
    await emit({
      userId,
      ruleId: rule.id,
      kind: "low_balance",
      title: `Low balance on ${acct.name}: $${bal.toLocaleString()}`,
      body: `Your account is at or below the $${Number(rule.threshold).toLocaleString()} threshold.`,
      meta: { accountId: acct.id, balance: bal },
      dedupeKey: `low_balance:${acct.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  }
}
