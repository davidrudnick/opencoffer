import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { financialAccounts, holdings, securities, transactions } from "@/lib/db/schema";
import { AppBar } from "@/components/AppBar";
import { ChatChart } from "@/components/ChatChart";
import { formatCurrency } from "@/lib/utils";
import { householdUserIds } from "@/lib/household";
import { heldForMemberWhere, listFamilyMembers } from "@/lib/finance/accountScope";
import { findTool, outflowKindSQL } from "@/lib/finance/tools";
import type { ChartSpec } from "@/lib/finance/display";

export const dynamic = "force-dynamic";

type MemberSection = {
  id: string;
  name: string;
  total: number;
  contributions1y: number;
  byGroup: Array<{ group: string; value: number }>;
  accounts: Array<{ id: string; name: string; group: string; balance: number; currency: string | null }>;
  positions: Array<{
    ticker: string;
    name: string;
    quantity: number;
    value: number;
    cost: number;
    gain: number | null;
    gainPct: number | null;
  }>;
  chart: ChartSpec | null;
};

export default async function FamilyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const ids = await householdUserIds(userId);
  const members = await listFamilyMembers(ids);

  const yearAgo = new Date();
  yearAgo.setDate(yearAgo.getDate() - 365);
  yearAgo.setHours(0, 0, 0, 0);

  const chartTool = findTool("chart_net_worth_history")!;
  const kind = outflowKindSQL();

  const sections: MemberSection[] = [];
  for (const m of members) {
    const accts = await db
      .select()
      .from(financialAccounts)
      .where(and(inArray(financialAccounts.userId, ids), eq(financialAccounts.heldForId, m.id)));

    const rows = await db
      .select({
        ticker: securities.tickerSymbol,
        secName: securities.name,
        quantity: holdings.quantity,
        costBasis: holdings.costBasis,
        value: holdings.institutionValue,
      })
      .from(holdings)
      .leftJoin(securities, eq(securities.id, holdings.securityId))
      .where(and(inArray(holdings.userId, ids), heldForMemberWhere(holdings.accountId, m.id)));

    const [giftRow] = await db
      .select({
        gifts: sql<string>`coalesce(sum(case when ${transactions.amount} > 0 and ${kind} <> 'income' then ${transactions.amount} else 0 end), 0)::text`,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, ids),
          gte(transactions.date, yearAgo),
          eq(transactions.pending, false),
          heldForMemberWhere(transactions.accountId, m.id),
        ),
      );

    // Same cost-basis heuristic as the Holdings page: SimpleFIN sometimes
    // stores cost basis per-share, sometimes total.
    type Agg = { ticker: string; name: string; quantity: number; value: number; cost: number };
    const byTicker = new Map<string, Agg>();
    for (const r of rows) {
      const qty = Number(r.quantity ?? 0);
      const value = Number(r.value ?? 0);
      const stored = Number(r.costBasis ?? 0);
      const perShare = qty > 0 ? value / qty : 0;
      const cost = stored > 0 && stored < perShare * 0.4 ? stored * qty : stored;
      const k = r.ticker ?? r.secName ?? "—";
      const cur = byTicker.get(k) ?? { ticker: r.ticker ?? "—", name: r.secName ?? "(no name)", quantity: 0, value: 0, cost: 0 };
      cur.quantity += qty;
      cur.value += value;
      cur.cost += cost;
      byTicker.set(k, cur);
    }
    const positions = [...byTicker.values()]
      .sort((a, b) => b.value - a.value)
      .map((p) => ({
        ...p,
        gain: p.cost > 0 ? p.value - p.cost : null,
        gainPct: p.cost > 0 ? ((p.value - p.cost) / p.cost) * 100 : null,
      }));

    const byGroupMap = new Map<string, number>();
    for (const a of accts) {
      const g = a.userAccountGroup ?? a.accountGroup;
      byGroupMap.set(g, (byGroupMap.get(g) ?? 0) + Number(a.currentBalance ?? 0));
    }

    const chartResult = (await chartTool.execute(
      chartTool.schema.parse({ days: 365, familyMember: m.name }),
      { userId },
    )) as { _chart?: ChartSpec };

    sections.push({
      id: m.id,
      name: m.name,
      total: accts.reduce((s, a) => s + Number(a.currentBalance ?? 0), 0),
      contributions1y: Number(giftRow?.gifts ?? 0),
      byGroup: [...byGroupMap.entries()].map(([group, value]) => ({ group, value })),
      accounts: accts
        .map((a) => ({
          id: a.id,
          name: a.name,
          group: a.userAccountGroup ?? a.accountGroup,
          balance: Number(a.currentBalance ?? 0),
          currency: a.isoCurrencyCode,
        }))
        .sort((a, b) => b.balance - a.balance),
      positions,
      chart: chartResult._chart ?? null,
    });
  }

  return (
    <>
      <AppBar
        title="Family"
        subtitle="Accounts held for family members — excluded from your own net worth"
      />
      <div className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-8 md:pb-8">
        {sections.length === 0 && <EmptyState />}
        {sections.map((s, i) => (
          <section key={s.id} className={`card-elevated mfade mfade-${Math.min(i + 1, 4)} space-y-5`}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="overline">Held for</div>
                <h2 className="coffer-serif mt-1 text-3xl">{s.name}</h2>
              </div>
              <div className="flex flex-wrap gap-6">
                <div>
                  <div className="body-s text-on-surface-variant">Total value</div>
                  <div className="figure text-[32px] text-on-surface">{formatCurrency(s.total)}</div>
                </div>
                <div>
                  <div className="body-s text-on-surface-variant">Gifted · 12 mo</div>
                  <div className="figure text-[32px] text-success">{formatCurrency(s.contributions1y)}</div>
                </div>
              </div>
            </div>

            {s.byGroup.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {s.byGroup.map((g) => (
                  <span
                    key={g.group}
                    className="rounded-full bg-secondary-container px-3 py-1 text-sm capitalize text-on-secondary-container"
                  >
                    {g.group} · {formatCurrency(g.value)}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 lg:col-span-5">
                <div className="overline mb-2">Accounts</div>
                <ul className="divide-y divide-outline-variant rounded-2xl border border-outline-variant">
                  {s.accounts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="body-m truncate text-on-surface">{a.name}</div>
                        <div className="body-s capitalize text-on-surface-variant">{a.group}</div>
                      </div>
                      <div className="title-s font-mono tabular-nums text-on-surface">
                        {formatCurrency(a.balance, a.currency ?? "USD")}
                      </div>
                    </li>
                  ))}
                  {s.accounts.length === 0 && (
                    <li className="body-m px-4 py-6 text-center text-on-surface-variant">
                      No accounts tagged yet.
                    </li>
                  )}
                </ul>

                {s.positions.length > 0 && (
                  <>
                    <div className="overline mb-2 mt-5">Positions</div>
                    <div className="overflow-x-auto rounded-2xl border border-outline-variant">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                            <th className="px-4 py-2 font-normal">Ticker</th>
                            <th className="px-4 py-2 text-right font-normal">Qty</th>
                            <th className="px-4 py-2 text-right font-normal">Value</th>
                            <th className="px-4 py-2 text-right font-normal">Gain</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.positions.map((p) => (
                            <tr key={p.ticker + p.name} className="border-b border-outline-variant last:border-0">
                              <td className="px-4 py-2">
                                <div className="text-on-surface">{p.ticker}</div>
                                <div className="body-s max-w-[16rem] truncate text-on-surface-variant">{p.name}</div>
                              </td>
                              <td className="px-4 py-2 text-right font-mono tabular-nums">
                                {p.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </td>
                              <td className="px-4 py-2 text-right font-mono tabular-nums">{formatCurrency(p.value)}</td>
                              <td
                                className={`px-4 py-2 text-right font-mono tabular-nums ${
                                  p.gain == null ? "text-on-surface-variant" : p.gain >= 0 ? "text-success" : "text-error"
                                }`}
                              >
                                {p.gain == null
                                  ? "—"
                                  : `${p.gain >= 0 ? "+" : ""}${formatCurrency(p.gain)}${
                                      p.gainPct == null ? "" : ` (${p.gainPct.toFixed(1)}%)`
                                    }`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="col-span-12 lg:col-span-7">
                <div className="overline mb-2">Value over time — 12 mo</div>
                {s.chart && s.chart.data.length > 0 ? (
                  <div className="rounded-2xl border border-outline-variant p-4">
                    <ChatChart spec={s.chart} bare height={300} />
                  </div>
                ) : (
                  <div className="body-m rounded-2xl border border-outline-variant p-6 text-center text-on-surface-variant">
                    No history yet — snapshots start accumulating now, and tagging an account rebuilds
                    the last year from transaction history.
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="card-elevated mfade mfade-1 p-8 text-center md:p-12">
      <h2 className="coffer-serif text-3xl">No family members yet</h2>
      <p className="body-l mx-auto mt-4 max-w-xl text-on-surface-variant">
        Add a family member and tag the accounts you hold for them — a 529 or UTMA, for example.
        Their balances leave your net worth, contributions count as gifts, and their investments
        get their own allocation and history view here.
      </p>
      <div className="mt-8">
        <Link href="/settings/accounts" className="btn btn-filled">
          Set up in Accounts settings
        </Link>
      </div>
    </div>
  );
}
