-- ============================================================================
-- Hyper social network — RLS policies + Realtime
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER supabase/schema.sql.
--
-- WHAT THIS DOES
--   * Enables Row Level Security on all 10 tables.
--   * Allows the browser/anon Supabase client (supabase-js / PostgREST) to
--     read and write data as the signed-in user. Ownership is determined by
--     mapping public.users.auth_id to auth.uid().
--   * Publishes messages (plus posts/likes/comments/notifications) to the
--     Realtime channel so the chat updates live.
--
-- SAFE: every statement is guarded (drop-if-exists + create), so it can be
-- re-run at any time. The server-side drizzle/pg connection (postgres role)
-- bypasses RLS, so existing app queries are unaffected.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS everywhere
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. users — profiles are public; only the owner edits their own row
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users FOR INSERT
  WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE
  USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "users_delete_own" ON public.users;
CREATE POLICY "users_delete_own" ON public.users FOR DELETE
  USING (auth_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. posts / stories / groups / group_members
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "posts_select" ON public.posts;
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = posts.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own" ON public.posts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = posts.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own" ON public.posts FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = posts.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "stories_select" ON public.stories;
CREATE POLICY "stories_select" ON public.stories FOR SELECT USING (true);

DROP POLICY IF EXISTS "stories_insert_own" ON public.stories;
CREATE POLICY "stories_insert_own" ON public.stories FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = stories.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "stories_delete_own" ON public.stories;
CREATE POLICY "stories_delete_own" ON public.stories FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = stories.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "groups_insert_own" ON public.groups;
CREATE POLICY "groups_insert_own" ON public.groups FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = groups.admin_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select" ON public.group_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "group_members_insert_own" ON public.group_members;
CREATE POLICY "group_members_insert_own" ON public.group_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = group_members.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "group_members_delete_own" ON public.group_members;
CREATE POLICY "group_members_delete_own" ON public.group_members FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = group_members.user_id AND u.auth_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. comments & likes — public read, owner writes
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = comments.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own" ON public.comments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = comments.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "likes_select" ON public.likes;
CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
CREATE POLICY "likes_insert_own" ON public.likes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = likes.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "likes_delete_own" ON public.likes;
CREATE POLICY "likes_delete_own" ON public.likes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = likes.user_id AND u.auth_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. follows — public read, owner writes
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "follows_select" ON public.follows;
CREATE POLICY "follows_select" ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "follows_insert_own" ON public.follows;
CREATE POLICY "follows_insert_own" ON public.follows FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = follows.follower_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "follows_delete_own" ON public.follows;
CREATE POLICY "follows_delete_own" ON public.follows FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = follows.follower_id AND u.auth_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. messages — only the two participants can read/write
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_select_conversation" ON public.messages;
CREATE POLICY "messages_select_conversation" ON public.messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = messages.sender_id AND u.auth_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = messages.receiver_id AND u.auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender" ON public.messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = messages.sender_id AND u.auth_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. notifications — only the recipient sees / marks them
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = notifications.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = notifications.user_id AND u.auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = notifications.user_id AND u.auth_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Realtime — publish chat (and social activity) to connected clients
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.messages',
    'public.posts',
    'public.likes',
    'public.comments',
    'public.notifications'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = split_part(t, '.', 2)
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    END IF;
  END LOOP;
END $$;

-- Verify: your tables + their policies
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
