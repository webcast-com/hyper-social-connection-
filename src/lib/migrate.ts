import { prisma, hasDatabase } from '@/lib/prisma';
import { SOCIAL_DDL } from '@/lib/social-ddl';

let migrated = false;

/**
 * Idempotent, non-destructive schema bootstrap.
 *
 * On first request of each server process this ensures the app's tables
 * exist (CREATE TABLE IF NOT EXISTS — a no-op when already present) and
 * applies small non-destructive patches for databases that were provisioned
 * before certain columns existed. Safe to call on every request: every
 * statement is a no-op when the object already exists, and errors are
 * caught so this can never break the app.
 *
 * This DDL matches prisma/schema.prisma column-for-column (the canonical
 * schema). Triggers/functions that Prisma cannot express live in
 * src/lib/social-ddl.ts.
 */
let migrationPromise: Promise<void> | null = null;

export async function ensureMigrated() {
  if (migrated) return;
  // Multiple server components can probe the database at once during a
  // cold start. Share one migration promise so queries never race the DDL.
  if (migrationPromise) return migrationPromise;

  migrationPromise = runMigration();

  try {
    await migrationPromise;
  } finally {
    migrationPromise = null;
  }
}

async function runMigration() {
  migrated = true;

  if (!hasDatabase) {
    console.warn('[migrate] DATABASE_URL not set — skipping schema bootstrap (pages will use fallback/mock data)');
    return;
  }

  // Tables first, in dependency order (FK targets before dependents).
  const statements: string[] = [
    // users
    `CREATE TABLE IF NOT EXISTS "users" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL,
      "password" text NOT NULL,
      "avatar" text,
      "cover_photo" text,
      "bio" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "users_email_unique" UNIQUE("email")
    )`,
    // posts
    `CREATE TABLE IF NOT EXISTS "posts" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL,
      "content" text NOT NULL,
      "image_url" text,
      "video_url" text,
      "privacy" text DEFAULT 'public' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
    // stories
    `CREATE TABLE IF NOT EXISTS "stories" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL,
      "image_url" text NOT NULL,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
    // groups
    `CREATE TABLE IF NOT EXISTS "groups" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "cover_photo" text,
      "admin_id" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "groups_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
    // group_members (composite PK)
    `CREATE TABLE IF NOT EXISTS "group_members" (
      "group_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
      CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    )`,
    // comments
    `CREATE TABLE IF NOT EXISTS "comments" (
      "id" serial PRIMARY KEY NOT NULL,
      "post_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "content" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
    // likes
    `CREATE TABLE IF NOT EXISTS "likes" (
      "id" serial PRIMARY KEY NOT NULL,
      "post_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
    // follows (composite PK)
    `CREATE TABLE IF NOT EXISTS "follows" (
      "follower_id" integer NOT NULL,
      "following_id" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id"),
      CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
      CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
    // messages
    `CREATE TABLE IF NOT EXISTS "messages" (
      "id" serial PRIMARY KEY NOT NULL,
      "sender_id" integer NOT NULL,
      "receiver_id" integer NOT NULL,
      "content" text NOT NULL,
      "image_url" text,
      "video_url" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
      CONSTRAINT "messages_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
    // Chat attachments (nullable; existing conversations stay text-only)
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url text`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_url text`,
    // notifications
    `CREATE TABLE IF NOT EXISTS "notifications" (
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
    )`,
    // Video upload support for posts (new nullable column, existing rows untouched)
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url text`,
    // Repost / Share support for posts (foreign key to original post)
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_of_id integer REFERENCES posts(id) ON DELETE SET NULL`,
    // Edit-post support (nullable; NULL until first edit drives the "Edited" marker)
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at timestamp`,
    // Group posts (nullable; NULL = regular feed post, set null if group deleted)
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS group_id integer REFERENCES groups(id) ON DELETE SET NULL`,
    // bookmarks
    `CREATE TABLE IF NOT EXISTS "bookmarks" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL,
      "post_id" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "bookmarks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action
    )`,
    // reports (content moderation)
    `CREATE TABLE IF NOT EXISTS "reports" (
      "id" serial PRIMARY KEY NOT NULL,
      "reporter_id" integer NOT NULL,
      "post_id" integer,
      "reason" text NOT NULL,
      "details" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "reports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action
    )`,
    // polls
    `CREATE TABLE IF NOT EXISTS "polls" (
      "id" serial PRIMARY KEY NOT NULL,
      "post_id" integer NOT NULL,
      "question" text,
      "expires_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "polls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action
    )`,
    // poll_options
    `CREATE TABLE IF NOT EXISTS "poll_options" (
      "id" serial PRIMARY KEY NOT NULL,
      "poll_id" integer NOT NULL,
      "text" text NOT NULL,
      "position" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action
    )`,
    // poll_votes
    `CREATE TABLE IF NOT EXISTS "poll_votes" (
      "id" serial PRIMARY KEY NOT NULL,
      "poll_id" integer NOT NULL,
      "option_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "poll_votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    )`,
    // ── Authentication tables (mirror prisma/schema.prisma) ────────────────
    `CREATE TABLE IF NOT EXISTS "sessions" (
      "id" SERIAL PRIMARY KEY,
      "session_token" TEXT NOT NULL,
      "user_id" INTEGER NOT NULL,
      "expires" TIMESTAMP(6) NOT NULL,
      "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "sessions_session_token_key" ON "sessions"("session_token")`,
    `DO $$ BEGIN
        ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id")`,
    `CREATE TABLE IF NOT EXISTS "accounts" (
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
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_provider_account_id_key"
       ON "accounts"("provider", "provider_account_id")`,
    `DO $$ BEGIN
        ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts"("user_id")`,
    `CREATE TABLE IF NOT EXISTS "verification_tokens" (
      "identifier" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "expires" TIMESTAMP(6) NOT NULL,
      CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier", "token")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_token_key" ON "verification_tokens"("token")`,
    // ── Profile / settings extras (nullable or defaulted — existing rows stay valid)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS location text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS website text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS workplace text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS education text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visibility text DEFAULT 'public'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS message_privacy text DEFAULT 'everyone'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_likes integer DEFAULT 1`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_comments integer DEFAULT 1`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_follows integer DEFAULT 1`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_messages integer DEFAULT 1`,
    // Profile extras behind User.age / User.gender / User.relationship
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS age integer DEFAULT 18`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text DEFAULT 'male'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status text DEFAULT 'single'`,
    // ── Group community extras
    `ALTER TABLE groups ADD COLUMN IF NOT EXISTS privacy text DEFAULT 'public'`,
    `ALTER TABLE groups ADD COLUMN IF NOT EXISTS category text`,
    `ALTER TABLE groups ADD COLUMN IF NOT EXISTS rules text`,
    `ALTER TABLE groups ADD COLUMN IF NOT EXISTS location text`,
    `ALTER TABLE groups ADD COLUMN IF NOT EXISTS website text`,
    `ALTER TABLE groups ADD COLUMN IF NOT EXISTS require_approval integer DEFAULT 0`,
    `ALTER TABLE group_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'`,
    `UPDATE group_members gm
        SET role = 'admin'
       FROM groups g
      WHERE gm.group_id = g.id
        AND gm.user_id = g.admin_id
        AND (gm.role IS NULL OR gm.role = 'member')`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS follow_privacy text DEFAULT 'everyone'`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at timestamp`,
    `ALTER TABLE reports ADD COLUMN IF NOT EXISTS reported_user_id integer`,
    `CREATE TABLE IF NOT EXISTS "blocks" (
      "blocker_id" integer NOT NULL,
      "blocked_id" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "blocks_pk" PRIMARY KEY ("blocker_id", "blocked_id"),
      CONSTRAINT "blocks_blocker_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade,
      CONSTRAINT "blocks_blocked_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade
    )`,
    `CREATE TABLE IF NOT EXISTS "mutes" (
      "muter_id" integer NOT NULL,
      "muted_id" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "mutes_pk" PRIMARY KEY ("muter_id", "muted_id"),
      CONSTRAINT "mutes_muter_fk" FOREIGN KEY ("muter_id") REFERENCES "public"."users"("id") ON DELETE cascade,
      CONSTRAINT "mutes_muted_fk" FOREIGN KEY ("muted_id") REFERENCES "public"."users"("id") ON DELETE cascade
    )`,
    `CREATE TABLE IF NOT EXISTS "follow_requests" (
      "id" serial PRIMARY KEY NOT NULL,
      "follower_id" integer NOT NULL,
      "following_id" integer NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "follow_requests_pair_key" UNIQUE ("follower_id", "following_id"),
      CONSTRAINT "follow_requests_from_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade,
      CONSTRAINT "follow_requests_to_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade
    )`,
    `CREATE TABLE IF NOT EXISTS "group_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "group_id" integer NOT NULL,
      "created_by_id" integer NOT NULL,
      "title" text NOT NULL,
      "description" text,
      "location" text,
      "starts_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "group_events_group_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade,
      CONSTRAINT "group_events_user_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action
    )`,
    `CREATE TABLE IF NOT EXISTS "group_event_rsvps" (
      "event_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "status" text DEFAULT 'going' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "group_event_rsvps_pk" PRIMARY KEY ("event_id", "user_id"),
      CONSTRAINT "group_event_rsvps_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."group_events"("id") ON DELETE cascade,
      CONSTRAINT "group_event_rsvps_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
    )`,
    `CREATE TABLE IF NOT EXISTS "group_calls" (
      "id" serial PRIMARY KEY NOT NULL,
      "group_id" integer NOT NULL,
      "creator_id" integer NOT NULL,
      "title" text NOT NULL,
      "description" text,
      "room_url" text NOT NULL,
      "is_active" boolean DEFAULT true NOT NULL,
      "created_at" timestamp(6) DEFAULT now() NOT NULL,
      CONSTRAINT "group_calls_group_id_room_url_key" UNIQUE ("group_id", "room_url"),
      CONSTRAINT "group_calls_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "group_calls_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
    `CREATE INDEX IF NOT EXISTS "group_calls_group_id_is_active_idx"
       ON "group_calls"("group_id", "is_active")`,
    `CREATE TABLE IF NOT EXISTS "group_call_participants" (
      "id" serial PRIMARY KEY NOT NULL,
      "call_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "joined_at" timestamp(6) DEFAULT now() NOT NULL,
      CONSTRAINT "group_call_participants_call_id_user_id_key" UNIQUE ("call_id", "user_id"),
      CONSTRAINT "group_call_participants_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."group_calls"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "group_call_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    )`,
    `CREATE INDEX IF NOT EXISTS "group_call_participants_call_id_idx" ON "group_call_participants"("call_id")`,
    `CREATE TABLE IF NOT EXISTS "group_call_signals" (
      "id" serial PRIMARY KEY NOT NULL,
      "call_id" integer NOT NULL,
      "from_id" integer NOT NULL,
      "to_id" integer,
      "kind" text NOT NULL,
      "payload" text NOT NULL,
      "created_at" timestamp(6) DEFAULT now() NOT NULL,
      CONSTRAINT "group_call_signals_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."group_calls"("id") ON DELETE cascade ON UPDATE no action
    )`,
    `CREATE INDEX IF NOT EXISTS "group_call_signals_call_id_id_idx" ON "group_call_signals"("call_id", "id")`,
    // Call type ('video' | 'audio') is chosen by the person who starts the call
    // and must be honoured by everyone who joins — previously the API accepted
    // callType and then dropped it, so joiners always got a camera call.
    `ALTER TABLE "group_calls" ADD COLUMN IF NOT EXISTS "call_type" text NOT NULL DEFAULT 'video'`,
    `ALTER TABLE "group_calls" ADD COLUMN IF NOT EXISTS "ended_at" timestamp(6)`,
    // Live per-participant state: mute / camera / screen-share / hand raised,
    // so remote tiles can show accurate badges without extra signaling traffic.
    `ALTER TABLE "group_call_participants" ADD COLUMN IF NOT EXISTS "is_muted" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "group_call_participants" ADD COLUMN IF NOT EXISTS "is_camera_off" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "group_call_participants" ADD COLUMN IF NOT EXISTS "is_sharing" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "group_call_participants" ADD COLUMN IF NOT EXISTS "hand_raised_at" timestamp(6)`,
    // Heartbeat: lets peers drop participants whose tab crashed or closed
    // without a clean leave, instead of showing a frozen tile forever.
    `ALTER TABLE "group_call_participants" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp(6) DEFAULT now() NOT NULL`,
    // In-call text chat, kept separate from the signaling relay so pruning
    // signals never deletes chat history.
    `CREATE TABLE IF NOT EXISTS "group_call_messages" (
      "id" serial PRIMARY KEY NOT NULL,
      "call_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "body" text NOT NULL,
      "created_at" timestamp(6) DEFAULT now() NOT NULL,
      CONSTRAINT "group_call_messages_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."group_calls"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "group_call_messages_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    )`,
    `CREATE INDEX IF NOT EXISTS "group_call_messages_call_id_id_idx" ON "group_call_messages"("call_id", "id")`,
    `CREATE TABLE IF NOT EXISTS "group_join_requests" (
      "id" serial PRIMARY KEY NOT NULL,
      "group_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "group_join_requests_group_id_user_id_key" UNIQUE ("group_id", "user_id"),
      CONSTRAINT "group_join_requests_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action,
      CONSTRAINT "group_join_requests_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    )`,
    // Social-graph patches (likes uniqueness, usernames, cached counters and
    // triggers). Kept last so they apply after every table above exists.
    ...SOCIAL_DDL,
  ];

  let anyFailed = false;
  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      anyFailed = true;
      console.warn('Migration skipped:', statement.slice(0, 80), (error as Error)?.message);
    }
  }

  // When every statement failed (e.g. a cold-start connection blip), allow the
  // next request to retry instead of marking this process as done forever.
  if (anyFailed) {
    migrated = false;
  }
}
