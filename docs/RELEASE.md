# Release Guide

Use this before publishing a GitHub release for OpenCoffer.

## Preflight

- Confirm `.env.example` has every required runtime variable and no real secrets.
- Confirm `public/demo.gif` is built from real app screenshots with fake demo data only.
- Confirm the worker is included in deployment; sync, categorization, insights, and snapshots depend on it.
- Confirm `APP_ENCRYPTION_KEY` is already set for existing installs before rotating or redeploying. Changing it makes existing SimpleFIN and model secrets unreadable.

## Verification

Run from the repository root:

```bash
npx --no-install tsc --noEmit
pnpm lint
pnpm build
docker compose build web worker
python3 scripts/generate-demo-gif.py
```

Then start production mode and smoke-test these routes:

- `/dashboard`
- `/dashboard/charts`
- `/chat`
- `/dashboard/subscriptions`
- `/dashboard/investments`
- `/settings/connections`
- `/settings/llm`
- `/settings/mcp`

On mobile, confirm the bottom nav stays: Overview, Charts, Chat, Recurring, Holdings.

## GitHub Release Notes

Suggested release summary:

```markdown
OpenCoffer is a self-hosted personal finance command center with SimpleFIN sync, deterministic charts, persistent BYO-LLM chat, MCP tools, budgets, recurring spend, holdings, alerts, and background analysis.
```

Suggested checklist for the release body:

```markdown
- Added OpenCoffer branding and GitHub-ready docs.
- Added editable model connections with safe secret rotation.
- Added persistent chat history, clear chat, and configured-model picker.
- Added demo GIF generated from real app screenshots with fake demo data.
- Verified with TypeScript, lint, and production build.
```

## Deployment Notes

Docker Compose uses the `opencoffer` Postgres user, password, and database by default. Existing private deployments using an older database name can keep their current `DATABASE_URL`; the application only requires the connection string to point at the migrated schema.

`OPENCOFFER_SYNC_CRON` controls worker sync cadence. The default is every 30 minutes.
