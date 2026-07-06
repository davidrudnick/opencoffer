import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeNhtsaVin,
  estimateVehicleFromAutoDevListings,
  fetchMarketCheckVehicleValue,
  fetchRentCastHomeValue,
} from "./providers";

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);

test("fetchRentCastHomeValue maps AVM responses", async () => {
  const result = await fetchRentCastHomeValue(
    {
      address: "5500 Grand Lake Dr, San Antonio, TX, 78244",
      propertyType: "Single Family",
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1878,
    },
    { apiKey: "rentcast-key", fetchFn: async () => okJson({
      price: 250000,
      priceRangeLow: 195000,
      priceRangeHigh: 304000,
      subjectProperty: { formattedAddress: "5500 Grand Lake Dr, San Antonio, TX 78244" },
      comparables: [{ price: 289444, distance: 0.384 }],
    }) },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, 250000);
    assert.equal(result.rangeLow, 195000);
    assert.equal(result.rangeHigh, 304000);
    assert.equal(result.source, "rentcast");
    assert.equal(result.sourceKind, "avm");
  }
});

test("fetchRentCastHomeValue reports missing API keys", async () => {
  const result = await fetchRentCastHomeValue({ address: "1 Main St, Detroit, MI 48226" }, { apiKey: "" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "missing_key");
});

test("fetchRentCastHomeValue turns fetch rejections into provider errors", async () => {
  const result = await fetchRentCastHomeValue(
    { address: "1 Main St, Detroit, MI 48226" },
    {
      apiKey: "rentcast-key",
      fetchFn: async () => {
        throw new Error("network down");
      },
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "provider_error");
    assert.match(result.message, /network down/);
  }
});

test("decodeNhtsaVin maps decoded variable rows into metadata", async () => {
  const result = await decodeNhtsaVin("1HGCM82633A004352", async () => okJson({
    Results: [
      { Variable: "Make", Value: "HONDA" },
      { Variable: "Model", Value: "Accord" },
      { Variable: "Model Year", Value: "2003" },
      { Variable: "Body Class", Value: "Coupe" },
      { Variable: "Manufacturer Name", Value: "AMERICAN HONDA MOTOR CO., INC." },
      { Variable: "Error Code", Value: "0" },
    ],
  }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metadata.make, "HONDA");
    assert.equal(result.metadata.model, "Accord");
    assert.equal(result.metadata.year, 2003);
    assert.equal(result.metadata.bodyClass, "Coupe");
  }
});

test("estimateVehicleFromAutoDevListings estimates from comparable listing median", async () => {
  const result = await estimateVehicleFromAutoDevListings(
    { year: 2020, make: "Toyota", model: "Camry", mileage: 62000, zip: "48226" },
    { apiKey: "auto-key", fetchFn: async () => okJson({
      data: [
        { retailListing: { price: 21000, miles: 65000, zip: "48201" }, vehicle: { year: 2020, make: "Toyota", model: "Camry" } },
        { retailListing: { price: 25000, miles: 58000, zip: "48221" }, vehicle: { year: 2020, make: "Toyota", model: "Camry" } },
        { retailListing: { price: 0, miles: 62000 }, vehicle: { year: 2020, make: "Toyota", model: "Camry" } },
        { retailListing: { price: 22000, miles: 63000, zip: "48127" }, vehicle: { year: 2020, make: "Toyota", model: "Camry" } },
      ],
      total: 3,
    }) },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, 22000);
    assert.equal(result.source, "auto_dev");
    assert.equal(result.sourceKind, "comparable_estimate");
    assert.equal((result.raw as { sampleSize: number }).sampleSize, 3);
  }
});

test("fetchMarketCheckVehicleValue maps direct vehicle estimates", async () => {
  const result = await fetchMarketCheckVehicleValue(
    { vin: "1HGCM82633A004352", mileage: 62000, zip: "48226" },
    { apiKey: "market-key", fetchFn: async () => okJson({
      marketcheck_price: 7850,
      msrp: 25000,
      confidence: 0.82,
    }) },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, 7850);
    assert.equal(result.source, "marketcheck");
    assert.equal(result.sourceKind, "direct_vehicle_value");
    assert.equal(result.confidence, 0.82);
  }
});
