import type { RealAssetValueSource, RealAssetValueSourceKind } from "./valuation";

export type FetchFn = typeof fetch;

export type ProviderValueResult =
  | {
      ok: true;
      source: Exclude<RealAssetValueSource, "manual">;
      sourceKind: Exclude<RealAssetValueSourceKind, "manual_entry">;
      value: number;
      currency: string;
      asOf: Date;
      confidence: number | null;
      rangeLow: number | null;
      rangeHigh: number | null;
      notes: string | null;
      raw: Record<string, unknown>;
    }
  | {
      ok: false;
      source: Exclude<RealAssetValueSource, "manual">;
      code: "missing_key" | "bad_request" | "not_found" | "provider_error" | "no_estimate";
      message: string;
      status?: number;
      raw?: unknown;
    };

export type VinDecodeResult =
  | {
      ok: true;
      metadata: Record<string, unknown>;
      raw: unknown;
    }
  | {
      ok: false;
      code: "bad_request" | "provider_error" | "not_found";
      message: string;
      status?: number;
      raw?: unknown;
    };

type HomeValuationInput = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFootage?: number | null;
};

type VehicleValuationInput = {
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  zip?: string | null;
  state?: string | null;
};

type ProviderOptions = {
  apiKey?: string | null;
  fetchFn?: FetchFn;
};

const PROVIDER_TIMEOUT_MS = 15_000;

function configuredFetch(fetchFn?: FetchFn): FetchFn {
  return fetchFn ?? fetch;
}

function n(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function jsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function providerError(
  source: Exclude<RealAssetValueSource, "manual">,
  response: Response,
  raw: unknown,
): ProviderValueResult {
  return {
    ok: false,
    source,
    code: response.status === 404 ? "not_found" : response.status === 400 ? "bad_request" : "provider_error",
    message: `Provider returned HTTP ${response.status}`,
    status: response.status,
    raw,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Provider request failed.";
}

function providerNetworkError(
  source: Exclude<RealAssetValueSource, "manual">,
  error: unknown,
): ProviderValueResult {
  return {
    ok: false,
    source,
    code: "provider_error",
    message: errorMessage(error),
  };
}

function vinNetworkError(error: unknown): VinDecodeResult {
  return {
    ok: false,
    code: "provider_error",
    message: errorMessage(error),
  };
}

export async function fetchRentCastHomeValue(
  input: HomeValuationInput,
  options: ProviderOptions,
): Promise<ProviderValueResult> {
  if (!options.apiKey) {
    return { ok: false, source: "rentcast", code: "missing_key", message: "RENTCAST_API_KEY is not configured." };
  }
  if (!input.address && (input.latitude == null || input.longitude == null)) {
    return { ok: false, source: "rentcast", code: "bad_request", message: "Address or latitude/longitude is required." };
  }

  const params = new URLSearchParams();
  if (input.address) params.set("address", input.address);
  if (input.latitude != null) params.set("latitude", String(input.latitude));
  if (input.longitude != null) params.set("longitude", String(input.longitude));
  if (input.propertyType) params.set("propertyType", input.propertyType);
  if (input.bedrooms != null) params.set("bedrooms", String(input.bedrooms));
  if (input.bathrooms != null) params.set("bathrooms", String(input.bathrooms));
  if (input.squareFootage != null) params.set("squareFootage", String(input.squareFootage));
  params.set("compCount", "5");

  let response: Response;
  try {
    response = await configuredFetch(options.fetchFn)(`https://api.rentcast.io/v1/avm/value?${params}`, {
      headers: { accept: "application/json", "X-Api-Key": options.apiKey },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    return providerNetworkError("rentcast", error);
  }
  const raw = await jsonOrNull(response);
  if (!response.ok) return providerError("rentcast", response, raw);

  const body = raw as Record<string, unknown> | null;
  const value = n(body?.price);
  if (value == null || value <= 0) {
    return { ok: false, source: "rentcast", code: "no_estimate", message: "RentCast returned no positive value estimate.", raw };
  }

  return {
    ok: true,
    source: "rentcast",
    sourceKind: "avm",
    value,
    currency: "USD",
    asOf: new Date(),
    confidence: null,
    rangeLow: n(body?.priceRangeLow),
    rangeHigh: n(body?.priceRangeHigh),
    notes: "RentCast AVM estimate.",
    raw: {
      subjectProperty: body?.subjectProperty ?? null,
      comparableCount: Array.isArray(body?.comparables) ? body.comparables.length : 0,
      comparables: Array.isArray(body?.comparables) ? body.comparables.slice(0, 5) : [],
    },
  };
}

export async function decodeNhtsaVin(vin: string, fetchFn?: FetchFn): Promise<VinDecodeResult> {
  const cleaned = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) {
    return { ok: false, code: "bad_request", message: "VIN must be 17 characters and cannot contain I, O, or Q." };
  }

  let response: Response;
  try {
    response = await configuredFetch(fetchFn)(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(cleaned)}?format=json`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return vinNetworkError(error);
  }
  const raw = await jsonOrNull(response);
  if (!response.ok) {
    return {
      ok: false,
      code: response.status === 404 ? "not_found" : "provider_error",
      message: `NHTSA returned HTTP ${response.status}`,
      status: response.status,
      raw,
    };
  }

  const result = Array.isArray((raw as { Results?: unknown[] } | null)?.Results)
    ? ((raw as { Results: Array<Record<string, unknown>> }).Results[0] as Record<string, unknown> | undefined)
    : null;
  if (result && "Variable" in result) {
    const pairs = (raw as { Results: Array<Record<string, unknown>> }).Results;
    const byVariable = new Map(pairs.map((row) => [stringValue(row.Variable), row.Value]));
    return {
      ok: true,
      metadata: {
        vin: cleaned,
        make: stringValue(byVariable.get("Make")),
        model: stringValue(byVariable.get("Model")),
        year: n(byVariable.get("Model Year")),
        bodyClass: stringValue(byVariable.get("Body Class")),
        manufacturer: stringValue(byVariable.get("Manufacturer Name")),
      },
      raw,
    };
  }
  const errorCode = stringValue(result?.ErrorCode) ?? stringValue(result?.["Error Code"]);
  if (errorCode && errorCode !== "0") {
    return { ok: false, code: "not_found", message: stringValue(result?.ErrorText) ?? "NHTSA could not decode this VIN.", raw };
  }

  return {
    ok: true,
    metadata: {
      vin: cleaned,
      make: stringValue(result?.Make),
      model: stringValue(result?.Model),
      year: n(result?.ModelYear),
      trim: stringValue(result?.Trim),
      bodyClass: stringValue(result?.BodyClass),
      manufacturer: stringValue(result?.Manufacturer),
      engine: stringValue(result?.DisplacementL),
      fuel: stringValue(result?.FuelTypePrimary),
    },
    raw,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

export async function estimateVehicleFromAutoDevListings(
  input: VehicleValuationInput,
  options: ProviderOptions,
): Promise<ProviderValueResult> {
  if (!options.apiKey) {
    return { ok: false, source: "auto_dev", code: "missing_key", message: "AUTO_DEV_API_KEY is not configured." };
  }
  if (!input.make || !input.model) {
    return { ok: false, source: "auto_dev", code: "bad_request", message: "Vehicle make and model are required." };
  }

  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("limit", "20");
  params.set("sort", "updatedAt.desc");
  params.set("retailListing.used", "true");
  params.set("includeUnpriced", "false");
  params.set("includes", "total");
  params.set("vehicle.make", input.make);
  params.set("vehicle.model", input.model);
  if (input.year) params.set("vehicle.year", String(input.year));
  if (input.trim) params.set("vehicle.trim", input.trim);
  if (input.zip) {
    params.set("zip", input.zip);
    params.set("distance", "100");
  }
  if (input.state) params.set("retailListing.state", input.state);
  if (input.mileage && input.mileage > 0) {
    const low = Math.max(0, Math.round(input.mileage * 0.65));
    const high = Math.round(input.mileage * 1.35);
    params.set("retailListing.miles", `${low}-${high}`);
  }

  let response: Response;
  try {
    response = await configuredFetch(options.fetchFn)(`https://api.auto.dev/listings?${params}`, {
      headers: { accept: "application/json", Authorization: `Bearer ${options.apiKey}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    return providerNetworkError("auto_dev", error);
  }
  const raw = await jsonOrNull(response);
  if (!response.ok) return providerError("auto_dev", response, raw);

  const listings = Array.isArray((raw as { data?: unknown[] } | null)?.data)
    ? (raw as { data: Array<Record<string, unknown>> }).data
    : [];
  const prices = listings
    .map((listing) => n((listing.retailListing as Record<string, unknown> | null | undefined)?.price))
    .filter((price): price is number => price != null && price > 0);
  if (prices.length === 0) {
    return { ok: false, source: "auto_dev", code: "no_estimate", message: "Auto.dev returned no priced comparable listings.", raw };
  }

  const value = median(prices);
  return {
    ok: true,
    source: "auto_dev",
    sourceKind: "comparable_estimate",
    value,
    currency: "USD",
    asOf: new Date(),
    confidence: Math.min(0.85, Math.round((0.35 + prices.length / 40) * 100) / 100),
    rangeLow: Math.min(...prices),
    rangeHigh: Math.max(...prices),
    notes: `Median asking price from ${prices.length} comparable listing${prices.length === 1 ? "" : "s"}.`,
    raw: {
      sampleSize: prices.length,
      total: n((raw as Record<string, unknown> | null)?.total),
      listings: listings.slice(0, 10).map((listing) => ({
        vehicle: listing.vehicle ?? null,
        retailListing: listing.retailListing ?? null,
      })),
    },
  };
}

export async function fetchMarketCheckVehicleValue(
  input: VehicleValuationInput,
  options: ProviderOptions,
): Promise<ProviderValueResult> {
  if (!options.apiKey) {
    return { ok: false, source: "marketcheck", code: "missing_key", message: "MARKETCHECK_API_KEY is not configured." };
  }
  if (!input.vin) {
    return { ok: false, source: "marketcheck", code: "bad_request", message: "VIN is required for MarketCheck Price." };
  }

  const params = new URLSearchParams();
  params.set("api_key", options.apiKey);
  params.set("vin", input.vin.trim().toUpperCase());
  if (input.mileage) params.set("miles", String(input.mileage));
  if (input.zip) params.set("zip", input.zip);

  let response: Response;
  try {
    response = await configuredFetch(options.fetchFn)(
      `https://api.marketcheck.com/v2/predict/car/us/marketcheck_price?${params}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return providerNetworkError("marketcheck", error);
  }
  const raw = await jsonOrNull(response);
  if (!response.ok) return providerError("marketcheck", response, raw);

  const body = raw as Record<string, unknown> | null;
  const value = n(body?.marketcheck_price) ?? n(body?.predicted_price) ?? n(body?.price);
  if (value == null || value <= 0) {
    return { ok: false, source: "marketcheck", code: "no_estimate", message: "MarketCheck returned no positive value estimate.", raw };
  }

  return {
    ok: true,
    source: "marketcheck",
    sourceKind: "direct_vehicle_value",
    value,
    currency: "USD",
    asOf: new Date(),
    confidence: n(body?.confidence),
    rangeLow: n(body?.price_low) ?? n(body?.range_low),
    rangeHigh: n(body?.price_high) ?? n(body?.range_high),
    notes: "MarketCheck Price estimate.",
    raw: body ?? {},
  };
}
