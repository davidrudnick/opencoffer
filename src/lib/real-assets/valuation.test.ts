import assert from "node:assert/strict";
import test from "node:test";
import {
  selectAssetValueAt,
  selectCurrentAssetValue,
  summarizeRealAssets,
  type RealAssetForValuation,
  type RealAssetValueForValuation,
} from "./valuation";

const baseAsset: RealAssetForValuation = {
  id: "asset-1",
  kind: "home",
  name: "House",
  status: "active",
  valuationMode: "manual",
  currency: "USD",
};

const values: RealAssetValueForValuation[] = [
  {
    id: "manual-old",
    assetId: "asset-1",
    value: 450000,
    currency: "USD",
    source: "manual",
    sourceKind: "manual_entry",
    asOf: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "provider-new",
    assetId: "asset-1",
    value: 470000,
    currency: "USD",
    source: "rentcast",
    sourceKind: "avm",
    asOf: new Date("2026-02-01T00:00:00.000Z"),
    rangeLow: 445000,
    rangeHigh: 492000,
  },
  {
    id: "manual-new",
    assetId: "asset-1",
    value: 460000,
    currency: "USD",
    source: "manual",
    sourceKind: "manual_entry",
    asOf: new Date("2026-03-01T00:00:00.000Z"),
  },
];

test("selectCurrentAssetValue prefers manual or provider values by valuation mode", () => {
  assert.equal(selectCurrentAssetValue(baseAsset, values)?.id, "manual-new");
  assert.equal(
    selectCurrentAssetValue({ ...baseAsset, valuationMode: "provider" }, values)?.id,
    "provider-new",
  );
  assert.equal(
    selectCurrentAssetValue({ ...baseAsset, valuationMode: "provider" }, values.filter((v) => v.source === "manual"))?.id,
    "manual-new",
  );
});

test("selectAssetValueAt returns the latest eligible value at the requested date", () => {
  assert.equal(
    selectAssetValueAt({ ...baseAsset, valuationMode: "provider" }, values, new Date("2026-02-15T00:00:00.000Z"))?.id,
    "provider-new",
  );
  assert.equal(
    selectAssetValueAt(baseAsset, values, new Date("2026-02-15T00:00:00.000Z"))?.id,
    "manual-old",
  );
  assert.equal(
    selectAssetValueAt(baseAsset, values, new Date("2025-12-31T00:00:00.000Z")),
    null,
  );
});

test("summarizeRealAssets totals active assets by kind", () => {
  const summary = summarizeRealAssets([
    { asset: baseAsset, values },
    {
      asset: {
        ...baseAsset,
        id: "asset-2",
        kind: "vehicle",
        name: "Car",
        valuationMode: "provider",
      },
      values: [
        {
          id: "car-value",
          assetId: "asset-2",
          value: 32000,
          currency: "USD",
          source: "auto_dev",
          sourceKind: "comparable_estimate",
          asOf: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    },
    {
      asset: {
        ...baseAsset,
        id: "asset-3",
        kind: "land",
        name: "Sold land",
        status: "sold",
      },
      values: [
        {
          id: "land-value",
          assetId: "asset-3",
          value: 100000,
          currency: "USD",
          source: "manual",
          sourceKind: "manual_entry",
          asOf: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    },
  ]);

  assert.equal(summary.total, 492000);
  assert.equal(summary.byKind.home, 460000);
  assert.equal(summary.byKind.vehicle, 32000);
  assert.equal(summary.assets.length, 2);
  assert.equal(summary.assets[0].currentValue?.value, 460000);
});
