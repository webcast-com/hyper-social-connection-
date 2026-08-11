/**
 * Social-graph schema patches, ported from the Supabase "Social Connection
 * Platform" schema (`sql/001_social_connection_schema.sql`) onto this app's
 * actual integer-id Drizzle schema.
 *
 * That original script cannot run here: it uses uuid primary keys and RLS
 * policies keyed on `auth.uid()`, while this app uses `serial` ids and
 * authenticates in Node with a JWT cookie over a single shared pool user.
 * These statements bring across the parts that *are* portable and valuable:
 *
 *   1. `likes` unique (post_id, user_id) — the source schema's UNIQUE
 *      constraint. This app was missing it, so a double-submit or a race in
 *      `toggleLike` (select-then-insert) could store the same like twice and
 *      inflate the "Liked by …" list. Existing duplicates are removed first.
 *   2. `users.username` — the source schema's `profiles.username`. Nullable
 *      and backfilled from the email local-part, so existing rows and the
 *      signup route keep working untouched.
 *   3. `posts.likes_count` / `posts.comments_count` — the source schema's
 *      cached counters, kept in sync by triggers, plus a self-healing
 *      backfill so the values are correct on databases that already have
 *      data (and can never drift).
 *
 * Every statement is idempotent: safe to run on every boot, in any order,
 * against a fresh or long-lived database. Exported as plain strings (this
 * module imports nothing) so the verification harness can execute the exact
 * same DDL the app runs.
 */
export const SOCIAL_DDL: string[] = [
  // ── 1. Deduplicate likes, then enforce one like per (post, user) ─────────
  // Keep the earliest like per pair; drop the rest. No-op once unique.
  `DELETE FROM likes a
     USING likes b
    WHERE a.post_id = b.post_id
      AND a.user_id = b.user_id
      AND a.id > b.id`,
  `CREATE UNIQUE INDEX IF NOT EXISTS likes_post_id_user_id_key
     ON likes (post_id, user_id)`,

  // ── 2. Profile username (source schema: profiles.username) ───────────────
  // Nullable on purpose: the signup route does not supply one, and making it
  // NOT NULL would break inserts. Uniqueness is enforced where present.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS username text`,
  // Backfill from the email local-part, de-collided with the row id.
  // Only touches rows that still have no username.
  `UPDATE users
      SET username = regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')
                     || CASE
                          WHEN EXISTS (
                            SELECT 1 FROM users o
                             WHERE o.id <> users.id
                               AND split_part(o.email, '@', 1) = split_part(users.email, '@', 1)
                          ) THEN users.id::text
                          ELSE ''
                        END
    WHERE username IS NULL
      AND email IS NOT NULL
      AND split_part(email, '@', 1) <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_key
     ON users (username)
     WHERE username IS NOT NULL`,

  // ── 3. Cached counters (source schema: posts.likes_count/comments_count) ─
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count integer DEFAULT 0 NOT NULL`,

  // Counter trigger functions. `search_path` is pinned so the function body
  // always resolves `posts` in the public schema. GREATEST(...,0) mirrors the
  // hardening applied in sql/001 so a count can never go negative.
  `CREATE OR REPLACE FUNCTION update_post_likes_count()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SET search_path = public
   AS $fn$
   BEGIN
     IF TG_OP = 'INSERT' THEN
       UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
     ELSIF TG_OP = 'DELETE' THEN
       UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
     END IF;
     RETURN NULL;
   END;
   $fn$`,
  `CREATE OR REPLACE FUNCTION update_post_comments_count()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SET search_path = public
   AS $fn$
   BEGIN
     IF TG_OP = 'INSERT' THEN
       UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
     ELSIF TG_OP = 'DELETE' THEN
       UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
     END IF;
     RETURN NULL;
   END;
   $fn$`,
  `DROP TRIGGER IF EXISTS trigger_update_likes_count ON likes`,
  `CREATE TRIGGER trigger_update_likes_count
     AFTER INSERT OR DELETE ON likes
     FOR EACH ROW EXECUTE FUNCTION update_post_likes_count()`,
  `DROP TRIGGER IF EXISTS trigger_update_comments_count ON comments`,
  `CREATE TRIGGER trigger_update_comments_count
     AFTER INSERT OR DELETE ON comments
     FOR EACH ROW EXECUTE FUNCTION update_post_comments_count()`,

  // Self-healing backfill/reconciliation. Runs after the triggers are in
  // place and only rewrites rows whose cached value actually disagrees with
  // the underlying table, so it is cheap on every boot and repairs any drift
  // (e.g. rows written before the triggers existed, or a bulk delete).
  `UPDATE posts p
      SET likes_count = c.n
     FROM (SELECT post_id, count(*)::int AS n FROM likes GROUP BY post_id) c
    WHERE p.id = c.post_id
      AND p.likes_count <> c.n`,
  `UPDATE posts p
      SET likes_count = 0
    WHERE p.likes_count <> 0
      AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id)`,
  `UPDATE posts p
      SET comments_count = c.n
     FROM (SELECT post_id, count(*)::int AS n FROM comments GROUP BY post_id) c
    WHERE p.id = c.post_id
      AND p.comments_count <> c.n`,
  `UPDATE posts p
      SET comments_count = 0
    WHERE p.comments_count <> 0
      AND NOT EXISTS (SELECT 1 FROM comments cm WHERE cm.post_id = p.id)`,
];
