import { pool, hasDatabase } from '@/db';

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
 * The DDL mirrors the app's core table/column shape. The canonical schema
 * lives in `src/db/schema.ts` and can be pushed with `npm run db:push`.
 */
export async function ensureMigrated() {
  if (migrated) return;
  migrated = true;

  if (!hasDatabase || !pool) {
    console.warn('[migrate] DATABASE_URL not set — skipping schema bootstrap (pages will use fallback/mock data)');
    return;
  }

  // Tables first, in dependency order (FK targets before dependents).
  const statements = [
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
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
      CONSTRAINT "messages_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
    )`,
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
  ];

  let anyFailed = false;
  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (error) {
      anyFailed = true;
      console.warn('Migration skipped:', statement.slice(0, 80), (error as Error)?.message);
    }
  }

  // When every statement failed (e.g. a cold-start connection blip), allow the
  // next request to retry instead of marking this process as done forever —
  // otherwise pages keep querying a schema that was never patched (missing
  // columns such as posts.repost_of_id) and silently fall back to demo data.
  if (anyFailed) {
    migrated = false;
  }
}
