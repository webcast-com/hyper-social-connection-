-- Close Supabase's Data API to this app's tables.
--
-- Supabase puts an HTTP API in front of the `public` schema. Anyone holding
-- the project's public ("anon") key can read a table through it when that
-- key's role has been granted the table and row level security is off. This
-- app never uses that API: it reads and writes through its own server with
-- the database password. Its tables (users and their password hashes,
-- sessions, messages) must not be reachable any other way.
--
-- This script takes away what the API roles (`anon`, `authenticated`) were
-- granted on the schema's tables, sequences and functions, and stops tables
-- created later from being granted to them. Without a grant the API cannot
-- touch a table at all.
--
-- It does not turn on row level security: Prisma compares each table with the
-- schema in this repository, and a table with row level security switched on
-- no longer matches (`prisma db verify` fails). Supabase's security advisor
-- may therefore still list these tables under "RLS disabled"; with the grants
-- removed that warning has no effect.
--
-- The app is not affected: it connects with the database password as the role
-- that owns the tables.
--
-- Safe to run again at any time. On a database that has no `anon` or
-- `authenticated` role (anything that is not Supabase) it does nothing.
--
--   npm run db:lockdown
--
-- or paste it into the Supabase SQL editor.

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
