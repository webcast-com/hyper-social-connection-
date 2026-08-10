-- ============================================================================
-- Hyper social network — Minimal Supabase setup
-- ============================================================================
-- ONE-STEP MINIMAL SETUP FILE
-- Run this file in the Supabase SQL Editor to provision the core app setup:
--   1) public schema and app tables
--   2) auth/profile backfill + trigger
--   3) indexes and duplicate cleanup
--   4) Row Level Security policies
--   5) Realtime publication setup
--
-- WHAT THIS EXCLUDES
--   * Storage bucket creation and storage policies.
--   * If you want uploads/media too, run `supabase/storage.sql` afterwards,
--     or use `supabase/setup.sql` instead.
--
-- SAFE TO RE-RUN
--   * All included scripts are written to be idempotent.
--   * Existing tables/data are preserved.
--   * Duplicate likes/bookmarks/poll-vote rows may be removed so the unique
--     indexes required by the app can be created safely.
--
-- Source files included below, in execution order:
--   * supabase/schema.sql
--   * supabase/policies.sql
-- ============================================================================

-- ============================================================================
-- BEGIN supabase/schema.sql — SCHEMA + AUTH BACKFILL + INDEXES
-- ============================================================================

-- ============================================================================
-- Hyper social network — Supabase schema (15 public tables)
-- ============================================================================
-- Generated from the app's current data model and hardened for Supabase.
-- Run this in the Supabase SQL Editor: Dashboard → SQL Editor → New query.
--
-- WHAT THIS DOES
--   * Creates every public table the app uses.
--   * Repairs older databases by adding newer columns (`auth_id`,
--     `repost_of_id`, `updated_at`, `group_id`) when they are missing.
--   * Backfills `public.users` rows from `auth.users` and installs a trigger
--     so future Supabase Auth sign-ups stay linked automatically.
--   * Cleans up duplicate likes/bookmarks/poll votes before creating the
--     unique indexes those features should always have.
--   * Adds practical indexes for the queries this app runs most often.
--
-- SAFE TO RE-RUN
--   * No DROP TABLE / TRUNCATE.
--   * All CREATE/ALTER statements are idempotent.
--   * The only data-changing statements remove duplicate likes/bookmarks/
--     poll-vote rows so uniqueness can be enforced correctly.
--
-- After this, also run:
--   1) `supabase/policies.sql`  — RLS + Realtime
--   2) `supabase/storage.sql`   — media bucket + storage policies
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id serial PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  avatar text,
  cover_photo text,
  bio text,
  auth_id uuid,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.groups (
  id serial PRIMARY KEY NOT NULL,
  name text NOT NULL,
  description text,
  cover_photo text,
  admin_id integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT groups_admin_id_users_id_fk
    FOREIGN KEY (admin_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.posts (
  id serial PRIMARY KEY NOT NULL,
  user_id integer NOT NULL,
  content text NOT NULL,
  image_url text,
  video_url text,
  privacy text DEFAULT 'public' NOT NULL,
  repost_of_id integer,
  group_id integer,
  updated_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT posts_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT posts_repost_of_id_posts_id_fk
    FOREIGN KEY (repost_of_id) REFERENCES public.posts(id)
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT posts_group_id_groups_id_fk
    FOREIGN KEY (group_id) REFERENCES public.groups(id)
    ON DELETE set null ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.stories (
  id serial PRIMARY KEY NOT NULL,
  user_id integer NOT NULL,
  image_url text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT stories_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id integer NOT NULL,
  user_id integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT group_members_group_id_user_id_pk PRIMARY KEY (group_id, user_id),
  CONSTRAINT group_members_group_id_groups_id_fk
    FOREIGN KEY (group_id) REFERENCES public.groups(id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT group_members_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.comments (
  id serial PRIMARY KEY NOT NULL,
  post_id integer NOT NULL,
  user_id integer NOT NULL,
  content text NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT comments_post_id_posts_id_fk
    FOREIGN KEY (post_id) REFERENCES public.posts(id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT comments_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.likes (
  id serial PRIMARY KEY NOT NULL,
  post_id integer NOT NULL,
  user_id integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT likes_post_id_posts_id_fk
    FOREIGN KEY (post_id) REFERENCES public.posts(id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT likes_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id integer NOT NULL,
  following_id integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT follows_follower_id_following_id_pk PRIMARY KEY (follower_id, following_id),
  CONSTRAINT follows_follower_id_users_id_fk
    FOREIGN KEY (follower_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT follows_following_id_users_id_fk
    FOREIGN KEY (following_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.messages (
  id serial PRIMARY KEY NOT NULL,
  sender_id integer NOT NULL,
  receiver_id integer NOT NULL,
  content text NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT messages_sender_id_users_id_fk
    FOREIGN KEY (sender_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT messages_receiver_id_users_id_fk
    FOREIGN KEY (receiver_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id serial PRIMARY KEY NOT NULL,
  user_id integer NOT NULL,
  actor_id integer NOT NULL,
  type text NOT NULL,
  post_id integer,
  message_id integer,
  is_read integer DEFAULT 0 NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT notifications_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT notifications_actor_id_users_id_fk
    FOREIGN KEY (actor_id) REFERENCES public.users(id)
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT notifications_post_id_posts_id_fk
    FOREIGN KEY (post_id) REFERENCES public.posts(id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT notifications_message_id_messages_id_fk
    FOREIGN KEY (message_id) REFERENCES public.messages(id)
    ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id serial PRIMARY KEY NOT NULL,
  user_id integer NOT NULL,
  post_id integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT bookmarks_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT bookmarks_post_id_posts_id_fk
    FOREIGN KEY (post_id) REFERENCES public.posts(id)
    ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.reports (
  id serial PRIMARY KEY NOT NULL,
  reporter_id integer NOT NULL,
  post_id integer,
  reason text NOT NULL,
  details text,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT reports_reporter_id_users_id_fk
    FOREIGN KEY (reporter_id) REFERENCES public.users(id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT reports_post_id_posts_id_fk
    FOREIGN KEY (post_id) REFERENCES public.posts(id)
    ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.polls (
  id serial PRIMARY KEY NOT NULL,
  post_id integer NOT NULL,
  question text,
  expires_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT polls_post_id_posts_id_fk
    FOREIGN KEY (post_id) REFERENCES public.posts(id)
    ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id serial PRIMARY KEY NOT NULL,
  poll_id integer NOT NULL,
  text text NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT poll_options_poll_id_polls_id_fk
    FOREIGN KEY (poll_id) REFERENCES public.polls(id)
    ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id serial PRIMARY KEY NOT NULL,
  poll_id integer NOT NULL,
  option_id integer NOT NULL,
  user_id integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT poll_votes_poll_id_polls_id_fk
    FOREIGN KEY (poll_id) REFERENCES public.polls(id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT poll_votes_option_id_poll_options_id_fk
    FOREIGN KEY (option_id) REFERENCES public.poll_options(id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT poll_votes_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE cascade ON UPDATE no action
);

-- ---------------------------------------------------------------------------
-- 2. Patch older databases that were created before newer columns/features
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_id_unique ON public.users (auth_id);

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS repost_of_id integer;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS updated_at timestamp;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS group_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_repost_of_id_posts_id_fk'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_repost_of_id_posts_id_fk
      FOREIGN KEY (repost_of_id) REFERENCES public.posts(id)
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_group_id_groups_id_fk'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_group_id_groups_id_fk
      FOREIGN KEY (group_id) REFERENCES public.groups(id)
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Duplicate cleanup before uniqueness is enforced
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY post_id, user_id ORDER BY id) AS rn
  FROM public.likes
)
DELETE FROM public.likes l
USING ranked r
WHERE l.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, post_id ORDER BY id) AS rn
  FROM public.bookmarks
)
DELETE FROM public.bookmarks b
USING ranked r
WHERE b.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY poll_id, user_id
           ORDER BY created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.poll_votes
)
DELETE FROM public.poll_votes pv
USING ranked r
WHERE pv.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS likes_post_id_user_id_unique
  ON public.likes (post_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_id_post_id_unique
  ON public.bookmarks (user_id, post_id);

CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_poll_id_user_id_unique
  ON public.poll_votes (poll_id, user_id);

-- ---------------------------------------------------------------------------
-- 4. Backfill/link public.users rows from auth.users and keep them in sync
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  derived_name text;
  derived_avatar text;
  derived_email text;
BEGIN
  derived_name := COALESCE(
    NULLIF(BTRIM(COALESCE(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')), ''),
    SPLIT_PART(COALESCE(new.email, new.id::text), '@', 1),
    'Hyper user'
  );

  derived_avatar := NULLIF(
    BTRIM(COALESCE(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')),
    ''
  );

  derived_email := COALESCE(new.email, new.id::text || '@hyper.local');

  INSERT INTO public.users (name, email, password, avatar, auth_id)
  VALUES (derived_name, derived_email, '', derived_avatar, new.id)
  ON CONFLICT (email) DO UPDATE
  SET auth_id = EXCLUDED.auth_id,
      avatar = COALESCE(users.avatar, EXCLUDED.avatar),
      name = CASE
        WHEN COALESCE(BTRIM(users.name), '') = '' THEN EXCLUDED.name
        ELSE users.name
      END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_created();

INSERT INTO public.users (name, email, password, avatar, auth_id)
SELECT
  COALESCE(
    NULLIF(BTRIM(COALESCE(au.raw_user_meta_data ->> 'name', au.raw_user_meta_data ->> 'full_name', '')), ''),
    SPLIT_PART(COALESCE(au.email, au.id::text), '@', 1),
    'Hyper user'
  ) AS name,
  COALESCE(au.email, au.id::text || '@hyper.local') AS email,
  '' AS password,
  NULLIF(
    BTRIM(COALESCE(au.raw_user_meta_data ->> 'avatar_url', au.raw_user_meta_data ->> 'picture', '')),
    ''
  ) AS avatar,
  au.id AS auth_id
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users u
  WHERE u.auth_id = au.id
)
ON CONFLICT (email) DO UPDATE
SET auth_id = EXCLUDED.auth_id,
    avatar = COALESCE(users.avatar, EXCLUDED.avatar),
    name = CASE
      WHEN COALESCE(BTRIM(users.name), '') = '' THEN EXCLUDED.name
      ELSE users.name
    END;

-- ---------------------------------------------------------------------------
-- 5. Performance indexes for the app's main queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS posts_created_at_idx
  ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_user_id_created_at_idx
  ON public.posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_repost_of_id_idx
  ON public.posts (repost_of_id);
CREATE INDEX IF NOT EXISTS posts_group_id_created_at_idx
  ON public.posts (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stories_user_id_idx
  ON public.stories (user_id);
CREATE INDEX IF NOT EXISTS stories_expires_at_idx
  ON public.stories (expires_at);

CREATE INDEX IF NOT EXISTS groups_admin_id_idx
  ON public.groups (admin_id);
CREATE INDEX IF NOT EXISTS group_members_user_id_idx
  ON public.group_members (user_id);

CREATE INDEX IF NOT EXISTS comments_post_id_created_at_idx
  ON public.comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_user_id_idx
  ON public.comments (user_id);

CREATE INDEX IF NOT EXISTS likes_user_id_idx
  ON public.likes (user_id);

CREATE INDEX IF NOT EXISTS follows_following_id_idx
  ON public.follows (following_id);

CREATE INDEX IF NOT EXISTS messages_sender_receiver_created_at_idx
  ON public.messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_receiver_sender_created_at_idx
  ON public.messages (receiver_id, sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_is_read_created_at_idx
  ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_actor_id_idx
  ON public.notifications (actor_id);

CREATE INDEX IF NOT EXISTS bookmarks_post_id_idx
  ON public.bookmarks (post_id);

CREATE INDEX IF NOT EXISTS reports_reporter_id_idx
  ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS reports_post_id_idx
  ON public.reports (post_id);

CREATE INDEX IF NOT EXISTS polls_post_id_idx
  ON public.polls (post_id);
CREATE INDEX IF NOT EXISTS poll_options_poll_id_position_idx
  ON public.poll_options (poll_id, position);
CREATE INDEX IF NOT EXISTS poll_votes_option_id_idx
  ON public.poll_votes (option_id);
CREATE INDEX IF NOT EXISTS poll_votes_user_id_idx
  ON public.poll_votes (user_id);

-- ---------------------------------------------------------------------------
-- 6. Verify — should list all 15 public tables
-- ---------------------------------------------------------------------------
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;


-- ============================================================================
-- BEGIN supabase/policies.sql — RLS + REALTIME
-- ============================================================================

-- ============================================================================
-- Hyper social network — Row Level Security + Realtime
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER `supabase/schema.sql`.
--
-- WHAT THIS DOES
--   * Enables RLS on all 15 public tables.
--   * Keeps public profile/feed reads open where the app expects them.
--   * Restricts writes to the signed-in owner (or group admin where needed).
--   * Publishes the app's live-updating tables to Supabase Realtime.
--
-- SAFE TO RE-RUN
--   * Policies are dropped and recreated each time.
--   * The server-side drizzle/pg connection uses the postgres role and still
--     bypasses RLS, so existing server-rendered pages keep working.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enable RLS everywhere
-- ---------------------------------------------------------------------------
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. users — profiles are public; only the owner edits their own row
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT
  WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "users_delete_own" ON public.users;
CREATE POLICY "users_delete_own" ON public.users
  FOR DELETE
  USING (auth_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. groups / posts / stories / group_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "groups_insert_admin" ON public.groups;
CREATE POLICY "groups_insert_admin" ON public.groups
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = groups.admin_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "groups_update_admin" ON public.groups;
CREATE POLICY "groups_update_admin" ON public.groups
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = groups.admin_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = groups.admin_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "groups_delete_admin" ON public.groups;
CREATE POLICY "groups_delete_admin" ON public.groups
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = groups.admin_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "posts_select" ON public.posts;
CREATE POLICY "posts_select" ON public.posts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = posts.user_id
        AND u.auth_id = auth.uid()
    )
    AND (
      posts.group_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = posts.group_id
          AND gm.user_id = posts.user_id
      )
    )
  );

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own" ON public.posts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = posts.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = posts.user_id
        AND u.auth_id = auth.uid()
    )
    AND (
      posts.group_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = posts.group_id
          AND gm.user_id = posts.user_id
      )
    )
  );

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own" ON public.posts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = posts.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "stories_select" ON public.stories;
CREATE POLICY "stories_select" ON public.stories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "stories_insert_own" ON public.stories;
CREATE POLICY "stories_insert_own" ON public.stories
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = stories.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "stories_update_own" ON public.stories;
CREATE POLICY "stories_update_own" ON public.stories
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = stories.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = stories.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "stories_delete_own" ON public.stories;
CREATE POLICY "stories_delete_own" ON public.stories
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = stories.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "group_members_insert_manage" ON public.group_members;
CREATE POLICY "group_members_insert_manage" ON public.group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = group_members.user_id
        AND u.auth_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.groups g
      JOIN public.users u ON u.id = g.admin_id
      WHERE g.id = group_members.group_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "group_members_delete_manage" ON public.group_members;
CREATE POLICY "group_members_delete_manage" ON public.group_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = group_members.user_id
        AND u.auth_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.groups g
      JOIN public.users u ON u.id = g.admin_id
      WHERE g.id = group_members.group_id
        AND u.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. comments / likes / follows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = comments.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = comments.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = comments.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = comments.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "likes_select" ON public.likes;
CREATE POLICY "likes_select" ON public.likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
CREATE POLICY "likes_insert_own" ON public.likes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = likes.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "likes_delete_own" ON public.likes;
CREATE POLICY "likes_delete_own" ON public.likes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = likes.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "follows_select" ON public.follows;
CREATE POLICY "follows_select" ON public.follows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "follows_insert_own" ON public.follows;
CREATE POLICY "follows_insert_own" ON public.follows
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = follows.follower_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "follows_delete_own" ON public.follows;
CREATE POLICY "follows_delete_own" ON public.follows
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = follows.follower_id
        AND u.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. messages / notifications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "messages_select_conversation" ON public.messages;
CREATE POLICY "messages_select_conversation" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = messages.sender_id
        AND u.auth_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = messages.receiver_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender" ON public.messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = messages.sender_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages_delete_sender" ON public.messages;
CREATE POLICY "messages_delete_sender" ON public.messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = messages.sender_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = notifications.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = notifications.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = notifications.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = notifications.user_id
        AND u.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. bookmarks / reports
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bookmarks_select_own" ON public.bookmarks;
CREATE POLICY "bookmarks_select_own" ON public.bookmarks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = bookmarks.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bookmarks_insert_own" ON public.bookmarks;
CREATE POLICY "bookmarks_insert_own" ON public.bookmarks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = bookmarks.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bookmarks_delete_own" ON public.bookmarks;
CREATE POLICY "bookmarks_delete_own" ON public.bookmarks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = bookmarks.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = reports.reporter_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = reports.reporter_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reports_delete_own" ON public.reports;
CREATE POLICY "reports_delete_own" ON public.reports
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = reports.reporter_id
        AND u.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. polls / poll_options / poll_votes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "polls_select" ON public.polls;
CREATE POLICY "polls_select" ON public.polls
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "polls_insert_own" ON public.polls;
CREATE POLICY "polls_insert_own" ON public.polls
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      JOIN public.users u ON u.id = p.user_id
      WHERE p.id = polls.post_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "polls_update_own" ON public.polls;
CREATE POLICY "polls_update_own" ON public.polls
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      JOIN public.users u ON u.id = p.user_id
      WHERE p.id = polls.post_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      JOIN public.users u ON u.id = p.user_id
      WHERE p.id = polls.post_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "polls_delete_own" ON public.polls;
CREATE POLICY "polls_delete_own" ON public.polls
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      JOIN public.users u ON u.id = p.user_id
      WHERE p.id = polls.post_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "poll_options_select" ON public.poll_options;
CREATE POLICY "poll_options_select" ON public.poll_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "poll_options_insert_own" ON public.poll_options;
CREATE POLICY "poll_options_insert_own" ON public.poll_options
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.polls p
      JOIN public.posts post_row ON post_row.id = p.post_id
      JOIN public.users u ON u.id = post_row.user_id
      WHERE p.id = poll_options.poll_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "poll_options_update_own" ON public.poll_options;
CREATE POLICY "poll_options_update_own" ON public.poll_options
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.polls p
      JOIN public.posts post_row ON post_row.id = p.post_id
      JOIN public.users u ON u.id = post_row.user_id
      WHERE p.id = poll_options.poll_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.polls p
      JOIN public.posts post_row ON post_row.id = p.post_id
      JOIN public.users u ON u.id = post_row.user_id
      WHERE p.id = poll_options.poll_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "poll_options_delete_own" ON public.poll_options;
CREATE POLICY "poll_options_delete_own" ON public.poll_options
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.polls p
      JOIN public.posts post_row ON post_row.id = p.post_id
      JOIN public.users u ON u.id = post_row.user_id
      WHERE p.id = poll_options.poll_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "poll_votes_select" ON public.poll_votes;
CREATE POLICY "poll_votes_select" ON public.poll_votes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "poll_votes_insert_own" ON public.poll_votes;
CREATE POLICY "poll_votes_insert_own" ON public.poll_votes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = poll_votes.user_id
        AND u.auth_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.poll_options po
      WHERE po.id = poll_votes.option_id
        AND po.poll_id = poll_votes.poll_id
    )
  );

DROP POLICY IF EXISTS "poll_votes_update_own" ON public.poll_votes;
CREATE POLICY "poll_votes_update_own" ON public.poll_votes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = poll_votes.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = poll_votes.user_id
        AND u.auth_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.poll_options po
      WHERE po.id = poll_votes.option_id
        AND po.poll_id = poll_votes.poll_id
    )
  );

DROP POLICY IF EXISTS "poll_votes_delete_own" ON public.poll_votes;
CREATE POLICY "poll_votes_delete_own" ON public.poll_votes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = poll_votes.user_id
        AND u.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Realtime publication
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.messages',
    'public.posts',
    'public.likes',
    'public.comments',
    'public.notifications',
    'public.poll_votes'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication
      WHERE pubname = 'supabase_realtime'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = split_part(t, '.', 2)
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    END IF;
  END LOOP;
END $$;

-- Verify
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

