# Full Supabase Integration — Setup Guide

The app ships in two modes:

| Mode | When | Auth | Media uploads | Chat |
| --- | --- | --- | --- | --- |
| **Offline / demo** | no env vars | legacy JWT + demo accounts (`demo1234`) | local `public/uploads/` | page refresh |
| **Full Supabase** | `SUPABASE_URL` + `SUPABASE_ANON_KEY` (+ `DATABASE_URL`) | Supabase Auth (email/password + Google/GitHub) | Supabase Storage (`uploads` bucket) | Supabase Realtime (live) |

The UI, routes and features (posts, comments, likes, follows, messages,
profiles, groups, stories, notifications) are identical in both modes —
integration adds Supabase underneath without changing the app's behavior.

---

## 1. Create the database tables

Run **`supabase/schema.sql`** in the Supabase SQL Editor
(Dashboard → SQL Editor → New query → paste → Run).

It creates all 10 tables plus the new `users.auth_id` column that links
profiles to Supabase Auth. It is additive and safe to re-run.

> Alternative: run `npx drizzle-kit push` with `DATABASE_URL` set — drizzle
> will apply `src/db/schema.ts` (including `auth_id`). Then run
> `supabase/schema.sql`'s unique index statement, or `drizzle/0001_supabase_auth.sql`.

## 2. Enable Row Level Security + Realtime

Run **`supabase/policies.sql`** in the SQL Editor.

* Enables RLS on all tables with sensible policies:
  * Profiles, posts, comments, likes, follows, groups: public reads,
    owner-only writes (ownership via `users.auth_id = auth.uid()`).
  * Messages: only the two participants can read/write.
  * Notifications: only the recipient can read/update.
* Publishes `messages` (plus posts/likes/comments/notifications) to the
  Realtime publication for live chat.

The server-side query layer (`DATABASE_URL` / drizzle) connects as the
`postgres` role and bypasses RLS, so existing pages are unaffected.

## 3. Create the storage bucket

Run **`supabase/storage.sql`** in the SQL Editor (creates the public
`uploads` bucket + policies), **or** set `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local` and the server will create the bucket on first upload.

## 4. Configure the app

```bash
cp .env.example .env.local
```

Fill in at minimum:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon public key>
DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
```

Optional:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # auto-creates the storage bucket
SUPABASE_STORAGE_BUCKET=uploads
NEXT_PUBLIC_SITE_URL=https://your-domain.com    # OAuth email redirects
```

Restart the dev server after changing env vars.

## 5. Enable OAuth providers (optional)

Supabase Dashboard → Authentication → Providers → enable **Google** and/or
**GitHub**, and add your app's origin:

* Site URL: `http://localhost:3000` (or your deployed origin)
* Redirect URLs: `http://localhost:3000/api/auth/callback`
  (and the production equivalent)

The login page shows "Continue with Google / GitHub" buttons automatically.

## 6. Email confirmation (optional)

By default Supabase asks new sign-ups to confirm their email
(Authentication → Sign In / Up → Email → "Confirm email"). The signup page
shows a "check your email" message in that case. Disable it to sign in
instantly after sign-up.

## 7. Demo accounts

Demo users (`alex@demo.com` … `zara@demo.com`, password `demo1234`) live in
the `users` table. In full mode they still sign in through the legacy bcrypt
fallback (they are not Supabase Auth accounts). Real sign-ups use Supabase
Auth and get a linked `users` row automatically.

## How it's wired

```
Browser ── login/signup ──► /api/auth/* ──► Supabase Auth (JWT in cookies)
Browser ── actions ──────► Server Actions (drizzle → Supabase Postgres)
Browser ── uploads ──────► /api/upload ──► Supabase Storage (uploads bucket)
Browser ── chat ─────────► Realtime (postgres_changes on messages)
Proxy (src/proxy.ts) ──── refreshes Supabase session cookies on every request
```

Key files:

* `src/lib/supabase/config.ts` — URL/key resolution + `isSupabaseConfigured`
* `src/lib/supabase/server.ts` — cookie-aware server client
* `src/lib/supabase/client.ts` — browser client (@supabase/ssr)
* `src/lib/supabase/middleware.ts` + `src/proxy.ts` — session refresh
* `src/lib/supabase/profile.ts` — links `auth.users` ↔ `public.users`
* `src/lib/viewer.ts` — resolves the signed-in user (Supabase first, JWT/demo fallback)
* `src/app/api/auth/{login,signup,logout,callback}/route.ts` — auth endpoints
* `src/lib/storage.ts` + `src/app/api/upload/route.ts` — storage uploads
* `src/components/Chat/ChatStream.tsx` — realtime chat
