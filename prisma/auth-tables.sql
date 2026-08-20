-- Authentication tables for the Prisma schema (prisma/schema.prisma).
--
-- This is byte-identical to what `npx prisma db push` generates for the
-- User/Session/Account/VerificationToken models, with IF NOT EXISTS added so
-- it is safe to re-run by hand. `prisma db push` on a database where this
-- script ran is a no-op (no drift).
--
-- NOTE: `users` is NOT created here — the app's Drizzle layer already creates
-- it (src/lib/migrate.ts boot DDL), and the Prisma User model is column-for-
-- column identical, so Prisma never alters it. Run against an empty database?
-- Let the app boot once first (it creates `users`), or copy the users DDL
-- from src/lib/migrate.ts.

-- create table "sessions" ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" SERIAL PRIMARY KEY,
    "session_token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- alter table "sessions" ---------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_session_token_key" ON "sessions"("session_token");
DO $$ BEGIN
    ALTER TABLE "sessions"
        ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
        ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");

-- create table "accounts" ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "accounts" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT
);

-- alter table "accounts" ---------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_provider_account_id_key"
    ON "accounts"("provider", "provider_account_id");
DO $$ BEGIN
    ALTER TABLE "accounts"
        ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
        ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts"("user_id");

-- create table "verification_tokens" ---------------------------------------
CREATE TABLE IF NOT EXISTS "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier", "token")
);

-- alter table "verification_tokens" ----------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_token_key" ON "verification_tokens"("token");
