# Database setup

This app runs on **any PostgreSQL database** — Supabase is no longer used or
required. The data layer is Drizzle ORM + `node-postgres`, driven entirely by
the `DATABASE_URL` environment variable.

Works out of the box with:

- **Neon** (serverless Postgres, generous free tier)
- **AWS RDS / Aurora**
- **Railway**, **Render**, **DigitalOcean Managed Databases**, **Aiven**, **Fly Postgres**
- **Local / self-hosted Postgres** (Docker, Homebrew, apt, …)

## 1. Get a connection string

Any Postgres provider gives you a connection string in this shape:

```
postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

Examples:

| Provider | Where to find it |
| --- | --- |
| Neon | Console → your project → "Connect" |
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

## 3. Create the tables

```bash
npm run db:push
```

This syncs your database with `src/db/schema.ts` via Drizzle Kit. It is safe
to re-run at any time — it applies only the missing pieces. (The server also
self-heals schema drift on boot with idempotent `CREATE … IF NOT EXISTS` DDL
in `src/lib/migrate.ts`, and auto-seeds demo users/posts when the database is
empty.)

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
