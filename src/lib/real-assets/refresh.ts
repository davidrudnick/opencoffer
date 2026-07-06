import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { realAssets } from "@/lib/db/schema";
import {
  getOwnedRealAsset,
  insertRealAssetValue,
  mergeRealAssetMetadata,
  type RealAssetMetadata,
  type RealAssetWithValues,
} from "./data";
import {
  decodeNhtsaVin,
  estimateVehicleFromAutoDevListings,
  fetchMarketCheckVehicleValue,
  fetchRentCastHomeValue,
  type ProviderValueResult,
  type VinDecodeResult,
} from "./providers";

function metadata(assetMetadata: unknown): RealAssetMetadata {
  return assetMetadata && typeof assetMetadata === "object" ? (assetMetadata as RealAssetMetadata) : {};
}

function s(meta: RealAssetMetadata, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function n(meta: RealAssetMetadata, key: string): number | null {
  const value = meta[key];
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addressFrom(meta: RealAssetMetadata): string | null {
  const full = s(meta, "address");
  if (full) return full;
  const line1 = s(meta, "addressLine1");
  const city = s(meta, "city");
  const state = s(meta, "state");
  const zip = s(meta, "zip") ?? s(meta, "zipCode");
  const parts = [line1, city, state, zip].filter(Boolean);
  return parts.length >= 3 ? parts.join(", ") : null;
}

async function persistProviderResult(asset: RealAssetWithValues, result: ProviderValueResult) {
  if (!result.ok) return null;
  return insertRealAssetValue(asset, {
    value: result.value,
    source: result.source,
    sourceKind: result.sourceKind,
    asOf: result.asOf,
    confidence: result.confidence,
    rangeLow: result.rangeLow,
    rangeHigh: result.rangeHigh,
    notes: result.notes,
    raw: result.raw,
  });
}

export async function refreshRealAssetMarketValue(asset: RealAssetWithValues): Promise<{
  ok: boolean;
  provider: ProviderValueResult | null;
  decoded: VinDecodeResult | null;
  value: Awaited<ReturnType<typeof insertRealAssetValue>> | null;
}> {
  const meta = metadata(asset.metadata);
  let providerResult: ProviderValueResult | null = null;
  let decoded: VinDecodeResult | null = null;
  let currentAsset = asset;

  if (asset.kind === "home" || asset.kind === "land") {
    providerResult = await fetchRentCastHomeValue(
      {
        address: addressFrom(meta),
        latitude: n(meta, "latitude"),
        longitude: n(meta, "longitude"),
        propertyType: s(meta, "propertyType"),
        bedrooms: n(meta, "bedrooms"),
        bathrooms: n(meta, "bathrooms"),
        squareFootage: n(meta, "squareFootage"),
      },
      { apiKey: process.env.RENTCAST_API_KEY },
    );
  } else if (asset.kind === "vehicle") {
    const vin = s(meta, "vin");
    if (vin) {
      decoded = await decodeNhtsaVin(vin);
      if (decoded.ok) {
        const updated = await mergeRealAssetMetadata(asset, decoded.metadata);
        currentAsset = { ...asset, ...updated };
      }
    }
    const nextMeta = metadata(currentAsset.metadata);
    if (process.env.MARKETCHECK_API_KEY && s(nextMeta, "vin")) {
      providerResult = await fetchMarketCheckVehicleValue(
        {
          vin: s(nextMeta, "vin"),
          mileage: n(nextMeta, "mileage"),
          zip: s(nextMeta, "zip") ?? s(nextMeta, "zipCode"),
        },
        { apiKey: process.env.MARKETCHECK_API_KEY },
      );
    }
    if (!providerResult?.ok) {
      providerResult = await estimateVehicleFromAutoDevListings(
        {
          vin: s(nextMeta, "vin"),
          year: n(nextMeta, "year"),
          make: s(nextMeta, "make"),
          model: s(nextMeta, "model"),
          trim: s(nextMeta, "trim"),
          mileage: n(nextMeta, "mileage"),
          zip: s(nextMeta, "zip") ?? s(nextMeta, "zipCode"),
          state: s(nextMeta, "state"),
        },
        { apiKey: process.env.AUTO_DEV_API_KEY },
      );
    }
  } else {
    providerResult = {
      ok: false,
      source: "rentcast",
      code: "bad_request",
      message: "No provider is available for this asset type.",
    };
  }

  const value = providerResult ? await persistProviderResult(currentAsset, providerResult) : null;
  return { ok: Boolean(providerResult?.ok), provider: providerResult, decoded, value };
}

export async function refreshAllRealAssets() {
  const rows = await db.select().from(realAssets).where(eq(realAssets.status, "active"));
  let refreshed = 0;
  let skipped = 0;
  let failures = 0;
  const refreshedUserIds = new Set<string>();
  for (const row of rows) {
    if (row.valuationMode === "manual") {
      skipped++;
      continue;
    }
    try {
      const asset = await getOwnedRealAsset(row.id, row.userId);
      if (!asset) {
        skipped++;
        continue;
      }
      const result = await refreshRealAssetMarketValue(asset);
      if (result.ok) {
        refreshed++;
        refreshedUserIds.add(row.userId);
      } else {
        skipped++;
      }
    } catch (error) {
      failures++;
      console.error(`[real-assets] refresh failed for ${row.id}:`, error);
    }
  }
  return { total: rows.length, refreshed, skipped, failures, refreshedUserIds: [...refreshedUserIds] };
}
