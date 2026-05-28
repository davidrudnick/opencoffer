# Real Assets and Market Valuation Design

## Context

OpenCoffer currently computes net worth from synced SimpleFIN financial accounts. The database has accounts, holdings, transactions, budgets, alerts, saved charts, and daily net-worth snapshots, but no table for manually owned real assets such as homes, vehicles, land, collectibles, or other non-bank assets.

The new feature should let a household add real assets, track their values over time, and include them in net worth. Market values should update from free or low-cost providers when configured, but the app must remain useful with manual values only.

API availability was checked on May 28, 2026:

- RentCast offers a public property API, a value estimate endpoint at `GET https://api.rentcast.io/v1/avm/value`, and a free plan with 50 calls per month.
- Realie offers a free property data tier with 25 calls per month and useful parcel/comps data, but it is not the primary direct AVM source.
- NHTSA vPIC is an official free VIN decode API, but it does not return market value.
- Auto.dev has a starter plan with 1,000 free calls per month for core vehicle APIs including VIN decode and listings; car value can be approximated from listing comps.
- MarketCheck has direct vehicle price prediction, but public pricing lists data fees for the price endpoint, so it should be optional rather than the default free path.

## Goals

- Add a first-class real asset model for homes, cars, and other assets.
- Store manual value history and provider value history.
- Include active real assets in current net worth, net-worth snapshots, charts, and finance tools.
- Support market refreshes through a provider abstraction.
- Keep provider API keys server-side and optional.
- Degrade cleanly when a provider is missing, quota-limited, or returns no confident estimate.

## Non-Goals

- No scraping Zillow, Realtor, Redfin, or similar sites.
- No guarantee that market estimates are appraisal-grade or lender-grade.
- No automatic loan/mortgage matching in the first version.
- No vehicle condition modeling beyond fields supplied by the user or provider.
- No paid provider required for the feature to work.

## Approach

Use a provider-based design with manual values as the durable source of truth.

1. Manual values are always allowed and are used immediately in net worth.
2. Provider values are stored as observations with source, confidence, raw response metadata, and timestamp.
3. The asset's displayed/current value is either the latest manual value or the latest provider value depending on an asset-level preference.
4. Providers can be added without changing the UI or finance tools.

This avoids building the feature around any one vendor's quota or terms and keeps self-hosted users in control of cost.

## Data Model

Add `real_assets`:

- `id`, `userId`. Household sharing follows the existing `householdUserIds(userId)` pattern used by finance tools.
- `kind`: `home | vehicle | land | other`.
- `name`.
- `status`: `active | sold | archived`.
- `valuationMode`: `manual | provider`.
- `currency`, default `USD`.
- `purchasePrice`, `purchaseDate`.
- `metadata` JSONB for kind-specific details.
- `createdAt`, `updatedAt`.

Expected metadata:

- Home: address, city, state, zip, property type, bedrooms, bathrooms, square footage, lot size, year built.
- Vehicle: VIN, year, make, model, trim, mileage, zip, condition.
- Other: free-form description and optional category.

Add `real_asset_values`:

- `id`, `assetId`, `userId`.
- `value`, `currency`.
- `source`: `manual | rentcast | realie | auto_dev | marketcheck`.
- `sourceKind`: `manual_entry | avm | comparable_estimate | direct_vehicle_value`.
- `asOf`.
- `confidence`: numeric nullable.
- `rangeLow`, `rangeHigh` nullable.
- `notes`.
- `raw` JSONB for provider response excerpts.
- `createdAt`.

Indexes:

- `real_assets_user_status_idx` on `(userId, status)`.
- `real_asset_values_asset_asof_idx` on `(assetId, asOf desc)`.

## Provider Layer

Create `src/lib/real-assets/providers/types.ts` with:

- `ValuationProvider`.
- `supports(asset)`.
- `refresh(asset): Promise<ValuationResult>`.
- `validateConfig()`.

`ValuationResult` should normalize:

- estimate value.
- optional range.
- confidence/quality indicator.
- provider timestamp.
- provider metadata.
- user-facing warning when the result is partial.

Provider failures should return structured errors, not throw through UI flows except for configuration bugs.

## Home Valuation

Primary provider: RentCast.

- Requires `RENTCAST_API_KEY`.
- Calls `/v1/avm/value`.
- Sends address or latitude/longitude plus available home facts.
- Stores `price`, `priceRangeLow`, `priceRangeHigh`, subject property, and compact comparable metadata.

Fallback provider: Realie.

- Requires `REALIE_API_KEY`.
- Use address/parcel lookup and comparables when direct valuation is unavailable.
- Store returned assessed values or comparable-derived estimates as lower-confidence observations.

## Vehicle Valuation

VIN decode provider: NHTSA vPIC.

- No API key.
- Used when a vehicle has a VIN.
- Populates or confirms year, make, model, body class, engine, and manufacturer metadata.
- Does not create a `real_asset_values` row because it does not return market value.

Free-tier market estimate provider: Auto.dev listing comps.

- Requires `AUTO_DEV_API_KEY`.
- Uses VIN/year/make/model/mileage/zip where possible.
- Derives an estimate from comparable active listings, storing sample size and median/trimmed median in `raw`.
- Mark confidence lower than direct valuation because listing prices are asking prices, not sale prices.

Optional direct-value provider: MarketCheck.

- Requires `MARKETCHECK_API_KEY`.
- Calls MarketCheck Price when configured.
- Store returned prediction, MSRP, and provider confidence metadata.
- Mark as optional because public pricing includes per-call data fees.

## UI

Add a new workspace route: `/dashboard/assets`.

Screen structure:

- Summary row: real asset total, home total, vehicle total, other total, last refresh status.
- Asset list grouped by kind, with current value, value source, last updated date, and provider status.
- Add/edit asset drawer or form for homes, vehicles, and other assets.
- Asset detail view with value history, provider observations, raw provider summary, and manual value entry.
- Refresh controls per asset and bulk refresh for configured providers.

Navigation:

- Add `Assets` to desktop workspace nav.
- Keep mobile bottom nav unchanged unless a slot is intentionally replaced; assets remains reachable through the drawer.

## Net Worth Integration

Update the current net-worth tool to sum:

- existing SimpleFIN assets and liabilities.
- active real asset current values as assets.

Update `snapshotNetWorthForUser` and `backfillNetWorth`:

- Current-day snapshots include current real asset values.
- Historical backfill can include real asset values only from dated `real_asset_values` observations at or before each snapshot date.
- If no asset value exists at a historical date, exclude that asset for that date instead of backfilling purchase price automatically.

Update chart data:

- `chart_net_worth_history` continues to use snapshots.
- `chart_balances_by_group` gains separate `home`, `vehicle`, `land`, and `other assets` groups.
- Do not add a dedicated asset-value trend chart in the first implementation; asset history appears on the asset detail screen.

## Background Refresh

Add a worker job that refreshes real assets on a conservative cadence:

- Homes: at most weekly by default.
- Vehicles: at most monthly by default, or manual refresh only if using paid direct valuation.
- Skip refreshes when required API keys are missing.
- Respect recent failure cooldowns to avoid burning quota.

Add environment variables:

- `RENTCAST_API_KEY`
- `REALIE_API_KEY`
- `AUTO_DEV_API_KEY`
- `MARKETCHECK_API_KEY`
- `OPENCOFFER_ASSET_REFRESH_CRON`, default weekly.

## Error Handling

- Missing API key: show "manual tracking only" and keep forms usable.
- Quota exceeded: record provider error and next allowed retry time.
- No valuation found: preserve the existing current value and prompt for manual value.
- Low-confidence estimate: store it, but do not switch current value automatically unless `valuationMode` is `provider`.
- Provider response shape change: log structured provider error and avoid corrupting stored values.

## Security and Privacy

- API keys stay in environment variables, not user-editable database rows in the first version.
- Addresses and VINs are already sensitive personal data; avoid sending them to any provider unless the user explicitly configures the provider and refreshes or enables background refresh.
- Store compact raw provider data, not full responses when full responses contain unnecessary owner/contact data.
- Finance tools should summarize assets without exposing full addresses unless the user is asking about a specific asset.

## Testing

Use test-first implementation for behavior changes.

Focused tests:

- Current value selection from manual/provider observations.
- Real asset totals included in net worth.
- Snapshot calculation includes dated asset observations.
- Provider response normalization for RentCast, NHTSA, Auto.dev comps, and MarketCheck stubs.
- Missing key/quota/no-result provider paths.

Integration checks:

- `npx --no-install tsc --noEmit`
- existing helper tests through `tsx`
- `pnpm lint`
- `pnpm build`

## Rollout

1. Add schema and migration.
2. Add pure helpers and provider normalization tests.
3. Add real asset CRUD server actions/API.
4. Add assets page UI.
5. Integrate net-worth tools and snapshots.
6. Add provider refresh actions and worker job.
7. Update README and `.env.example`.

The first implementation should include RentCast home valuation, NHTSA VIN decode, Auto.dev comparable vehicle estimates, manual values, and net-worth integration. MarketCheck should use the same provider interface but remain optional because it can incur per-call data fees.
