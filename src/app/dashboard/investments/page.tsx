import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { holdings, securities, financialAccounts } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { AppBar } from "@/components/AppBar";
import { HoldingsClient } from "./HoldingsClient";
import { householdUserIds } from "@/lib/household";

export default async function InvestmentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ids = await householdUserIds(session.user.id);

  const rows = await db
    .select({
      ticker: securities.tickerSymbol,
      secName: securities.name,
      secType: securities.type,
      quantity: holdings.quantity,
      costBasis: holdings.costBasis,
      price: holdings.institutionPrice,
      value: holdings.institutionValue,
      account: financialAccounts.name,
      accountId: financialAccounts.id,
      systemGroup: financialAccounts.accountGroup,
      userOverride: financialAccounts.userAccountGroup,
      currency: financialAccounts.isoCurrencyCode,
    })
    .from(holdings)
    .leftJoin(securities, eq(securities.id, holdings.securityId))
    .leftJoin(financialAccounts, eq(financialAccounts.id, holdings.accountId))
    .where(inArray(holdings.userId, ids));

  const investmentAccts = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      type: financialAccounts.type,
      systemGroup: financialAccounts.accountGroup,
      userOverride: financialAccounts.userAccountGroup,
      currentBalance: financialAccounts.currentBalance,
      currency: financialAccounts.isoCurrencyCode,
    })
    .from(financialAccounts)
    .where(
      sql`${financialAccounts.userId} in ${ids} and ${financialAccounts.type} = 'investment'`,
    );

  const positions = rows.map((r) => {
    const qty = Number(r.quantity ?? 0);
    const value = Number(r.value ?? 0);
    const stored = Number(r.costBasis ?? 0);
    // SimpleFIN sometimes stores cost basis per-share, sometimes total.
    // If stored is small relative to value-per-share, treat as per-share.
    const perShare = qty > 0 ? value / qty : 0;
    const totalCost =
      stored > 0 && stored < perShare * 0.4 ? stored * qty : stored;
    const gain = totalCost > 0 ? value - totalCost : null;
    const gainPct = totalCost > 0 ? ((value - totalCost) / totalCost) * 100 : null;
    return {
      ticker: r.ticker ?? "—",
      name: r.secName ?? "(no name)",
      account: r.account ?? "—",
      accountId: r.accountId,
      accountGroup: r.userOverride ?? r.systemGroup ?? "other",
      quantity: qty,
      price: Number(r.price ?? 0),
      value,
      cost: totalCost,
      gain,
      gainPct,
      currency: r.currency ?? "USD",
    };
  });

  // Aggregate per-ticker across accounts (combined view).
  type Agg = {
    ticker: string;
    name: string;
    quantity: number;
    value: number;
    cost: number;
    accounts: Array<{ name: string; quantity: number; value: number }>;
  };
  const tickers = new Map<string, Agg>();
  for (const p of positions) {
    const k = p.ticker !== "—" ? p.ticker : p.name;
    const cur =
      tickers.get(k) ??
      ({ ticker: p.ticker, name: p.name, quantity: 0, value: 0, cost: 0, accounts: [] } as Agg);
    cur.quantity += p.quantity;
    cur.value += p.value;
    cur.cost += p.cost;
    cur.accounts.push({ name: p.account, quantity: p.quantity, value: p.value });
    tickers.set(k, cur);
  }
  const byTicker = [...tickers.values()].sort((a, b) => b.value - a.value);

  // Per-account positions (default view): one section per investment account.
  type AccountPosition = {
    ticker: string;
    name: string;
    quantity: number;
    value: number;
    cost: number;
    gain: number | null;
    gainPct: number | null;
  };
  type AccountSection = {
    accountId: string;
    accountName: string;
    group: string;
    balance: number;
    positionsValue: number;
    positionsCost: number;
    positions: AccountPosition[];
  };
  const byAccount: AccountSection[] = investmentAccts.map((a) => {
    const own = positions.filter((p) => p.accountId === a.id);
    const sorted = own
      .map((p) => ({
        ticker: p.ticker,
        name: p.name,
        quantity: p.quantity,
        value: p.value,
        cost: p.cost,
        gain: p.gain,
        gainPct: p.gainPct,
      }))
      .sort((x, y) => y.value - x.value);
    return {
      accountId: a.id,
      accountName: a.name,
      group: a.userOverride ?? a.systemGroup,
      balance: Number(a.currentBalance ?? 0),
      positionsValue: sorted.reduce((s, p) => s + p.value, 0),
      positionsCost: sorted.reduce((s, p) => s + p.cost, 0),
      positions: sorted,
    };
  }).sort((a, b) => b.balance - a.balance);

  const byGroup = new Map<string, number>();
  for (const a of investmentAccts) {
    const g = a.userOverride ?? a.systemGroup;
    byGroup.set(g, (byGroup.get(g) ?? 0) + Number(a.currentBalance ?? 0));
  }
  const groupTotals = [...byGroup.entries()].map(([g, v]) => ({ group: g, value: v }));

  const marketValue = investmentAccts.reduce(
    (s, a) => s + Number(a.currentBalance ?? 0),
    0,
  );
  const totalCost = byTicker.reduce((s, t) => s + t.cost, 0);
  const totalPositionsValue = byTicker.reduce((s, t) => s + t.value, 0);
  const unrealized = totalCost > 0 ? totalPositionsValue - totalCost : null;
  const unrealizedPct =
    totalCost > 0 ? ((totalPositionsValue - totalCost) / totalCost) * 100 : null;

  return (
    <>
      <AppBar
        title="Holdings"
        subtitle={`${investmentAccts.length} investment accounts · ${byTicker.length} unique positions`}
      />
      <div className="space-y-6 p-4 pb-24 md:p-8 md:pb-8">
        <HoldingsClient
          totals={{
            marketValue,
            costBasis: totalCost,
            positionsValue: totalPositionsValue,
            unrealized,
            unrealizedPct,
          }}
          byTicker={byTicker}
          byAccount={byAccount}
          byGroup={groupTotals}
          accounts={investmentAccts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            accountGroup: a.userOverride ?? a.systemGroup,
            systemGroup: a.systemGroup,
            userOverride: a.userOverride,
            currentBalance: Number(a.currentBalance ?? 0),
            currency: a.currency,
          }))}
        />
      </div>
    </>
  );
}
