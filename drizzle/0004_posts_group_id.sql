-- Group posts: posts.group_id scopes a post to a community (NULL = regular
-- feed post). ON DELETE SET NULL keeps posts alive when a group is deleted.
-- Purely additive and idempotent — safe to re-run on existing databases.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "group_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_group_id_groups_id_fk'
  ) THEN
    ALTER TABLE "posts"
      ADD CONSTRAINT "posts_group_id_groups_id_fk"
      FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_group_id_idx" ON "posts" ("group_id");
