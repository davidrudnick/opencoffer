import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categoryRules, transactions } from "@/lib/db/schema";

export type RuleField = "merchant" | "name";
export type RuleMatchType = "contains" | "equals";

export type MatchableRule = {
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
};

export type MatchableTransaction = {
  name: string;
  merchantName: string | null;
};

export function matchesCategoryRule(rule: MatchableRule, tx: MatchableTransaction): boolean {
  const value = rule.field === "merchant" ? tx.merchantName : tx.name;
  if (!value) return false;
  const target = value.trim().toLocaleLowerCase();
  const pattern = rule.pattern.trim().toLocaleLowerCase();
  if (!pattern) return false;
  if (rule.matchType === "equals") return target === pattern;
  return target.includes(pattern);
}

export async function applyCategoryRules(
  userId: string,
  opts: { transactionIds?: string[]; ruleId?: string } = {},
): Promise<{ affected: number }> {
  const ruleFilters = [eq(categoryRules.userId, userId), eq(categoryRules.enabled, true)];
  if (opts.ruleId) ruleFilters.push(eq(categoryRules.id, opts.ruleId));

  const rules = await db
    .select()
    .from(categoryRules)
    .where(and(...ruleFilters))
    .orderBy(categoryRules.createdAt);

  if (rules.length === 0) return { affected: 0 };

  const txFilters = [eq(transactions.userId, userId), isNull(transactions.overrideCategory)];
  if (opts.transactionIds?.length) txFilters.push(inArray(transactions.id, opts.transactionIds));
  else if (opts.transactionIds && opts.transactionIds.length === 0) return { affected: 0 };

  const rows = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantName: transactions.merchantName,
    })
    .from(transactions)
    .where(and(...txFilters));

  let affected = 0;
  for (const rule of rules) {
    if (rule.field !== "merchant" && rule.field !== "name") continue;
    if (rule.matchType !== "contains" && rule.matchType !== "equals") continue;
    const field: RuleField = rule.field;
    const matchType: RuleMatchType = rule.matchType;

    const matched = rows.filter((tx) =>
      matchesCategoryRule(
        { field, matchType, pattern: rule.pattern },
        tx,
      ),
    );
    if (matched.length === 0) continue;

    const ids = matched.map((tx) => tx.id);
    const updated = await db
      .update(transactions)
      .set({
        overrideCategory: rule.category,
        overrideSubcategory: rule.subcategory,
      })
      .where(and(eq(transactions.userId, userId), isNull(transactions.overrideCategory), inArray(transactions.id, ids)))
      .returning({ id: transactions.id });

    if (updated.length === 0) continue;
    affected += updated.length;
    await db
      .update(categoryRules)
      .set({ appliedCount: sql`${categoryRules.appliedCount} + ${updated.length}` })
      .where(and(eq(categoryRules.userId, userId), eq(categoryRules.id, rule.id)));

    const updatedIds = new Set(updated.map((tx) => tx.id));
    for (let i = rows.length - 1; i >= 0; i--) {
      if (updatedIds.has(rows[i].id)) rows.splice(i, 1);
    }
  }

  return { affected };
}
