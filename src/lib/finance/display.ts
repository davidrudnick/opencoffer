export const UNCATEGORIZED = "Uncategorized";
export const TRANSFER_CATEGORY = "Transfer";
export const SAVINGS_CATEGORIES = ["Retirement Contributions", "Investments"] as const;
export const INCOME_CATEGORIES = [
  "Income — Salary",
  "Income — Dividend",
  "Income — Refund",
  "Income — Other",
] as const;

export type SpendingKind = "consumption" | "savings" | "all";
export type OutflowKind = "consumption" | "savings" | "income" | "transfer";
export type ChartFreshness = {
  lastSyncedAt: string | null;
  categoryStatus: {
    total: number;
    classified: number;
    manualOverrides: number;
    remaining: number;
  };
  dateWindow?: string;
  exclusions?: string[];
};
export type ChartSpec =
  | {
      type: "bar" | "line" | "area";
      title: string;
      subtitle?: string;
      description?: string;
      footnote?: string;
      freshness?: ChartFreshness;
      seriesLabels?: Record<string, string>;
      emptyReason?: string;
      data: Array<Record<string, unknown>>;
      xKey: string;
      yKey: string;
      yKey2?: string;
      format?: "currency" | "number";
    }
  | {
      type: "pie";
      title: string;
      subtitle?: string;
      description?: string;
      footnote?: string;
      freshness?: ChartFreshness;
      seriesLabels?: Record<string, string>;
      emptyReason?: string;
      collapseSmallSlices?: boolean;
      data: Array<{ name: string; value: number }>;
      format?: "currency" | "number";
    };

export const FINANCE_CHART_COLORS = {
  net: "hsl(243 75% 59%)",
  assets: "hsl(160 84% 39%)",
  income: "hsl(160 84% 39%)",
  savings: "hsl(151 78% 45%)",
  debt: "hsl(0 84% 60%)",
  outflow: "hsl(0 84% 60%)",
  grid: "hsl(0 0% 100% / 0.08)",
  tick: "hsl(0 0% 62%)",
  neutral: "hsl(0 0% 45%)",
};

export const FINANCE_PIE_COLORS = [
  "hsl(243 75% 59%)",
  "hsl(160 84% 39%)",
  "hsl(0 84% 60%)",
  "hsl(265 62% 70%)",
  "hsl(195 78% 52%)",
  "hsl(151 78% 45%)",
  "hsl(0 0% 45%)",
];

export function normalizeCategoryName(category: string | null | undefined): string {
  const value = category?.trim();
  return value ? value : UNCATEGORIZED;
}

export function effectiveCategoryFromParts(parts: {
  overrideCategory?: string | null;
  aiCategory?: string | null;
  rawCategory?: string | null;
}): string {
  return normalizeCategoryName(parts.overrideCategory ?? parts.aiCategory ?? parts.rawCategory);
}

function normalizedIncomeCategory(category: string): string {
  return category.replace(" - ", " — ");
}

export function classifyOutflowKind({
  category,
  isTransfer,
}: {
  category: string | null | undefined;
  isTransfer: boolean;
}): OutflowKind {
  const normalized = normalizeCategoryName(category);
  if (isTransfer || normalized === TRANSFER_CATEGORY) return "transfer";
  if ((SAVINGS_CATEGORIES as readonly string[]).includes(normalized)) return "savings";
  if ((INCOME_CATEGORIES as readonly string[]).includes(normalizedIncomeCategory(normalized))) return "income";
  return "consumption";
}

export function labelForSpendingKind(kind: SpendingKind): string {
  if (kind === "savings") return "Savings";
  if (kind === "all") return "Outflow";
  return "Spending";
}

export function exclusionsForSpendingKind(kind: SpendingKind): string[] {
  if (kind === "savings") return ["transfers", "income", "living expenses"];
  if (kind === "all") return ["income"];
  return ["transfers", "income", "retirement contributions", "investment outflows"];
}

export function describeExclusions(kind: SpendingKind): string {
  const exclusions = exclusionsForSpendingKind(kind);
  if (exclusions.length === 1) return `Excludes ${exclusions[0]}.`;
  const last = exclusions[exclusions.length - 1];
  return `Excludes ${exclusions.slice(0, -1).join(", ")}, and ${last}.`;
}

export function dateWindowLabel(days: number): string {
  if (days >= 365 && days % 365 === 0) return `Last ${days / 365} year${days === 365 ? "" : "s"}`;
  if (days >= 30 && days % 30 === 0) return `Last ${days / 30} month${days === 30 ? "" : "s"}`;
  return `Last ${days} days`;
}

export function collapseSmallSlices(
  data: Array<{ name: string; value: number }>,
  opts: { maxSlices?: number; minPercent?: number } = {},
): Array<{ name: string; value: number }> {
  const maxSlices = opts.maxSlices ?? 6;
  const minPercent = opts.minPercent ?? 0.035;
  const rows = data
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0 || rows.length <= maxSlices) return rows;

  const keep: Array<{ name: string; value: number }> = [];
  let other = 0;
  for (const row of rows) {
    const roomForOther = keep.length < maxSlices;
    const largeEnough = row.value / total >= minPercent;
    if (roomForOther && largeEnough) {
      keep.push(row);
    } else {
      other += row.value;
    }
  }
  if (other > 0) keep.push({ name: "Other", value: Math.round(other * 100) / 100 });
  return keep;
}

export function accountGroupLabel(group: string | null | undefined): string {
  switch (group) {
    case "cash":
      return "Cash";
    case "credit":
      return "Credit";
    case "retirement":
      return "Retirement";
    case "brokerage":
      return "Brokerage";
    case "hsa":
      return "HSA";
    case "loan":
      return "Loans";
    default:
      return "Other";
  }
}

export function buildSavingsDestinationSlices({
  income,
  consumption,
  savingsOutflows,
}: {
  income: number;
  consumption: number;
  savingsOutflows: Array<{
    accountGroup: string | null;
    userAccountGroup: string | null;
    value: number;
  }>;
}): Array<{ name: string; value: number }> {
  const byDestination = new Map<string, number>();
  const outflowTotal = savingsOutflows.reduce((sum, row) => sum + row.value, 0);
  const cashRetained = Math.round(Math.max(0, income - consumption - outflowTotal) * 100) / 100;
  if (cashRetained > 0) byDestination.set("Cash retained", cashRetained);

  for (const row of savingsOutflows) {
    if (!Number.isFinite(row.value) || row.value <= 0) continue;
    const label = accountGroupLabel(row.userAccountGroup ?? row.accountGroup);
    byDestination.set(label, Math.round(((byDestination.get(label) ?? 0) + row.value) * 100) / 100);
  }

  return [...byDestination.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
