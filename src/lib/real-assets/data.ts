import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { realAssets, realAssetValues, type RealAsset, type RealAssetValue } from "@/lib/db/schema";
import { householdUserIds } from "@/lib/household";
import { selectCurrentAssetValue, type SelectedRealAssetValue } from "./valuation";

export type RealAssetMetadata = Record<string, unknown>;

export type RealAssetWithValues = RealAsset & {
  values: RealAssetValue[];
  currentValue: SelectedRealAssetValue | null;
};

export type AssetValueInput = {
  value: number;
  source: string;
  sourceKind: string;
  asOf?: Date;
  confidence?: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  notes?: string | null;
  raw?: unknown;
};

function valueForSelection(value: RealAssetValue) {
  return {
    id: value.id,
    assetId: value.assetId,
    value: value.value ?? "0",
    isoCurrencyCode: value.isoCurrencyCode,
    source: value.source,
    sourceKind: value.sourceKind,
    asOf: value.asOf,
    createdAt: value.createdAt,
    confidence: value.confidence,
    rangeLow: value.rangeLow,
    rangeHigh: value.rangeHigh,
    notes: value.notes,
    raw: value.raw,
  };
}

export function currentValueForAsset(asset: RealAsset, values: RealAssetValue[]): SelectedRealAssetValue | null {
  return selectCurrentAssetValue(
    {
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      status: asset.status,
      valuationMode: asset.valuationMode,
      isoCurrencyCode: asset.isoCurrencyCode,
    },
    values.map(valueForSelection),
  );
}

export async function listRealAssetsForUser(userId: string): Promise<RealAssetWithValues[]> {
  const ids = await householdUserIds(userId);
  const assets = await db
    .select()
    .from(realAssets)
    .where(inArray(realAssets.userId, ids))
    .orderBy(asc(realAssets.kind), asc(realAssets.name));
  if (assets.length === 0) return [];

  const values = await db
    .select()
    .from(realAssetValues)
    .where(inArray(realAssetValues.assetId, assets.map((asset) => asset.id)))
    .orderBy(desc(realAssetValues.asOf), desc(realAssetValues.createdAt));
  const byAsset = new Map<string, RealAssetValue[]>();
  for (const value of values) {
    const bucket = byAsset.get(value.assetId) ?? [];
    bucket.push(value);
    byAsset.set(value.assetId, bucket);
  }

  return assets.map((asset) => {
    const assetValues = byAsset.get(asset.id) ?? [];
    return {
      ...asset,
      values: assetValues,
      currentValue: currentValueForAsset(asset, assetValues),
    };
  });
}

export async function getOwnedRealAsset(assetId: string, userId: string): Promise<RealAssetWithValues | null> {
  const [asset] = await db
    .select()
    .from(realAssets)
    .where(and(eq(realAssets.id, assetId), eq(realAssets.userId, userId)))
    .limit(1);
  if (!asset) return null;
  const values = await db
    .select()
    .from(realAssetValues)
    .where(eq(realAssetValues.assetId, asset.id))
    .orderBy(desc(realAssetValues.asOf), desc(realAssetValues.createdAt));
  return {
    ...asset,
    values,
    currentValue: currentValueForAsset(asset, values),
  };
}

export async function insertRealAssetValue(asset: RealAsset, input: AssetValueInput) {
  const [row] = await db
    .insert(realAssetValues)
    .values({
      assetId: asset.id,
      userId: asset.userId,
      value: String(input.value),
      isoCurrencyCode: asset.isoCurrencyCode ?? "USD",
      source: input.source,
      sourceKind: input.sourceKind,
      asOf: input.asOf ?? new Date(),
      confidence: input.confidence == null ? null : String(input.confidence),
      rangeLow: input.rangeLow == null ? null : String(input.rangeLow),
      rangeHigh: input.rangeHigh == null ? null : String(input.rangeHigh),
      notes: input.notes ?? null,
      raw: input.raw ?? null,
    })
    .returning();
  return row;
}

export async function mergeRealAssetMetadata(asset: RealAsset, metadata: RealAssetMetadata) {
  const current = (asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {}) as RealAssetMetadata;
  const [row] = await db
    .update(realAssets)
    .set({
      metadata: { ...current, ...metadata },
      updatedAt: new Date(),
    })
    .where(eq(realAssets.id, asset.id))
    .returning();
  return row;
}
