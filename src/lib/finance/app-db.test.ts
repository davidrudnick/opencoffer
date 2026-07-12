/**
 * App-level integration tests (beyond the MCP tools): category-rule engine,
 * alert evaluation, net-worth snapshot job, and MCP bearer-token auth.
 *
 * Runs against the disposable opencoffer_test database via
 * scripts/test-mcp.mjs — refuses to run anywhere else.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ENABLED = process.env.OPENCOFFER_MCP_TEST === "1";
const DB_URL = process.env.DATABASE_URL ?? "";

test("app integration", { skip: !ENABLED ? "run via scripts/test-mcp.mjs" : false }, async (t) => {
  assert.ok(DB_URL.includes("opencoffer_test"), "refusing to run against a non-test database");

  const { db } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");

  const mkUser = async (email: string) => {
    const [u] = await db.insert(s.users).values({ email }).returning();
    const [h] = await db.insert(s.households).values({ ownerUserId: u.id }).returning();
    await db.insert(s.householdMembers).values({ householdId: h.id, userId: u.id, role: "owner" });
    await db.update(s.users).set({ householdId: h.id }).where(eq(s.users.id, u.id));
    return u;
  };
  const mkAcct = async (userId: string, v: Partial<typeof s.financialAccounts.$inferInsert>) => {
    const [row] = await db.insert(s.financialAccounts).values({
      userId,
      externalAccountId: `ext-${Math.random().toString(36).slice(2)}`,
      name: v.name ?? "Acct",
      type: v.type ?? "depository",
      accountGroup: v.accountGroup ?? "cash",
      userAccountGroup: v.userAccountGroup ?? null,
      currentBalance: v.currentBalance ?? "0",
    }).returning();
    return row;
  };
  const mkTx = async (userId: string, accountId: string, v: Partial<typeof s.transactions.$inferInsert>) => {
    const [row] = await db.insert(s.transactions).values({
      userId,
      accountId,
      externalTxId: `ext-${Math.random().toString(36).slice(2)}`,
      date: v.date ?? new Date(),
      amount: v.amount ?? "-10",
      name: v.name ?? "TX",
      merchantName: v.merchantName ?? null,
      aiCategory: v.aiCategory ?? null,
      overrideCategory: v.overrideCategory ?? null,
      overrideIsTransfer: v.overrideIsTransfer ?? null,
      isTransfer: v.isTransfer ?? false,
      pending: v.pending ?? false,
    }).returning();
    return row;
  };

  await t.test("applyCategoryRules: matches, precedence, idempotence", async () => {
    const { applyCategoryRules } = await import("@/lib/finance/rules");
    const u = await mkUser("rules@test.local");
    const a = await mkAcct(u.id, { name: "Rules Checking" });
    const sbux = await mkTx(u.id, a.id, { name: "STARBUCKS STORE 123", merchantName: "Starbucks", aiCategory: "Food & Dining" });
    const sq = await mkTx(u.id, a.id, { name: "SQ *BLUE BOTTLE", merchantName: null });
    const manual = await mkTx(u.id, a.id, { name: "STARBUCKS STORE 999", merchantName: "Starbucks", overrideCategory: "Business" });
    await db.insert(s.categoryRules).values([
      { userId: u.id, field: "merchant", matchType: "contains", pattern: "starbucks", category: "Coffee & Cafes", enabled: true },
      { userId: u.id, field: "name", matchType: "contains", pattern: "blue bottle", category: "Coffee & Cafes", enabled: true },
      { userId: u.id, field: "name", matchType: "contains", pattern: "sq *", category: "DisabledCat", enabled: false },
    ]);

    const first = await applyCategoryRules(u.id);
    assert.equal(first.affected, 2, "merchant + name rules each hit one row");
    const rows = await db.select().from(s.transactions).where(eq(s.transactions.userId, u.id));
    const get = (id: string) => rows.find((r) => r.id === id)!;
    assert.equal(get(sbux.id).overrideCategory, "Coffee & Cafes");
    assert.equal(get(sq.id).overrideCategory, "Coffee & Cafes", "disabled rule did not fire first");
    assert.equal(get(manual.id).overrideCategory, "Business", "manual override never stomped");

    const second = await applyCategoryRules(u.id);
    assert.equal(second.affected, 0, "idempotent — already-overridden rows skipped");
  });

  await t.test("evaluateAlerts: large_tx honors override transfers, dedupes", async () => {
    const { evaluateAlerts } = await import("@/lib/finance/alerts");
    const u = await mkUser("alerts@test.local");
    const a = await mkAcct(u.id, { name: "Alert Checking", currentBalance: "50" });
    await mkTx(u.id, a.id, { amount: "-250", name: "BIG PURCHASE" });
    await mkTx(u.id, a.id, { amount: "-900", name: "CC AUTOPAY", isTransfer: true });
    await mkTx(u.id, a.id, { amount: "-400", name: "MARKED TRANSFER", overrideIsTransfer: true });
    await db.insert(s.alertRules).values([
      { userId: u.id, kind: "large_tx", threshold: "100", enabled: true },
      { userId: u.id, kind: "low_balance", accountId: a.id, threshold: "100", enabled: true },
    ]);

    await evaluateAlerts(u.id);
    const alerts = await db.select().from(s.alerts).where(eq(s.alerts.userId, u.id));
    const titles = alerts.map((x) => `${x.kind}:${x.title}`).sort();
    assert.equal(alerts.filter((x) => x.kind === "large_tx").length, 1, `only the real purchase alerts, got: ${titles.join(" | ")}`);
    assert.ok(alerts[0], "alerts emitted");
    assert.equal(alerts.filter((x) => x.kind === "low_balance").length, 1, "low balance triggered");

    await evaluateAlerts(u.id);
    const after = await db.select().from(s.alerts).where(eq(s.alerts.userId, u.id));
    assert.equal(after.length, alerts.length, "re-evaluation dedupes within 24h");
  });

  await t.test("evaluateAlerts: category_overspend fires at cap", async () => {
    const { evaluateAlerts } = await import("@/lib/finance/alerts");
    const u = await mkUser("overspend@test.local");
    const a = await mkAcct(u.id, { name: "Spend Checking" });
    await mkTx(u.id, a.id, { amount: "-25", name: "CAFE", aiCategory: "Coffee & Cafes" });
    await db.insert(s.budgets).values({ userId: u.id, category: "Coffee & Cafes", monthlyAmount: "20" });
    await db.insert(s.alertRules).values({ userId: u.id, kind: "category_overspend", category: "Coffee & Cafes", enabled: true });
    await evaluateAlerts(u.id);
    const alerts = await db.select().from(s.alerts).where(and(eq(s.alerts.userId, u.id), eq(s.alerts.kind, "category_overspend")));
    assert.equal(alerts.length, 1, "overspend alert emitted");
    assert.match(alerts[0].title, /Coffee & Cafes/);
  });

  await t.test("snapshotNetWorthForUser: effective-group split + daily upsert", async () => {
    const { snapshotNetWorthForUser } = await import("@/lib/finance/netWorthSnapshot");
    const u = await mkUser("snapshot@test.local");
    await mkAcct(u.id, { name: "Chk", type: "depository", accountGroup: "cash", currentBalance: "1000" });
    await mkAcct(u.id, { name: "Card", type: "credit", accountGroup: "credit", currentBalance: "-300" });
    await mkAcct(u.id, { name: "Regrouped", type: "depository", accountGroup: "cash", userAccountGroup: "credit", currentBalance: "-100" });

    await snapshotNetWorthForUser(u.id);
    await snapshotNetWorthForUser(u.id); // same day → update, not duplicate
    const snaps = await db.select().from(s.netWorthSnapshots).where(eq(s.netWorthSnapshots.userId, u.id));
    assert.equal(snaps.length, 1, "one snapshot per day");
    assert.equal(Number(snaps[0].assets), 1000, "regrouped card not netted against assets");
    assert.equal(Number(snaps[0].liabilities), 400, "regrouped card counted as liability");
    assert.equal(Number(snaps[0].netWorth), 600);
    const byGroup = snaps[0].byGroup as Record<string, number>;
    assert.equal(byGroup.credit, -400);
    assert.equal(byGroup.cash, 1000);
  });

  await t.test("authenticateMcpToken: valid, revoked, garbage", async () => {
    const { authenticateMcpToken } = await import("@/lib/mcp/server");
    const { generateToken } = await import("@/lib/crypto");
    const u = await mkUser("mcptoken@test.local");
    const good = generateToken();
    const revoked = generateToken();
    await db.insert(s.mcpTokens).values([
      { userId: u.id, label: "good", tokenHash: good.hash, tokenPrefix: good.prefix },
      { userId: u.id, label: "revoked", tokenHash: revoked.hash, tokenPrefix: revoked.prefix, revokedAt: new Date() },
    ]);
    const ctx = await authenticateMcpToken(`Bearer ${good.token}`);
    assert.equal(ctx?.userId, u.id, "valid token authenticates");
    assert.equal(await authenticateMcpToken(`Bearer ${revoked.token}`), null, "revoked token rejected");
    assert.equal(await authenticateMcpToken("Bearer oc_garbage"), null);
    assert.equal(await authenticateMcpToken(null), null);
    assert.equal(await authenticateMcpToken(good.token), null, "missing Bearer prefix rejected");
  });

  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});
