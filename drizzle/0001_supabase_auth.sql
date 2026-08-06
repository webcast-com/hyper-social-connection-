-- Supabase Auth integration: link public.users rows to auth.users.
-- Purely additive — existing rows keep a NULL auth_id and keep working.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_id" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_auth_id_unique" ON "users" ("auth_id");
