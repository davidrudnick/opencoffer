# Real Assets Market Valuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manually tracked homes, vehicles, land, and other assets with optional market valuation refreshes and net-worth integration.

**Architecture:** Add `real_assets` and `real_asset_values` tables, then build pure valuation helpers, provider adapters, authenticated asset APIs, a dashboard assets page, and net-worth/chart integration. Manual values remain the durable fallback; provider refreshes add observations that can become current value when the asset is in provider mode.

**Tech Stack:** Next.js 15 app router, React 19, Drizzle/Postgres, Zod, node-cron, TypeScript helper tests through `tsx`.

---

### Task 1: Schema and Pure Helpers

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/real-assets/valuation.ts`
- Create: `src/lib/real-assets/valuation.test.ts`
- Create: `src/lib/db/migrations/0001_real_assets.sql`
- Modify: `src/lib/db/migrations/meta/_journal.json`

- [ ] Write failing tests for current-value selection, totals by kind, and historical dated values in `src/lib/real-assets/valuation.test.ts`.
- [ ] Run `rtk npx --no-install tsx src/lib/real-assets/valuation.test.ts`; expected failure because the module does not exist.
- [ ] Add `realAssets` and `realAssetValues` schema exports.
- [ ] Add the SQL migration and journal entry.
- [ ] Implement pure helpers: `selectCurrentAssetValue`, `summarizeRealAssets`, and `selectAssetValueAt`.
- [ ] Re-run the helper test and confirm it passes.

### Task 2: Provider Normalization

**Files:**
- Create: `src/lib/real-assets/providers.ts`
- Create: `src/lib/real-assets/providers.test.ts`

- [ ] Write failing tests for RentCast, NHTSA, Auto.dev comparable median, missing-key, and MarketCheck value normalization.
- [ ] Run `rtk npx --no-install tsx src/lib/real-assets/providers.test.ts`; expected failure because the module does not exist.
- [ ] Implement provider functions with injectable `fetchFn` for tests.
- [ ] Re-run provider tests and confirm they pass.

### Task 3: Database Access and Asset APIs

**Files:**
- Create: `src/lib/real-assets/data.ts`
- Create: `src/app/api/assets/route.ts`
- Create: `src/app/api/assets/[id]/route.ts`
- Create: `src/app/api/assets/[id]/values/route.ts`
- Create: `src/app/api/assets/[id]/refresh/route.ts`

- [ ] Implement authenticated CRUD and manual value APIs scoped to `session.user.id`.
- [ ] Implement refresh API that updates metadata from NHTSA and inserts provider observations from RentCast, Auto.dev, Realie, or MarketCheck when configured.
- [ ] Run `rtk npx --no-install tsc --noEmit`; expected pass after this task.

### Task 4: Assets Dashboard UI

**Files:**
- Modify: `src/components/nav-config.tsx`
- Create: `src/app/dashboard/assets/page.tsx`
- Create: `src/app/dashboard/assets/AssetsClient.tsx`

- [ ] Add the `Assets` desktop navigation item.
- [ ] Create the server page that loads current assets and renders `AssetsClient`.
- [ ] Build forms for adding assets, adding manual values, editing valuation mode/status, deleting assets, and refreshing provider values.
- [ ] Run `rtk npx --no-install tsc --noEmit`; expected pass after this task.

### Task 5: Net Worth, Charts, Worker, and Docs

**Files:**
- Modify: `src/lib/finance/tools.ts`
- Modify: `src/lib/finance/netWorthSnapshot.ts`
- Modify: `src/lib/finance/netWorthBackfill.ts`
- Modify: `src/worker/index.ts`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] Include active real asset current values in `get_net_worth` and `get_balances_by_group`.
- [ ] Include real asset values in current snapshots and historical backfill using dated observations.
- [ ] Add a weekly worker refresh job.
- [ ] Document provider environment variables and asset behavior.
- [ ] Run `rtk npx --no-install tsc --noEmit`, all helper tests, `rtk pnpm lint`, and `rtk pnpm build`.

### Task 6: Review and Final Verification

**Files:**
- All touched files.

- [ ] Run `rtk codeward review --changed`.
- [ ] Fix any material findings.
- [ ] Re-run full verification commands.
- [ ] Check `rtk git status --short` and summarize changed files, leaving pre-existing `.gitignore` changes untouched.
