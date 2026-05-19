# Contributing

OpenCoffer is a Next.js, TypeScript, Drizzle, Postgres, and Tailwind app.

## Local Setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Run the worker in another terminal:

```bash
pnpm worker
```

## Checks

Run these before opening a pull request:

```bash
npx --no-install tsc --noEmit
pnpm lint
pnpm build
```

For UI changes, smoke-test production mode on desktop and mobile.
