# `sql/` — standalone SQL migrations

Hand-written SQL that is **not** part of the running application.

The Hyper app's live schema is the Drizzle schema in [`src/db/schema.ts`](../src/db/schema.ts),
created via `npm run db:push` and self-healed on boot by
[`src/lib/migrate.ts`](../src/lib/migrate.ts). Nothing in `src/` imports,
reads or executes anything in this folder, so files here cannot affect the
front page, the feed, or any other app behaviour.

## Which parts run in this app?

| | Where | Runs in the app? |
| --- | --- | --- |
| Portable parts (likes uniqueness, `users.username`, cached counters) | [`src/db/social-ddl.ts`](../src/db/social-ddl.ts) | **Yes** — applied on boot by `src/lib/migrate.ts` |
| Full uuid + RLS schema | `001_social_connection_schema.sql` (this folder) | No — Supabase only |

See the "Ported into the app" section at the bottom for what was brought
across and why the rest could not be.

## `001_social_connection_schema.sql`

The uuid-based **Social Connection Platform** schema: `profiles`, `posts`,
`connections`, `likes`, `comments` — with Row Level Security policies,
indexes, and cached `likes_count` / `comments_count` counter triggers.

> ⚠️ **This targets Supabase, not the app's database.**
> It requires the `auth` schema (`auth.users`, `auth.uid()`) and the
> `authenticated` role, and its `posts` / `likes` / `comments` tables use
> `uuid` primary keys — incompatible with the app's integer-id tables of the
> same names. Applying it to the database behind `DATABASE_URL` is **not**
> supported.

Two preflight guards at the top of the script enforce that. It aborts, before
creating anything, when:

1. `auth.users` does not exist (i.e. not a Supabase project), or
2. `public.posts` already exists with a non-uuid primary key (i.e. the Hyper
   Drizzle schema is present).

The whole file runs inside `BEGIN`/`COMMIT`, so an abort leaves zero partial
objects behind.

### Applying it

Against a Supabase project (a *separate* database from the app's):

```bash
psql "$SUPABASE_DATABASE_URL" -f sql/001_social_connection_schema.sql
```

or, with the Supabase CLI:

```bash
cp sql/001_social_connection_schema.sql \
   supabase/migrations/$(date +%Y%m%d%H%M%S)_social_schema.sql
supabase db push
```

Re-running is safe: every statement is `IF NOT EXISTS` / `CREATE OR REPLACE` /
`DROP … IF EXISTS`-guarded.

### Notes on deviations from a naive translation

- **Counter triggers are `SECURITY DEFINER`.** They update *another user's*
  post row when you like or comment on it. Under the "users can update their
  own posts" RLS policy an invoker-rights trigger would silently match zero
  rows and the cached counts would stay at `0` forever. `SET search_path =
  public` is attached so the elevated function cannot be hijacked by a
  search-path attack.
- **Decrements use `GREATEST(x - 1, 0)`** so the cached counters can never go
  negative if rows are ever removed out of band.
- **`profiles.updated_at`** is maintained by a `BEFORE UPDATE` trigger rather
  than relying on clients to set it.

### Verifying it

An executable spec runs the migration against a real in-process Postgres
(PGlite) with a stand-in for Supabase's `auth` schema, then asserts the
tables, columns, indexes, constraints, RLS behaviour, counter triggers,
cascades and both preflight guards — 88 checks:

```bash
npm i --no-save @electric-sql/pglite
node sql/__tests__/verify-schema.mjs
```

```
✅ ALL CHECKS PASSED — 88 passed, 0 failed
```

PGlite is intentionally *not* added to `package.json`: the app does not need
it, and installing it with `--no-save` keeps the dependency tree unchanged.

## Ported into the app

The three parts of the source schema that *are* compatible with this app's
integer-id tables now ship in [`src/db/social-ddl.ts`](../src/db/social-ddl.ts)
and are applied on every cold boot by `src/lib/migrate.ts`:

1. **`likes` UNIQUE (post_id, user_id)** — the source schema's unique
   constraint. This app was missing it, so the select-then-insert in
   `toggleLike` could store the same like twice on a double-click or race and
   inflate the "Liked by …" list. Pre-existing duplicates are deleted first
   (earliest row wins), then the index is created. `toggleLike` now uses
   `onConflictDoNothing`, and only sends a notification when the like was
   actually created — so a duplicate click can no longer spam the post owner.
2. **`users.username`** — the source schema's `profiles.username`. Nullable
   (the signup route does not supply one) with a *partial* unique index so
   many NULLs stay legal, backfilled from the email local-part and
   de-collided with the row id.
3. **`posts.likes_count` / `posts.comments_count`** — the cached counters plus
   their triggers, with `GREATEST(x-1, 0)` so they cannot go negative, and a
   reconciliation pass that repairs any drift on boot.

These are **additive**. The feed still reads `post.likes` as an array of rows
to render liker avatars and compute `isLiked`, so the counters are an extra
fast path, not a replacement.

What could *not* be ported: the RLS policies. They are all `auth.uid() =
user_id`, but this app authenticates in Node with a JWT cookie and talks to
Postgres through one shared pool user, so `auth.uid()` would be `NULL` and
every policy would deny — blanking the entire feed.

Verified by an end-to-end harness that builds this app's real tables, seeds
them *with duplicate likes*, and applies the exact `SOCIAL_DDL` array the app
imports — 40 checks:

```bash
npm i --no-save @electric-sql/pglite
node --experimental-strip-types sql/__tests__/verify-app-social-ddl.mjs
```

```
✅ ALL CHECKS PASSED — 40 passed, 0 failed
```
