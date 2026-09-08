# Base44 Dev Environment

## Stack
- **Next.js 16** (webpack dev server) + React 19 + TypeScript + Tailwind CSS 4
- **PostgreSQL 16** via Prisma ORM (`@prisma/adapter-pg` driver adapter)
- Generated Prisma client lives in `generated/prisma/` (committed)

## Running
```bash
docker compose -f docker-compose.base44.yml up -d
```
- Web: `node:22-slim` running `next dev --webpack -H 0.0.0.0 -p 3000` (port 3000)
- DB: `postgres:16-alpine` (user/pass: postgres/postgres, db: hyper)
- `DATABASE_URL` is set in compose `environment:` to the local Postgres; it overrides the `.env`/`.env.local` files (dotenv does not replace existing env vars)
- Source is bind-mounted; `node_modules` and `.next` use anonymous volumes to avoid host clobber

## Boot behavior
- On first request, `src/lib/migrate.ts` runs idempotent `CREATE TABLE IF NOT EXISTS` DDL + non-destructive column patches
- If the database is empty, `src/lib/seed.ts` auto-seeds demo users and posts
- Without `DATABASE_URL` the app falls back to demo/offline mode (read-only, no mutations)

## Secrets
- `RAPIDAPI_KEY` (optional): live sports scores/predictions on `/sports`. Without it the page shows fallback data. Delivered via `/run/base44/app.env`.
- S3 storage vars (`S3_*`) are optional; unset = local-disk uploads under `public/uploads/`.

## Notes
- `next.config.ts` `allowedDevOrigins` uses `process.env.BASE44_PUBLIC_HOST_SUFFIX` to allow the preview origin's HMR/dev assets
- `WATCHPACK_POLLING=true` is set so file watching works through the Docker bind mount
- The `.env` and `.env.local` files in the repo contain external credentials from the original project; the compose `DATABASE_URL` overrides them for the local Postgres
