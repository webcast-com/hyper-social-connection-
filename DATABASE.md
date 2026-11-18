# Database setup

This app runs on **any PostgreSQL database**, accessed through **Prisma ORM**
8 (`prisma/schema.prisma` → the contract in `src/prisma/` → a client over one
`pg` pool), driven entirely by the `DATABASE_URL` environment variable.

Works out of the box with:

- **Supabase** (what the live site uses — see "Using Supabase" below)
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
| Supabase | Dashboard → your project → "Connect" → the **pooler** strings (see "Using Supabase") |
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

# Only for a remote Postgres WITHOUT TLS:
# DATABASE_SSL=false

# Verify the server's certificate against this authority (Supabase):
# DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"

# Authentication uses opaque, revocable sessions stored in Prisma's `sessions`
# table. No JWT signing secret is required.
```

Notes:

- **TLS** (`src/prisma/tls.ts`; the app and the `prisma db …` commands follow
  the same rules, first match wins):
  1. `DATABASE_SSL=false` — no TLS.
  2. `DATABASE_CA_CERT` set — TLS, and the server's certificate must be signed
     by that authority and match the host name. The value is the certificate
     text (line breaks may be written as `\n`) or the path of the file.
  3. The connection string carries `sslmode` (or another TLS parameter) —
     `node-postgres` follows it. Note that it treats `sslmode=require` as
     full verification against the public certificate authorities.
  4. The host is local or private (`localhost`, `127.0.0.1`, `10.x`,
     `192.168.x`, a bare name such as `db`) — no TLS.
  5. Any other host — TLS, encrypted, but the certificate is **not** verified.
     The server log says so on start-up.
- Without `DATABASE_URL` the app still boots and serves anonymous demo/offline
  content, but sign-in, uploads, mutations, and data persistence require a database-backed session.

### Using Supabase

Supabase is the database; Prisma stays the query layer. Nothing in the app
uses the Supabase client, Supabase Auth, Storage or Realtime, so no Supabase
API key is needed, only a Postgres connection string.

**1. Pick the right strings.** In the Supabase dashboard open your project,
press **Connect**, and look under "Connection string". There are three; this
app uses two of them:

```env
# Transaction pooler (port 6543) — for the running site (Vercel).
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres

# Session pooler (port 5432) — for migrations (`npm run db:migrate`, the
# database-migrate workflow). Same string, different port.
# postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

The third, "Direct connection" (`db.PROJECT_REF.supabase.co`), is reached over
IPv6 only unless you buy the IPv4 add-on; Vercel and GitHub Actions cannot use
it. Replace `[YOUR-PASSWORD]` with the database password, and percent-encode
any `@ : / ? #` in it (`@` becomes `%40`).

Paste the strings as Supabase gives them: do **not** add `?sslmode=require`.
The app encrypts the connection on its own (rule 5 above), and with
`sslmode=require` `node-postgres` would refuse Supabase's certificate unless
`DATABASE_CA_CERT` is also set.

**2. Verify the certificate (recommended).** Dashboard → Database → Settings →
"SSL Configuration" → download the certificate, and put its text in
`DATABASE_CA_CERT` wherever `DATABASE_URL` is set. Without it the connection
is still encrypted, but the app does not check that the server it reached is
Supabase's.

**3. Create the tables before the site connects.** Either way below, do this
first: if the app reaches an empty database before the migrations do, Prisma
will refuse to migrate it afterwards (see "Create the tables").

- From GitHub: add the repository secret `SUPABASE_DATABASE_URL` (the
  **session pooler** string) and, optionally, `SUPABASE_CA_CERT`. Then
  Actions → "database-migrate" → "Run workflow" on `main`. The same workflow
  runs by itself whenever a schema change is merged.
- From a terminal, with `DATABASE_URL` set to the session pooler string:

  ```bash
  npm run db:migrate     # create / update the tables
  npm run db:lockdown    # close Supabase's Data API to them (see below)
  npm run db:check       # confirm the database matches the schema
  ```

  The repository's `.env` names another database; a `DATABASE_URL` set in the
  shell takes precedence over it.

**4. Point the site at it.** In Vercel → Project → Settings → Environment
Variables set `DATABASE_URL` (the **transaction pooler** string) and
`DATABASE_CA_CERT`, then redeploy. `/api/health` should answer
`"db": true, "mode": "postgres"`. A variable set in Vercel takes precedence
over the `.env` files in the repository.

**Keep the tables off Supabase's Data API.** Supabase serves the `public`
schema over HTTP to anyone holding the project's public key, for every table
that key's role has been granted. This app's `users` table holds password
hashes, so `npm run db:lockdown` (`prisma/supabase-lockdown.sql`) removes
those grants, for existing tables and for ones created later. It does not
turn on row level security, because Prisma would then report every table as
changed; Supabase's advisor may still list the tables under "RLS disabled",
which has no effect once the grants are gone. You can also switch the Data API
off altogether in the project's API settings, since nothing here uses it.

**Existing data is not moved by the steps above.** A new Supabase project
starts empty. To bring accounts, posts and messages along, see "Moving
existing data" below, and do it between steps 3 and 4.

What has and has not been tested: the TLS rules, the migrations, the lockdown
script, the data copy and the whole app were run against a local PostgreSQL
set up to behave like Supabase (a certificate from a private authority, TLS-only access,
`anon` / `authenticated` roles, and a transaction-mode pooler that moves every
transaction to a different server connection). They have not been run against
a real Supabase project.

### Moving existing data

`scripts/copy-database.ts` copies every row of every table from one database
into another: accounts (with their password hashes, so people sign in with
the password they have), sessions (so they stay signed in), posts, comments,
likes, messages, groups, polls, notifications, sports picks.

Run it from GitHub: Actions → "database-copy" → "Run workflow" on `main`.

| Mode | What it does |
| --- | --- |
| `check` | Creates the Supabase tables if they are missing, then lists each table with its row count on both sides and anything that would stop a copy. Copies nothing. |
| `copy` | Copies everything. Refuses if the Supabase database already holds rows. |
| `replace` | Deletes the rows in the Supabase database, then copies. |

It needs the secret `SUPABASE_DATABASE_URL` (see step 3 above). The database
it reads from is the secret `SOURCE_DATABASE_URL` when that is set: use the
`DATABASE_URL` the live site has today in Vercel. Without that secret it reads
the database named in this repository's `.env.local` / `.env`; the first lines
of the run say which database that is, so check them against what you expect
(the user count is the quickest test).

The order that loses nothing:

1. Run `check`. Read the table: the source column should show your real
   numbers.
2. Run `copy`.
3. Open a Vercel preview or a local run pointed at Supabase if you want to
   look before switching.
4. At a quiet moment run `replace`, and straight after it change
   `DATABASE_URL` in Vercel and redeploy (step 4 of "Using Supabase").
   Anything posted between the last copy and the redeploy stays in the old
   database, which is why the second copy is run immediately before.
5. Keep the old database until you are satisfied; the copy never changes it.

What the script guarantees, and how (each of these is tested):

- The old database is only read, in one read-only snapshot.
- The copy is one transaction: it arrives whole or not at all. A run that
  fails halfway leaves the Supabase database exactly as it was.
- Values are transferred as PostgreSQL's own text, so timestamps keep their
  microseconds and numbers are not rounded.
- Like and comment counters are copied as stored; the triggers that maintain
  them are off while rows are inserted, then back on.
- Id counters continue after the highest id the old database ever handed out,
  so new posts and accounts do not collide with copied ones.
- A column that holds data in the old database and has no counterpart in the
  new one stops the run before anything is written.

Uploaded photos and videos are not in the database (it stores their address);
they stay in the storage bucket the `S3_*` variables point to and are not
affected. Keep those variables as they are.

From a terminal the same thing is:

```bash
export TARGET_DATABASE_URL='…supabase session pooler string…'
export SOURCE_DATABASE_URL='…the current database…'
DATABASE_URL="$TARGET_DATABASE_URL" npm run db:migrate
DATABASE_URL="$TARGET_DATABASE_URL" npm run db:bootstrap   # the tables the app creates itself
npm run db:copy -- check
npm run db:copy -- copy
```

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

Leave `DATABASE_SSL` unset — Prisma Postgres requires TLS, and the
`sslmode=require` in its string turns it on, with the certificate verified.
Setting `DATABASE_SSL=false` disables TLS and the connection will be rejected.

If your network blocks outbound port 5432, Prisma's direct TCP endpoint will
not be reachable; that setup needs Prisma's HTTP-based serverless driver,
which this app does not use.

## Media / object storage

Prisma is the database layer. **Do not put photos or videos in Postgres**
(`Bytes` columns). Media belongs in an object store; this app talks to one
through a small adapter (`src/lib/storage.ts`).

| Mode | When | Where the bytes live | URL stored in Postgres |
| --- | --- | --- | --- |
| **Prisma Object Store / S3 / R2 / MinIO** | `S3_BUCKET` + access key + secret are set | Bucket key `media/<uuid>.<ext>` | `/uploads/<uuid>.<ext>` |
| **Local disk** (default) | those env vars are unset | `public/uploads/<uuid>.<ext>` | `/uploads/<uuid>.<ext>` |

The public URL never changes. `/uploads/:filename` is rewritten to
`/api/media/:filename`, which either streams the local file (with HTTP Range
so video seeking works) or 302s to a short-lived presigned GET. Existing
posts, avatars, stories and chat attachments keep working if you add a
bucket later.

### Using a Prisma Object Store bucket

1. In the [Prisma Console](https://console.prisma.io) open the project →
   **Object Store** → create a bucket (e.g. `uploads`).
2. Mint a **read_write** key. The secret is shown once.
3. Put the four fields from the key response into `.env.local`:

```env
S3_BUCKET=uploads
S3_ENDPOINT=https://…          # `endpoint` from the key response
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
```

`PRISMA_BUCKET_*` aliases are accepted if you prefer those names.

`GET /api/health` reports `"storage": "s3"` or `"storage": "local"`.
`GET /api/upload` reports the same plus the size caps.

Uploads still go through the Next.js server (auth + magic-byte sniff) and
are then `PutObject`'d to the bucket. That avoids needing CORS on the
bucket for a browser PUT. Point `DATABASE_URL` at Prisma Postgres and the
bucket at Prisma Object Store and the whole stack stays in one project.

## 3. Create the tables

```bash
npm run db:migrate    # prisma db migrate — apply the committed migrations in migrations/app
npm run db:check      # prisma db verify — confirm the database matches the contract
```

**Do this before the app first runs against a new database.** `db:migrate` is
safe to re-run at any time; when the database is up to date it does nothing.

The server also runs idempotent `CREATE … IF NOT EXISTS` DDL on boot
(`src/lib/migrate.ts`): the tables that live outside the Prisma schema, the
Postgres triggers Prisma cannot express, and an auto-seed of demo users/posts
when the database is empty. If that boot DDL reaches an empty database before
`db:migrate` does, it creates the tables without the unique indexes and marker
Prisma expects, and Prisma will refuse to migrate that database afterwards.
The app still runs on it; to bring it under Prisma, start again from an empty
database and migrate first.

There is no client to generate. After changing `prisma/schema.prisma`, run
`npm run db:generate`, `npm run db:plan -- --name <slug>` and
`npm run db:migrate` (see [PRISMA_SETUP.md](PRISMA_SETUP.md)).

## 4. Verify

Start the app (`npm run dev`) and open `/api/health`:

```json
{ "ok": true, "db": true, "mode": "postgres" }
```

`db: false` / `mode: "offline"` means the connection failed — check
`DATABASE_URL`, `DATABASE_SSL` / `DATABASE_CA_CERT`, and that your IP is
allowed by the provider. The reason is in the server log, on the line that
starts `[db] Postgres connection failed`.

## What replaced Supabase?

Supabase's sign-in, storage and realtime services were replaced as below.
Supabase as the **database** is a separate matter and is supported: see
"Using Supabase".

| Before (Supabase) | Now |
| --- | --- |
| Supabase Auth (email + OAuth) | Email/password with bcrypt + Prisma-backed opaque sessions (`src/lib/auth.ts`, `/api/auth/*`) |
| Supabase Storage | Prisma Object Store / any S3-compatible bucket when `S3_*` is set; otherwise local `public/uploads`. Postgres stores `/uploads/<uuid>.<ext>` only. |
| Supabase Realtime chat | HTTP polling every 3s against `/api/messages` (`ChatStream.tsx`) |
| Session-refresh proxy | Not needed — sessions are read and revoked directly through Prisma |

If you later want OAuth (Google/GitHub) or push-based chat, those can be
added provider-independently (e.g. Auth.js / NextAuth for OAuth, WebSockets
or Server-Sent Events for chat).
