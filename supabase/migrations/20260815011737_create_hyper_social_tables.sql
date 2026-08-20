/*
# Create Hyper Social Platform Tables

## Overview
Creates the complete database schema for the Hyper social media platform.
The app uses Drizzle ORM with node-postgres and custom JWT-based auth
(bcrypt-hashed passwords, integer serial user IDs — NOT Supabase Auth).
All database access is server-side through Next.js API routes and server actions;
the browser never talks to the database directly.

## New Tables (16 total)
1. **users** — account profiles with bcrypt-hashed passwords, avatar, cover photo, bio
2. **posts** — text/image/video posts with repost support, group scoping, edit tracking
3. **stories** — 24-hour expiring story images
4. **groups** — community groups with admin ownership
5. **group_members** — join table linking users to groups (composite PK)
6. **comments** — comments on posts (cascades with post deletion)
7. **likes** — likes on posts (cascades with post deletion)
8. **follows** — follower/following relationships (composite PK)
9. **messages** — direct messages between users
10. **notifications** — like/comment/follow/message notifications
11. **bookmarks** — saved posts per user
12. **reports** — content moderation reports
13. **polls** — polls attached to posts
14. **poll_options** — choices for each poll
15. **poll_votes** — user votes on poll options
16. **posts** self-references for reposts (repost_of_id)

## Security
- RLS enabled on ALL tables.
- Since the app uses its own custom auth (not Supabase Auth) and all database
  access goes through the Next.js server (service-role connection), ownership
  and access control are enforced in the application layer.
- Permissive policies (USING true) are applied because the app server
  mediates all access — the browser has no direct database connection.

## Notes
- Uses integer serial primary keys (matching the Drizzle schema).
- ON DELETE CASCADE on comments/likes/notifications when parent post is deleted.
- ON DELETE SET NULL on posts.repost_of_id and posts.group_id.
- group_members cascade with group deletion; posts survive as regular feed posts.
- The app auto-seeds demo data (5 users, 9 posts, groups, etc.) on first boot.
*/

-- ── USERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password" text NOT NULL,
  "avatar" text,
  "cover_photo" text,
  "bio" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_all" ON "users";
CREATE POLICY "users_select_all" ON "users" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "users_insert_all" ON "users";
CREATE POLICY "users_insert_all" ON "users" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "users_update_all" ON "users";
CREATE POLICY "users_update_all" ON "users" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "users_delete_all" ON "users";
CREATE POLICY "users_delete_all" ON "users" FOR DELETE TO anon, authenticated USING (true);

-- ── POSTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "posts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "content" text NOT NULL,
  "image_url" text,
  "video_url" text,
  "privacy" text DEFAULT 'public' NOT NULL,
  "repost_of_id" integer REFERENCES "posts"("id") ON DELETE SET NULL,
  "group_id" integer,
  "updated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_all" ON "posts";
CREATE POLICY "posts_select_all" ON "posts" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "posts_insert_all" ON "posts";
CREATE POLICY "posts_insert_all" ON "posts" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "posts_update_all" ON "posts";
CREATE POLICY "posts_update_all" ON "posts" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "posts_delete_all" ON "posts";
CREATE POLICY "posts_delete_all" ON "posts" FOR DELETE TO anon, authenticated USING (true);

-- ── STORIES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "stories" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "image_url" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
ALTER TABLE "stories" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_select_all" ON "stories";
CREATE POLICY "stories_select_all" ON "stories" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "stories_insert_all" ON "stories";
CREATE POLICY "stories_insert_all" ON "stories" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "stories_update_all" ON "stories";
CREATE POLICY "stories_update_all" ON "stories" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "stories_delete_all" ON "stories";
CREATE POLICY "stories_delete_all" ON "stories" FOR DELETE TO anon, authenticated USING (true);

-- ── GROUPS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "cover_photo" text,
  "admin_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "groups_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;

-- Add FK from posts.group_id to groups.id now that groups exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'posts_group_id_groups_id_fk' AND table_name = 'posts'
  ) THEN
    ALTER TABLE "posts" ADD CONSTRAINT "posts_group_id_groups_id_fk"
      FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE SET NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "groups_select_all" ON "groups";
CREATE POLICY "groups_select_all" ON "groups" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "groups_insert_all" ON "groups";
CREATE POLICY "groups_insert_all" ON "groups" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "groups_update_all" ON "groups";
CREATE POLICY "groups_update_all" ON "groups" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "groups_delete_all" ON "groups";
CREATE POLICY "groups_delete_all" ON "groups" FOR DELETE TO anon, authenticated USING (true);

-- ── GROUP MEMBERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "group_members" (
  "group_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
  CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
ALTER TABLE "group_members" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members_select_all" ON "group_members";
CREATE POLICY "group_members_select_all" ON "group_members" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "group_members_insert_all" ON "group_members";
CREATE POLICY "group_members_insert_all" ON "group_members" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "group_members_update_all" ON "group_members";
CREATE POLICY "group_members_update_all" ON "group_members" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "group_members_delete_all" ON "group_members";
CREATE POLICY "group_members_delete_all" ON "group_members" FOR DELETE TO anon, authenticated USING (true);

-- ── COMMENTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_all" ON "comments";
CREATE POLICY "comments_select_all" ON "comments" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "comments_insert_all" ON "comments";
CREATE POLICY "comments_insert_all" ON "comments" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "comments_update_all" ON "comments";
CREATE POLICY "comments_update_all" ON "comments" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "comments_delete_all" ON "comments";
CREATE POLICY "comments_delete_all" ON "comments" FOR DELETE TO anon, authenticated USING (true);

-- ── LIKES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "likes" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
ALTER TABLE "likes" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "likes_select_all" ON "likes";
CREATE POLICY "likes_select_all" ON "likes" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "likes_insert_all" ON "likes";
CREATE POLICY "likes_insert_all" ON "likes" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "likes_update_all" ON "likes";
CREATE POLICY "likes_update_all" ON "likes" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "likes_delete_all" ON "likes";
CREATE POLICY "likes_delete_all" ON "likes" FOR DELETE TO anon, authenticated USING (true);

-- ── FOLLOWS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "follows" (
  "follower_id" integer NOT NULL,
  "following_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id"),
  CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
ALTER TABLE "follows" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_all" ON "follows";
CREATE POLICY "follows_select_all" ON "follows" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "follows_insert_all" ON "follows";
CREATE POLICY "follows_insert_all" ON "follows" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "follows_update_all" ON "follows";
CREATE POLICY "follows_update_all" ON "follows" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "follows_delete_all" ON "follows";
CREATE POLICY "follows_delete_all" ON "follows" FOR DELETE TO anon, authenticated USING (true);

-- ── MESSAGES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "sender_id" integer NOT NULL,
  "receiver_id" integer NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "messages_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_all" ON "messages";
CREATE POLICY "messages_select_all" ON "messages" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "messages_insert_all" ON "messages";
CREATE POLICY "messages_insert_all" ON "messages" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "messages_update_all" ON "messages";
CREATE POLICY "messages_update_all" ON "messages" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "messages_delete_all" ON "messages";
CREATE POLICY "messages_delete_all" ON "messages" FOR DELETE TO anon, authenticated USING (true);

-- ── NOTIFICATIONS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "actor_id" integer NOT NULL,
  "type" text NOT NULL,
  "post_id" integer,
  "message_id" integer,
  "is_read" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "notifications_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action
);
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_all" ON "notifications";
CREATE POLICY "notifications_select_all" ON "notifications" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "notifications_insert_all" ON "notifications";
CREATE POLICY "notifications_insert_all" ON "notifications" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_update_all" ON "notifications";
CREATE POLICY "notifications_update_all" ON "notifications" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_delete_all" ON "notifications";
CREATE POLICY "notifications_delete_all" ON "notifications" FOR DELETE TO anon, authenticated USING (true);

-- ── BOOKMARKS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bookmarks" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "post_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "bookmarks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action
);
ALTER TABLE "bookmarks" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookmarks_select_all" ON "bookmarks";
CREATE POLICY "bookmarks_select_all" ON "bookmarks" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "bookmarks_insert_all" ON "bookmarks";
CREATE POLICY "bookmarks_insert_all" ON "bookmarks" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "bookmarks_update_all" ON "bookmarks";
CREATE POLICY "bookmarks_update_all" ON "bookmarks" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "bookmarks_delete_all" ON "bookmarks";
CREATE POLICY "bookmarks_delete_all" ON "bookmarks" FOR DELETE TO anon, authenticated USING (true);

-- ── REPORTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "reporter_id" integer NOT NULL,
  "post_id" integer,
  "reason" text NOT NULL,
  "details" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action
);
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_select_all" ON "reports";
CREATE POLICY "reports_select_all" ON "reports" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "reports_insert_all" ON "reports";
CREATE POLICY "reports_insert_all" ON "reports" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "reports_update_all" ON "reports";
CREATE POLICY "reports_update_all" ON "reports" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "reports_delete_all" ON "reports";
CREATE POLICY "reports_delete_all" ON "reports" FOR DELETE TO anon, authenticated USING (true);

-- ── POLLS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "polls" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL,
  "question" text,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "polls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action
);
ALTER TABLE "polls" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "polls_select_all" ON "polls";
CREATE POLICY "polls_select_all" ON "polls" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "polls_insert_all" ON "polls";
CREATE POLICY "polls_insert_all" ON "polls" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "polls_update_all" ON "polls";
CREATE POLICY "polls_update_all" ON "polls" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "polls_delete_all" ON "polls";
CREATE POLICY "polls_delete_all" ON "polls" FOR DELETE TO anon, authenticated USING (true);

-- ── POLL OPTIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "poll_options" (
  "id" serial PRIMARY KEY NOT NULL,
  "poll_id" integer NOT NULL,
  "text" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action
);
ALTER TABLE "poll_options" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poll_options_select_all" ON "poll_options";
CREATE POLICY "poll_options_select_all" ON "poll_options" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "poll_options_insert_all" ON "poll_options";
CREATE POLICY "poll_options_insert_all" ON "poll_options" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "poll_options_update_all" ON "poll_options";
CREATE POLICY "poll_options_update_all" ON "poll_options" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "poll_options_delete_all" ON "poll_options";
CREATE POLICY "poll_options_delete_all" ON "poll_options" FOR DELETE TO anon, authenticated USING (true);

-- ── POLL VOTES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "poll_votes" (
  "id" serial PRIMARY KEY NOT NULL,
  "poll_id" integer NOT NULL,
  "option_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "poll_votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
ALTER TABLE "poll_votes" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poll_votes_select_all" ON "poll_votes";
CREATE POLICY "poll_votes_select_all" ON "poll_votes" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "poll_votes_insert_all" ON "poll_votes";
CREATE POLICY "poll_votes_insert_all" ON "poll_votes" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "poll_votes_update_all" ON "poll_votes";
CREATE POLICY "poll_votes_update_all" ON "poll_votes" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "poll_votes_delete_all" ON "poll_votes";
CREATE POLICY "poll_votes_delete_all" ON "poll_votes" FOR DELETE TO anon, authenticated USING (true);

-- ── INDEXES ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "posts_user_id_idx" ON "posts" ("user_id");
CREATE INDEX IF NOT EXISTS "posts_created_at_idx" ON "posts" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "posts_group_id_idx" ON "posts" ("group_id");
CREATE INDEX IF NOT EXISTS "posts_repost_of_id_idx" ON "posts" ("repost_of_id");
CREATE INDEX IF NOT EXISTS "comments_post_id_idx" ON "comments" ("post_id");
CREATE INDEX IF NOT EXISTS "likes_post_id_idx" ON "likes" ("post_id");
CREATE INDEX IF NOT EXISTS "likes_user_id_idx" ON "likes" ("user_id");
CREATE INDEX IF NOT EXISTS "follows_follower_id_idx" ON "follows" ("follower_id");
CREATE INDEX IF NOT EXISTS "follows_following_id_idx" ON "follows" ("following_id");
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "bookmarks_user_id_idx" ON "bookmarks" ("user_id");
CREATE INDEX IF NOT EXISTS "messages_sender_receiver_idx" ON "messages" ("sender_id", "receiver_id");
CREATE INDEX IF NOT EXISTS "group_members_group_id_idx" ON "group_members" ("group_id");
CREATE INDEX IF NOT EXISTS "group_members_user_id_idx" ON "group_members" ("user_id");
CREATE INDEX IF NOT EXISTS "stories_expires_at_idx" ON "stories" ("expires_at");
CREATE INDEX IF NOT EXISTS "polls_post_id_idx" ON "polls" ("post_id");
CREATE INDEX IF NOT EXISTS "poll_votes_poll_id_user_id_idx" ON "poll_votes" ("poll_id", "user_id");
