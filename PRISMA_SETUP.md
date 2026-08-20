# Prisma setup — status

**Prisma is the app's data layer.** Every query in `src/` goes through the
generated Prisma Client (`generated/prisma`, via the `@prisma/adapter-pg`
driver adapter). The previous Drizzle layer and all Supabase remnants were
removed; the tables themselves are unchanged, so existing databases keep
working as-is.

## Layout

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` | Canonical schema — all 18 tables, including the auth set (User/Session/Account/VerificationToken). camelCase fields `@map` to the physical snake_case columns |
| `src/lib/prisma.ts` | Prisma Client singleton + `hasDatabase` offline flag + `ensureDbConnection()` probe |
| `src/lib/migrate.ts` | Idempotent boot DDL (`CREATE TABLE IF NOT EXISTS …`, triggers/functions Prisma can't express) |
| `src/lib/social-ddl.ts` | Trigger/counter patches applied by migrate on every boot |
| `src/lib/seed.ts` | Boot auto-seed (runs when the database is empty) |
| `prisma/seed.ts` | CLI seed (`npm run db:seed`) — upserts the demo users |
| `prisma/auth-tables.sql` | Hand-appliable DDL identical to `db push` output for the auth tables |
| `scripts/verify-prisma.ts` | One read; prints `✅ Connected` or the exact error (`npm run db:verify`) |

## Commands

```bash
npx prisma generate          # generate the client (required once per clone)
npm run db:push              # sync database with prisma/schema.prisma
npm run db:seed              # upsert demo users
npm run db:verify            # connectivity check
npm run db:local             # zero-Docker local Postgres (see DATABASE.md)
```

## Sandbox notes

Outbound HTTPS to `binaries.prisma.sh` is blocked in this sandbox, which makes
the Prisma CLI think it cannot run. `prisma generate` doesn't actually need
the schema engine — start it with:

```bash
PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate
```

`prisma db push` really does need the engine binary, so from this sandbox let
the app's boot DDL create/migrate the schema instead (it runs automatically on
the first request), or run `db push` from an unrestricted network. Remote
Prisma Postgres (`db.prisma.io:5432`) is also TCP-blocked here — use
`npm run db:local` and point `DATABASE_URL` at it for local development.

## Auth tables

`User` maps onto the same `users` table the app has always used (one table,
one ORM now). `Session` / `Account` / `VerificationToken` follow the standard
Auth.js-compatible shape for server-side sessions, OAuth linking, and
email-verification tokens — ready for Auth.js/NextAuth if you want to adopt it.
The app's current login (bcrypt + JWT cookie) reads the same `users` table.
