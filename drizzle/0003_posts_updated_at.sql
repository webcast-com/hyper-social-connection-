-- Edit-post support: posts.updated_at is NULL until the author edits a post,
-- and the UI shows an "Edited" marker when it is set.
-- Purely additive and idempotent — safe to re-run on existing databases.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;
