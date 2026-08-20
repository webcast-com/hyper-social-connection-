# Prisma Postgres setup — status

Scaffolding is complete and committed. **Three steps could not be finished in
this sandbox because outbound HTTPS to Prisma's hosts is blocked.** Everything
below resumes with two commands once the network allows it.

## What blocked it

The sandbox permits `registry.npmjs.org` and `api.github.com`, but the TLS
handshake to Prisma's endpoints is terminated by an egress filter:

```
$ curl https://api.prisma.io
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to api.prisma.io:443

$ npx prisma postgres link --database db_...
! fetch failed

$ npx prisma generate
Error: request to https://binaries.prisma.sh/all_commits/<commit>/debian-openssl-3.0.x/schema-engine.gz.sha256
failed, reason: Client network socket disconnected before secure TLS connection was established
```

TCP reaches port 443 (the connection opens, then the handshake is cut), and
DNS resolves, so this is protocol-level filtering rather than DNS or routing.

Workarounds attempted and ruled out:

| Attempt | Result |
| --- | --- |
| Retry `postgres link` (per the retry rule) | Same `fetch failed` |
| `@prisma/engines` from npm (registry is allowed) | Downloader stub only — 81 KB of JS, no binary |
| GitHub releases for `prisma-engines` | Source-only; no `browser_download_url` assets |
| `objects.githubusercontent.com` (asset CDN) | Blocked |
| Existing engine in `node_modules` / `~/.cache/prisma` | None present |
| `PRISMA_SCHEMA_ENGINE_BINARY` / `PRISMA_ENGINES_MIRROR` | Available, but no reachable source for the binary |

`db.prisma.io:5432` also does not complete a Postgres handshake from here
(the connection is closed with no response; the pooled host resets), so even a
manually supplied `DATABASE_URL` would not connect from this sandbox.

## Resume (2 commands)

From an environment with normal outbound HTTPS:

```bash
# 1. Link the database — writes DATABASE_URL into .env
PRISMA_API_KEY="<workspace-api-key>" \
  npx --yes --package=prisma@latest -- prisma postgres link --database "db_cmfg00w0h00kxxee8uk4imqii"

# 2. Migrate, generate, seed, verify
npx prisma migrate dev --name init && npx prisma db seed && npx tsx scripts/verify-prisma.ts
```

`migrate dev` runs `generate` automatically. Expected final output:
`✅ Connected` followed by the three seeded users.

Then remove the Prisma entries from `exclude` in `tsconfig.json` (see below).

## What is already in place

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` | `prisma-client` generator → `../generated/prisma`; starter `User`/`Post` models with a relation |
| `prisma.config.ts` | `schema`, `migrations.path`, `migrations.seed = "tsx prisma/seed.ts"`, `datasource.url` |
| `lib/prisma.ts` | Client singleton using the `PrismaPg` adapter |
| `prisma/seed.ts` | Idempotent seed — 3 users, 3 posts (upsert by email) |
| `scripts/verify-prisma.ts` | One read; prints `✅ Connected` or the exact error |

Dependencies installed: `prisma`, `@types/node`, `@types/pg`, `tsx` (dev);
`@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv` (runtime).

### Two notes

1. **`.env` was tracked in git.** `.gitignore` had `.env*`, but the file had
   been committed previously, so the rule was inert and a linked
   `DATABASE_URL` would have been committed. It is now untracked
   (`git rm --cached .env`); the file itself is untouched on disk. Rotate the
   `JWT_SECRET` that was in the committed copy — it remains in git history.
2. **`tsconfig.json` temporarily excludes the Prisma files.** They import
   `../generated/prisma/client`, which does not exist until `prisma generate`
   runs, and its absence would otherwise fail `npm run typecheck`. Remove
   `generated`, `lib/prisma.ts`, `prisma/seed.ts`, `scripts/verify-prisma.ts`
   and `prisma.config.ts` from `exclude` after generating.

## Relationship to the existing app

This is additive and separate from the running Next.js app, which uses Drizzle
against its own `DATABASE_URL` (see `DATABASE.md`). Nothing in `src/` imports
Prisma Client, and the app still boots in demo mode. If you point both at the
same database, note that the app auto-creates its Drizzle tables on boot
(`src/lib/migrate.ts`), which would add unmanaged tables to the Prisma
database and cause `prisma migrate dev` to report drift. Use a separate
database for Prisma, or add those tables to `tables.external` in
`prisma.config.ts`.
