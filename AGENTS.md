# Base44 dev environment — hyper (Hyper Social Connection)

## Stack
Next.js 16 (App Router, `next dev --webpack`) + React 19 + TypeScript + Tailwind 4 +
PostgreSQL via Prisma 7 (`@prisma/adapter-pg`). Prisma client is generated into
`generated/prisma` (gitignored) — `npx prisma generate` runs at container start.

## Running
`docker compose -f docker-compose.base44.yml up -d` — two services:
- `postgres`: local Postgres 17 (user/db `hyper`, password `hyperpass`). Not exposed publicly.
- `web`: `node:22`, repo bind-mounted at `/app`, `node_modules` in a named volume.
  Startup runs `npm ci`, `npx prisma generate`, then `next dev --webpack --hostname 0.0.0.0 -p 3000`.

## Environment
- `DATABASE_URL` is set by compose to the local Postgres and overrides the committed
  `.env`/`.env.local` (process env wins over Next.js .env files).
- `BASE44_PUBLIC_HOST_SUFFIX` is passed in by the platform and consumed in `next.config.ts`
  `allowedDevOrigins` so the preview origin can load dev assets/HMR.
- Optional external services (`S3_*`, `RAPIDAPI_KEY`) are read from the committed
  `.env`/`.env.local`. They are NOT required to boot: the app degrades gracefully
  (local-disk uploads, offline sports) when absent. No external secrets are needed.

## Database bootstrap
The app auto-migrates and auto-seeds lazily on the first request
(`getViewer` → `ensureSeeded` → `ensureMigrated`, all `CREATE TABLE IF NOT EXISTS` /
`ADD COLUMN IF NOT EXISTS`). Because `NODE_ENV=development`, an empty DB is auto-seeded
with demo users (login `alex@example.com` / `changeme123`). The first request after a
fresh DB may log a seed error (a column added by a later patch); the next request
succeeds — this is expected, not a bug.

## Verifying it works
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` → 200 with the app HTML.
- `curl -sf http://localhost:3000/api/health` → `{"ok":true,"db":true,"mode":"postgres"}`.
- The preview iframe should show the Hyper feed.

## Notes
- The web entry point MUST stay on host port 3000 (mapped in compose).
- `next.config.ts` was edited to add the dynamic Base44 preview origin to `allowedDevOrigins`
  (kept the existing e2b.app entries).
