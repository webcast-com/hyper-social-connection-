# Database setup

This app runs on **any PostgreSQL database**, accessed through **Prisma ORM**
(`prisma/schema.prisma` → generated client via the `@prisma/adapter-pg` driver
adapter), driven entirely by the `DATABASE_URL` environment variable.

Works out of the box with:

- **Neon** (serverless Postgres, generous free tier)
- **Prisma Postgres** (via its direct TCP connection string — see below)
- **AWS RDS / Aurora**
- **Railway**, **Render**, **DigitalOcean Managed Databases**, **Aiven**, **Fly Postgres**
- **Local / self-hosted Postgres** (Docker, Homebrew, apt, …)

## 1. Get a connection string

### Zero-setup local database (no Docker)

```bash
npm run db:local
```

Runs `scripts/dev-db.sh`, which installs real PostgreSQL binaries via npm
(`@embedded-postgres/linux-x64`), initializes a throwaway cluster at
`/tmp/pgdata`, and starts it on `127.0.0.1:55432` — no Docker or root needed.
Point `.env` at it:

```env
DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres
DATABASE_SSL=false
```

Then start the app; the boot migration creates the schema and seeds demo
users/posts automatically. Also available: `npm run db:local:status`,
`db:local:stop`, and `db:local:reset` (wipe + fresh demo data on next app
boot). Override `PG_ROOT`, `PGDATA_DIR`, or `PGPORT` env vars to relocate it.

Any Postgres provider gives you a connection string in this shape:

```
postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

Examples:

| Provider | Where to find it |
| --- | --- |
| Neon | Console → your project → "Connect" |
| Prisma Postgres | Console → your database → "Connect to your database" → use the **direct** string (`db.prisma.io`) |
| AWS RDS | Cluster/instance endpoint + credentials you created |
| Railway | Service → Connect tab |
| Local | `postgres://postgres:postgres@localhost:5432/postgres` |

## 2. Configure the app

Copy `.env.example` to `.env.local` and set your values:

```bash
cp .env.example .env.local
```

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE

# Only for local/self-hosted Postgres WITHOUT TLS:
# DATABASE_SSL=false

# Sign session cookies — generate with: openssl rand -base64 48
JWT_SECRET=<long random string>
```

Notes:

- `DATABASE_SSL` defaults to TLS with relaxed certificate validation, which
  all managed providers support. Set it to `false` only for a local database
  that has TLS disabled.
- Without `DATABASE_URL` the app still boots and serves demo/offline content,
  but sign-in and data persistence require a database.

### Using Prisma Postgres

You do **not** need Prisma ORM to use a Prisma Postgres database. It speaks
standard PostgreSQL over TCP, so this app's Prisma layer
connects to it like any other provider. Prisma gives you two strings:

```env
# Direct — use THIS one for this app.
DATABASE_URL=postgres://USER:PASSWORD@db.prisma.io:5432/postgres?sslmode=require

# Pooled — do NOT use for this app.
# postgres://USER:PASSWORD@pooled.db.prisma.io:5432/postgres?sslmode=require
```

Two things to get right:

1. **Use the direct (`db.prisma.io`) string, not the pooled one.** The pooled
   endpoint is a PgBouncer in transaction mode, which drops session state
   between transactions. This app's boot migration (`src/lib/migrate.ts`)
   creates triggers and functions and runs `CREATE INDEX` / `ALTER TABLE`,
   which is exactly the admin workload Prisma documents as needing the direct
   connection. The direct connection limit is low (10 on the free plan), but
   this app's pool caps out at 3.
2. **Add an explicit database name.** Prisma's console hands you a URL whose
   path is just `/`, e.g. `…@db.prisma.io:5432/?sslmode=require`. That parses
   to a *null* database name, and `node-postgres` then uses the **connection
   username** as the database name — so you get a confusing
   `database "<your-user>" does not exist`. Append `postgres` (or your database
   name) so the path reads `/postgres?sslmode=require`.

Leave `DATABASE_SSL` unset — Prisma Postgres requires TLS, and the app's
default (TLS with relaxed certificate validation) satisfies `sslmode=require`.
Setting `DATABASE_SSL=false` disables TLS and the connection will be rejected.

If your network blocks outbound port 5432, Prisma's direct TCP endpoint will
not be reachable; that setup needs Prisma's HTTP-based serverless driver,
which this app does not use.

## 3. Create the tables

```bash
npx prisma generate   # generate the client into generated/prisma (required once per clone)
npm run db:push       # prisma db push — sync the database with prisma/schema.prisma
```

`db push` is safe to re-run at any time — it applies only the missing pieces.
(The server also self-heals schema drift on boot with idempotent
`CREATE … IF NOT EXISTS` DDL in `src/lib/migrate.ts` — including the
Postgres triggers Prisma cannot express — and auto-seeds demo users/posts
when the database is empty.)

> **Restricted networks:** if `binaries.prisma.sh` is unreachable (some
> sandboxes), prefix commands with `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true` —
> `prisma generate` works fine without the schema engine binary. `db push`
> genuinely needs it, so run that from an unrestricted network (or let the
> app's boot DDL create the schema instead).

## 4. Verify

Start the app (`npm run dev`) and open `/api/health`:

```json
{ "ok": true, "db": true, "mode": "postgres" }
```

`db: false` / `mode: "offline"` means the connection failed — check
`DATABASE_URL`, `DATABASE_SSL`, and that your IP is allowed by the provider.

## What replaced Supabase?

| Before (Supabase) | Now |
| --- | --- |
| Supabase Auth (email + OAuth) | Email/password with bcrypt + JWT session cookies (`src/lib/auth.ts`, `/api/auth/*`) |
| Supabase Storage | Local disk uploads served from `public/uploads` (`/api/upload`). Swap in S3/R2 if you need CDN storage. |
| Supabase Realtime chat | HTTP polling every 3s against `/api/messages` (`ChatStream.tsx`) |
| Session-refresh proxy | Not needed — session cookies are stateless JWTs |

If you later want OAuth (Google/GitHub) or push-based chat, those can be
added provider-independently (e.g. Auth.js / NextAuth for OAuth, WebSockets
or Server-Sent Events for chat).
