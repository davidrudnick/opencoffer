/**
 * AI insights generator.
 *
 * Builds a compact digest of the user's last 30/90/365 days (totals, top
 * categories, recurring merchants, budget status, biggest transactions) and
 * asks the user's analysis LLM to produce 3-5 actionable observations.
 *
 * Results land in ai_insights and surface on the dashboard + via the
 * get_insights chat tool.
 *
 * Idempotent-ish: we wipe insights generated in the last 6 hours before
 * writing new ones, so the dashboard always shows fresh suggestions but we
 * don't keep stale duplicates.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  aiInsights,
  budgets,
  financialAccounts,
  llmCredentials,
  netWorthSnapshots,
  transactions,
} from "@/lib/db/schema";
import { findTool } from "@/lib/finance/tools";
import { getModel } from "@/lib/llm/providers";
import { streamText } from "ai";

const INSIGHT_KINDS = ["savings", "spending", "recurring", "anomaly", "budget", "general"] as const;
const INSIGHT_SEVERITIES = ["info", "warn", "suggest", "praise"] as const;
const CHART_REFS = [
  {
    key: "net-worth",
    title: "Net worth",
    toolName: "chart_net_worth_history",
    args: { days: 180 },
  },
  {
    key: "cash-flow",
    title: "Cash flow",
    toolName: "chart_cash_flow",
    args: { days: 180, groupBy: "month" },
  },
  {
    key: "spending-mix",
    title: "Spending mix",
    toolName: "chart_category_breakdown",
    args: { days: 60, kind: "consumption" },
  },
  {
    key: "consumption-vs-savings",
    title: "Consumption vs savings",
    toolName: "chart_consumption_vs_savings",
    args: { days: 180, groupBy: "month" },
  },
  {
    key: "savings-pie",
    title: "Savings destinations",
    toolName: "chart_savings_destinations",
    args: { days: 180 },
  },
  {
    key: "balances",
    title: "Balances by group",
    toolName: "chart_balances_by_group",
    args: {},
  },
] as const;

type RawInsight = {
  kind: (typeof INSIGHT_KINDS)[number];
  severity: (typeof INSIGHT_SEVERITIES)[number];
  title: string;
  body: string;
  chartRef?: {
    key: (typeof CHART_REFS)[number]["key"];
    title: string;
    toolName: string;
    args: Record<string, unknown>;
    callout: string;
  };
};

export async function generateInsights(userId: string) {
  const creds = await db.select().from(llmCredentials).where(eq(llmCredentials.userId, userId));
  const cred =
    creds.find((c) => c.useForAnalysis) ?? creds.find((c) => c.isDefault) ?? creds[0];
  if (!cred) return { ok: false, reason: "no LLM credential" };

  const digest = await buildDigest(userId);
  const model = await getModel(cred);

  const prompt = `You are a careful personal-finance analyst. Given the JSON digest below, write 3-5 concise observations about the user's recent finances. Be specific (cite numbers, categories, merchants, and dates). Be useful (suggest a next step), not preachy. Never invent data.

Return ONLY a JSON array. Each item:
  {
    "kind": "savings" | "spending" | "recurring" | "anomaly" | "budget" | "general",
    "severity": "info" | "warn" | "suggest" | "praise",
    "title": short headline (<= 70 chars),
    "body": one-paragraph explanation (<= 280 chars). Include numbers,
    "chartRef": optional object from digest.chartViews when the observation belongs on a chart:
      {
        "key": exact chartViews key,
        "title": exact chartViews title,
        "toolName": exact chartViews toolName,
        "args": exact chartViews args,
        "callout": short chart-specific sentence (<= 160 chars)
      }
  }

Do not create new chart tools or chart args. If you include chartRef, copy one from digest.chartViews exactly and write commentary only from deterministic digest values.
If the data is too sparse for a real observation, return [].

DIGEST:
${JSON.stringify(digest, null, 2)}

Respond with JSON only, no markdown.`;

  let raw = "";
  try {
    const r = streamText({ model, prompt });
    for await (const delta of r.textStream) raw += delta;
  } catch (e) {
    console.error("[insights] LLM call failed:", (e as Error).message);
    return { ok: false, reason: "llm failure" };
  }

  const insights = parseInsights(raw);
  if (insights.length === 0) {
    console.warn("[insights] could not parse output, raw:", raw.slice(0, 200));
    return { ok: false, reason: "parse failure", raw: raw.slice(0, 200) };
  }

  // Sweep insights from the last 6h to avoid stale duplicates.
  await db
    .delete(aiInsights)
    .where(
      and(
        eq(aiInsights.userId, userId),
        gte(aiInsights.generatedAt, new Date(Date.now() - 6 * 60 * 60 * 1000)),
      ),
    );
  await db.insert(aiInsights).values(
    insights.map((i) => ({
      userId,
      kind: i.kind,
      severity: i.severity,
      title: i.title,
      body: i.body,
      dataRef: i.chartRef ? { chartRef: i.chartRef } : null,
    })),
  );
  return { ok: true, count: insights.length };
}

async function buildDigest(userId: string) {
  // Use existing tools for consistency.
  const call = async <T>(name: string, args: Record<string, unknown>) =>
    (await findTool(name)!.execute(findTool(name)!.schema.parse(args), { userId })) as T;

  const [
    accounts,
    netWorth,
    cashFlow30,
    cashFlow90,
    topSpend30,
    topSpend90,
    recurring,
    budgetStatus,
    consSav90,
  ] = await Promise.all([
    call<Array<{ name: string; type: string; group: string; currentBalance: number }>>(
      "get_accounts",
      {},
    ),
    call<{ assets: number; liabilities: number; netWorth: number }>("get_net_worth", {}),
    call<Array<{ period: string; inflow: number; outflow: number; net: number }>>(
      "get_cash_flow",
      { days: 30, groupBy: "week" },
    ),
    call<Array<{ period: string; inflow: number; outflow: number; net: number }>>(
      "get_cash_flow",
      { days: 90, groupBy: "month" },
    ),
    call<Array<{ merchant: string; total: number; transactions: number }>>(
      "get_top_merchants",
      { days: 30, direction: "outflow", limit: 10, kind: "consumption" },
    ),
    call<Array<{ merchant: string; total: number; transactions: number }>>(
      "get_top_merchants",
      { days: 90, direction: "outflow", limit: 8, kind: "consumption" },
    ),
    call<Array<{ merchant: string; months: number; typicalAmount: number }>>(
      "get_recurring_merchants",
      { days: 365 },
    ),
    call<Array<{ category: string; budget: number; spent: number; pct: number | null; status: string }>>(
      "check_budget_status",
      {},
    ),
    call<Array<{ period: string; consumption: number; savings: number; income: number; savingsRate: number | null }>>(
      "get_consumption_vs_savings",
      { days: 90, groupBy: "month" },
    ),
  ]);

  // Net-worth trend points
  const nwRows = await db
    .select({
      date: sql<string>`to_char(${netWorthSnapshots.snapshotDate}, 'YYYY-MM-DD')`,
      net: netWorthSnapshots.netWorth,
    })
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(desc(netWorthSnapshots.snapshotDate))
    .limit(60);

  return {
    accounts: accounts.map((a) => ({ name: a.name, group: a.group, balance: a.currentBalance })),
    netWorth,
    consVsSav90: consSav90,
    cashFlow_last30d: cashFlow30,
    cashFlow_last90d: cashFlow90,
    topSpend_last30d: topSpend30,
    topSpend_last90d: topSpend90,
    recurringMerchants: recurring.slice(0, 12),
    budgetStatus,
    chartViews: CHART_REFS,
    netWorthTrend_last60d: nwRows.map((r) => ({ date: r.date, net: Number(r.net) })),
  };
}

function parseInsights(raw: string): RawInsight[] {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(s.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    const out: RawInsight[] = [];
    for (const v of arr) {
      if (!v || typeof v !== "object") continue;
      const kind = String(v.kind ?? "");
      const severity = String(v.severity ?? "info");
      if (!INSIGHT_KINDS.includes(kind as never)) continue;
      const sev = INSIGHT_SEVERITIES.includes(severity as never) ? severity : "info";
      const title = String(v.title ?? "").slice(0, 120);
      const body = String(v.body ?? "").slice(0, 600);
      if (!title || !body) continue;
      const chartRef = parseChartRef(v.chartRef);
      out.push({
        kind: kind as RawInsight["kind"],
        severity: sev as RawInsight["severity"],
        title,
        body,
        ...(chartRef ? { chartRef } : {}),
      });
    }
    return out.slice(0, 5);
  } catch {
    return [];
  }
}

function parseChartRef(value: unknown): RawInsight["chartRef"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as {
    key?: unknown;
    title?: unknown;
    toolName?: unknown;
    args?: unknown;
    callout?: unknown;
  };
  const ref = CHART_REFS.find((item) => item.key === v.key);
  if (!ref) return undefined;
  const callout = String(v.callout ?? "").slice(0, 180);
  if (!callout) return undefined;
  return {
    key: ref.key,
    title: ref.title,
    toolName: ref.toolName,
    args: { ...ref.args },
    callout,
  };
}

// Used by /lib/finance/tools.ts (read tool); avoid circular deps by importing
// directly from schema in callers.
void financialAccounts;
void transactions;
void budgets;
