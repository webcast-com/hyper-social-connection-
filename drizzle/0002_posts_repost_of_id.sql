-- Repost/share support: posts.repost_of_id links a repost to the original.
-- Purely additive and idempotent — existing rows keep a NULL repost_of_id.
--
-- Without this column, the feed's `SELECT ... repost_of_id ... FROM posts`
-- fails with "column posts.repost_of_id does not exist" and pages silently
-- fall back to demo content even though real posts exist in the database.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "repost_of_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_repost_of_id_posts_id_fk'
  ) THEN
    ALTER TABLE "posts"
      ADD CONSTRAINT "posts_repost_of_id_posts_id_fk"
      FOREIGN KEY ("repost_of_id") REFERENCES "public"."posts"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_repost_of_id_idx" ON "posts" ("repost_of_id");
