export type RealAssetKind = "home" | "vehicle" | "land" | "other";
export type RealAssetStatus = "active" | "sold" | "archived";
export type RealAssetValuationMode = "manual" | "provider";
export type RealAssetValueSource = "manual" | "rentcast" | "realie" | "auto_dev" | "marketcheck";
export type RealAssetValueSourceKind =
  | "manual_entry"
  | "avm"
  | "comparable_estimate"
  | "direct_vehicle_value";

export type RealAssetForValuation = {
  id: string;
  kind: string;
  name: string;
  status: string;
  valuationMode: string;
  currency?: string | null;
  isoCurrencyCode?: string | null;
};

export type RealAssetValueForValuation = {
  id: string;
  assetId: string;
  value: number | string;
  currency?: string | null;
  isoCurrencyCode?: string | null;
  source: string;
  sourceKind: string;
  asOf: Date | string;
  createdAt?: Date | string | null;
  confidence?: number | string | null;
  rangeLow?: number | string | null;
  rangeHigh?: number | string | null;
  notes?: string | null;
  raw?: unknown;
};

export type SelectedRealAssetValue = RealAssetValueForValuation & {
  value: number;
  currency: string;
};

export type RealAssetSummaryRow<TAsset extends RealAssetForValuation = RealAssetForValuation> = {
  asset: TAsset;
  currentValue: SelectedRealAssetValue | null;
};

const REAL_ASSET_KINDS = ["home", "vehicle", "land", "other"] as const;

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function valueTime(value: RealAssetValueForValuation): number {
  const asOf = value.asOf instanceof Date ? value.asOf : new Date(value.asOf);
  return Number.isNaN(asOf.getTime()) ? 0 : asOf.getTime();
}

function createdTime(value: RealAssetValueForValuation): number {
  if (!value.createdAt) return 0;
  const createdAt = value.createdAt instanceof Date ? value.createdAt : new Date(value.createdAt);
  return Number.isNaN(createdAt.getTime()) ? 0 : createdAt.getTime();
}

function normalizeSelected(
  asset: RealAssetForValuation,
  value: RealAssetValueForValuation | undefined,
): SelectedRealAssetValue | null {
  if (!value) return null;
  return {
    ...value,
    value: toNumber(value.value),
    currency: value.currency ?? value.isoCurrencyCode ?? asset.currency ?? asset.isoCurrencyCode ?? "USD",
  };
}

function sortNewest(values: RealAssetValueForValuation[]): RealAssetValueForValuation[] {
  return [...values].sort((a, b) => valueTime(b) - valueTime(a) || createdTime(b) - createdTime(a));
}

export function selectCurrentAssetValue(
  asset: RealAssetForValuation,
  values: RealAssetValueForValuation[],
): SelectedRealAssetValue | null {
  const assetValues = sortNewest(values.filter((value) => value.assetId === asset.id));
  const manual = assetValues.find((value) => value.source === "manual");
  const provider = assetValues.find((value) => value.source !== "manual");
  const selected = asset.valuationMode === "provider" ? provider ?? manual : manual ?? provider;
  return normalizeSelected(asset, selected);
}

export function selectAssetValueAt(
  asset: RealAssetForValuation,
  values: RealAssetValueForValuation[],
  at: Date,
): SelectedRealAssetValue | null {
  const cutoff = at.getTime();
  return selectCurrentAssetValue(
    asset,
    values.filter((value) => valueTime(value) <= cutoff),
  );
}

export function summarizeRealAssets<TAsset extends RealAssetForValuation>(
  rows: Array<{ asset: TAsset; values: RealAssetValueForValuation[] }>,
): {
  total: number;
  byKind: Record<RealAssetKind, number>;
  assets: Array<RealAssetSummaryRow<TAsset>>;
} {
  const byKind = Object.fromEntries(REAL_ASSET_KINDS.map((kind) => [kind, 0])) as Record<RealAssetKind, number>;
  const assets: Array<RealAssetSummaryRow<TAsset>> = [];
  let total = 0;

  for (const row of rows) {
    if (row.asset.status !== "active") continue;
    const currentValue = selectCurrentAssetValue(row.asset, row.values);
    if (!currentValue) continue;
    const amount = currentValue.value;
    total += amount;
    const kind = REAL_ASSET_KINDS.includes(row.asset.kind as RealAssetKind)
      ? (row.asset.kind as RealAssetKind)
      : "other";
    byKind[kind] += amount;
    assets.push({ asset: row.asset, currentValue });
  }

  return { total, byKind, assets };
}

export function labelForRealAssetKind(kind: string): string {
  if (kind === "home") return "Home";
  if (kind === "vehicle") return "Vehicle";
  if (kind === "land") return "Land";
  return "Other assets";
}
