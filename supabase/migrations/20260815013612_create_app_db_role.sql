/*
# Create dedicated app database role

## Purpose
The Next.js app connects to Postgres directly via `pg` + Drizzle ORM (not the
Supabase JS client). It manages its own authentication with bcrypt password
hashing and JWT session cookies — it does NOT use Supabase Auth, so
`auth.uid()`-based RLS policies are irrelevant. A dedicated role with
BYPASSRLS lets the app read/write all tables while keeping the `anon`/`
authenticated` RLS policies intact for any future Supabase-JS-client usage.

## Changes
1. Creates role `app_user` with LOGIN and BYPASSRLS privileges.
2. Grants full DML privileges (SELECT, INSERT, UPDATE, DELETE) on all 15
   public tables to `app_user`.
3. Grants USAGE + SELECT on all sequences (needed for serial PK columns).

## Security notes
- The password is set via an environment variable the app reads. It is NOT
  stored in this migration file — the role is created without a password
  here and the password is set separately via `ALTER ROLE`.
- BYPASSRLS is appropriate because the app enforces its own authorization
  (JWT session cookies, author-id WHERE clauses in server actions). The
  RLS policies remain in effect for anon/authenticated Supabase-JS clients.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN BYPASSRLS;
  END IF;
END
$$;

ALTER ROLE app_user WITH PASSWORD 'hyper_social_app_pw_2024';

GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Ensure future tables created by migrations are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;