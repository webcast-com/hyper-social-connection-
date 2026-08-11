-- ===========================================================================
-- Social Connection Platform Schema  (Supabase / `auth.users` flavour)
-- ===========================================================================
--
-- OPT-IN MIGRATION — NOT RUN BY THE APP.
--
-- The Hyper app itself runs on the Drizzle schema in `src/db/schema.ts`
-- (integer ids, `users` table, JWT cookie auth) and bootstraps it through
-- `src/lib/migrate.ts`. Nothing in the running app reads, imports or executes
-- this file, so adding it changes no page or feature behaviour.
--
-- This script targets a *Supabase* project (or any Postgres that provides the
-- `auth` schema, `auth.uid()` and the `authenticated` role) where you want the
-- uuid-based social graph described below. It refuses to run — loudly, before
-- creating anything — against a database that already hosts the app's Drizzle
-- schema, so it can never corrupt a live Hyper database.
--
-- Run it with:
--   psql "$SUPABASE_DATABASE_URL" -f sql/001_social_connection_schema.sql
-- or copy it into `supabase/migrations/<timestamp>_social_schema.sql` and use
-- `supabase db push`. See sql/README.md for details.
--
-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------
-- Complete database schema for a social networking platform with user
-- profiles, posts, connections and interactions.
--
-- 1. New tables
--    profiles     — user profile information extending Supabase auth.users
--      id           uuid PK        references auth.users
--      username     text unique    user's display name
--      full_name    text           user's full name
--      bio          text           user biography
--      avatar_url   text           profile picture URL
--      created_at   timestamptz    account creation timestamp
--      updated_at   timestamptz    last profile update
--
--    posts        — user-generated content posts
--      id             uuid PK      unique post identifier
--      user_id        uuid FK      post author
--      content        text         post text content
--      image_url      text         optional post image
--      likes_count    integer      cached like count
--      comments_count integer      cached comment count
--      created_at     timestamptz  post creation time
--
--    connections  — user-to-user connection relationships
--      id            uuid PK       unique connection identifier
--      follower_id   uuid FK       user initiating connection
--      following_id  uuid FK       user being followed
--      created_at    timestamptz   connection creation time
--      unique (follower_id, following_id)
--
--    likes        — post like interactions
--      id          uuid PK         unique like identifier
--      user_id     uuid FK         user who liked
--      post_id     uuid FK         liked post
--      created_at  timestamptz     like timestamp
--      unique (user_id, post_id)
--
--    comments     — post comments
--      id          uuid PK         unique comment identifier
--      user_id     uuid FK         comment author
--      post_id     uuid FK         parent post
--      content     text            comment text
--      created_at  timestamptz     comment creation time
--
-- 2. Security — Row Level Security is enabled on every table:
--    profiles     select: everyone · insert/update: own row · delete: nobody
--    posts        select: everyone · insert/update/delete: own rows
--    connections  select: everyone · insert/delete: own rows
--    likes        select: everyone · insert/delete: own rows
--    comments     select: everyone · insert/update/delete: own rows
--
-- 3. Indexes — profile username lookup; post user/creation-time queries;
--    connection follower/following lookups; like post/user queries;
--    comment post queries.
--
-- 4. Important notes
--    - All timestamps use `timestamptz` for timezone awareness.
--    - Foreign keys ensure referential integrity.
--    - Unique constraints prevent duplicate relationships.
--    - Cached counts on posts improve query performance.
--    - RLS policies ensure users can only modify their own data.
--    - The counter triggers are SECURITY DEFINER on purpose: they update
--      *someone else's* post row (liking/commenting on another user's post),
--      which the "users can update their own posts" RLS policy would
--      otherwise silently block, leaving the cached counts stuck at 0.
--    - The whole script is idempotent: re-running it is a no-op.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preflight guards — never touch a database this schema does not fit
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- (a) Supabase auth plumbing must exist: profiles.id references auth.users
  --     and every policy is written against auth.uid().
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION
      'sql/001_social_connection_schema.sql requires the Supabase auth schema (auth.users is missing). Run it against a Supabase project, not the app''s plain-Postgres database.';
  END IF;

  -- (b) Refuse to run on a database holding the app's Drizzle schema, where
  --     posts/likes/comments already exist with integer ids. Creating the
  --     uuid tables there is impossible anyway (CREATE TABLE IF NOT EXISTS
  --     would silently skip them and the uuid foreign keys would explode),
  --     so fail fast and leave the live app untouched.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'id'
      AND data_type <> 'uuid'
  ) THEN
    RAISE EXCEPTION
      'public.posts already exists with a non-uuid primary key (the Hyper Drizzle schema). Aborting so the running app is not corrupted.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- Profiles — extends auth.users with public profile information
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text DEFAULT '',
  bio text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Posts — user-generated content
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  image_url text DEFAULT '',
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Connections — follower / following relationships
CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

-- Likes — post like interactions
CREATE TABLE IF NOT EXISTS likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, post_id)
);

-- Comments — post comments
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_username    ON profiles (username);
CREATE INDEX IF NOT EXISTS idx_posts_user_id        ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at     ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_follower ON connections (follower_id);
CREATE INDEX IF NOT EXISTS idx_connections_following ON connections (following_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id        ON likes (post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id        ON likes (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id     ON comments (post_id);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments    ENABLE ROW LEVEL SECURITY;

-- Profiles ------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No DELETE policy: profiles are removed only by the auth.users cascade.

-- Posts ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create posts" ON posts;
CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own posts" ON posts;
CREATE POLICY "Users can update their own posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own posts" ON posts;
CREATE POLICY "Users can delete their own posts"
  ON posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Connections ---------------------------------------------------------------
DROP POLICY IF EXISTS "Connections are viewable by everyone" ON connections;
CREATE POLICY "Connections are viewable by everyone"
  ON connections FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create connections" ON connections;
CREATE POLICY "Authenticated users can create connections"
  ON connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can delete their own connections" ON connections;
CREATE POLICY "Users can delete their own connections"
  ON connections FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- Likes ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON likes;
CREATE POLICY "Likes are viewable by everyone"
  ON likes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create likes" ON likes;
CREATE POLICY "Authenticated users can create likes"
  ON likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own likes" ON likes;
CREATE POLICY "Users can delete their own likes"
  ON likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Comments ------------------------------------------------------------------
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create comments" ON comments;
CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
CREATE POLICY "Users can update their own comments"
  ON comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
CREATE POLICY "Users can delete their own comments"
  ON comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Cached counters (triggers)
-- ---------------------------------------------------------------------------

-- Keep posts.likes_count in sync with the likes table.
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts
       SET likes_count = likes_count + 1
     WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts
       SET likes_count = GREATEST(likes_count - 1, 0)
     WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Keep posts.comments_count in sync with the comments table.
CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts
       SET comments_count = comments_count + 1
     WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts
       SET comments_count = GREATEST(comments_count - 1, 0)
     WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Touch profiles.updated_at on every profile change.
CREATE OR REPLACE FUNCTION set_profile_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_likes_count ON likes;
CREATE TRIGGER trigger_update_likes_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

DROP TRIGGER IF EXISTS trigger_update_comments_count ON comments;
CREATE TRIGGER trigger_update_comments_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_profile_updated_at();

COMMIT;
