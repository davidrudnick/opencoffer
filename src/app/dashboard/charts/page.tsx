import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppBar } from "@/components/AppBar";
import { findTool } from "@/lib/finance/tools";
import { db } from "@/lib/db/client";
import { aiInsights } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ChartsClient, type ChartCard } from "./ChartsClient";
import { listSavedCharts } from "./actions";

export const dynamic = "force-dynamic";

async function callTool<T>(name: string, args: Record<string, unknown>, userId: string) {
  const t = findTool(name)!;
  const parsed = t.schema.parse(args);
  return (await t.execute(parsed, { userId })) as T;
}

type ChartResult = { _chart: ChartCard["spec"] };
type InsightChartRef = {
  chartRef?: {
    key?: string;
    toolName?: string;
    args?: unknown;
    callout?: string;
  };
};

export default async function ChartsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Run defaults + saved-charts in parallel. Each tool returns `_chart` (ChartSpec).
  const [
    categoryPie,
    savingsDestinations,
    cashFlow,
    consumptionVsSavings,
    balancesByGroup,
    netWorthTrend,
    saved,
    insightRows,
  ] = await Promise.all([
    callTool<ChartResult>("chart_category_breakdown", { days: 60, kind: "consumption" }, userId),
    callTool<ChartResult>("chart_savings_destinations", { days: 180 }, userId),
    callTool<ChartResult>("chart_cash_flow", { days: 180, groupBy: "month" }, userId),
    callTool<ChartResult>("chart_consumption_vs_savings", { days: 180, groupBy: "month" }, userId),
    callTool<ChartResult>("chart_balances_by_group", {}, userId),
    callTool<ChartResult>("chart_net_worth_history", { days: 180 }, userId),
    listSavedCharts(userId),
    db
      .select({
        body: aiInsights.body,
        dataRef: aiInsights.dataRef,
      })
      .from(aiInsights)
      .where(and(eq(aiInsights.userId, userId), isNull(aiInsights.dismissedAt)))
      .orderBy(desc(aiInsights.generatedAt))
      .limit(12),
  ]);

  const callouts = new Map<string, string>();
  for (const row of insightRows) {
    const ref = row.dataRef as InsightChartRef | null;
    const key = ref?.chartRef?.key;
    if (key && !callouts.has(key)) {
      callouts.set(key, ref.chartRef?.callout ?? row.body);
    }
  }

  const defaultCards: ChartCard[] = [
    { key: "net-worth", title: "Net worth", blurb: "Daily wealth snapshots.", span: "wide", section: "primary", spec: netWorthTrend._chart, callout: callouts.get("net-worth") },
    { key: "cash-flow", title: "Cash flow", blurb: "Income against non-transfer outflow.", span: "half", section: "primary", spec: cashFlow._chart, callout: callouts.get("cash-flow") },
    { key: "spending-mix", title: "Spending mix", blurb: "Consumption categories only.", span: "half", section: "primary", spec: categoryPie._chart, callout: callouts.get("spending-mix") },
    { key: "consumption-vs-savings", title: "Consumption vs savings", blurb: "Living costs against wealth-building outflows.", span: "half", section: "secondary", spec: consumptionVsSavings._chart, callout: callouts.get("consumption-vs-savings") },
    { key: "savings-pie", title: "Savings destinations", blurb: "Cash retained plus investment destinations.", span: "half", section: "secondary", spec: savingsDestinations._chart, callout: callouts.get("savings-pie") },
    { key: "balances", title: "Balances by group", blurb: "Cash, retirement, brokerage, credit, and loans.", span: "half", section: "secondary", spec: balancesByGroup._chart, callout: callouts.get("balances") },
  ];

  // Re-run each saved chart with current data. If a tool errors (renamed, etc.)
  // we still surface the card with an error placeholder so the user can delete it.
  const savedCards: ChartCard[] = await Promise.all(
    saved.map(async (s) => {
      try {
        const r = (await callTool<ChartResult>(s.toolName, s.args as Record<string, unknown>, userId));
        return {
          key: `saved-${s.id}`,
          id: s.id,
          title: s.title,
          blurb: s.prompt,
          span: "half" as const,
          spec: r._chart,
          savedAt: s.createdAt.toISOString(),
        };
      } catch (e) {
        return {
          key: `saved-${s.id}`,
          id: s.id,
          title: s.title,
          blurb: s.prompt,
          span: "half" as const,
          spec: { type: "bar", title: s.title, data: [], xKey: "x", yKey: "y" } as ChartCard["spec"],
          savedAt: s.createdAt.toISOString(),
          error: (e as Error).message,
        };
      }
    }),
  );

  return (
    <>
      <AppBar
        title="Charts"
        subtitle="Auto-populated views. Ask in chat to dig deeper."
      />
      <ChartsClient defaultCards={defaultCards} savedCards={savedCards} />
    </>
  );
}
