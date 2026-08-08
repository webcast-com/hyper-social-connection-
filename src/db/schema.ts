import { pgTable, serial, text, timestamp, integer, primaryKey, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  avatar: text("avatar"),
  coverPhoto: text("cover_photo"),
  bio: text("bio"),
  // Links this profile to Supabase Auth (auth.users.id). Purely additive:
  // legacy rows keep a NULL auth_id and still work through the JWT path.
  authId: uuid("auth_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  privacy: text("privacy").default('public').notNull(), // 'public', 'friends'
  repostOfId: integer("repost_of_id").references((): any => posts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stories = pgTable("stories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  imageUrl: text("image_url").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  coverPhoto: text("cover_photo"),
  adminId: integer("admin_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembers = pgTable("group_members", {
  groupId: integer("group_id").references(() => groups.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.groupId, table.userId] }),
  };
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const likes = pgTable("likes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const follows = pgTable("follows", {
  followerId: integer("follower_id").references(() => users.id).notNull(),
  followingId: integer("following_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.followerId, table.followingId] }),
  };
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  actorId: integer("actor_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'like', 'comment', 'follow', 'message', 'repost'
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }),
  messageId: integer("message_id").references(() => messages.id, { onDelete: "cascade" }),
  isRead: integer("is_read").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(), // 'spam', 'harassment', 'misinformation', 'inappropriate', 'other'
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const polls = pgTable("polls", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }).notNull(),
  question: text("question"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pollOptions = pgTable("poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").references(() => polls.id, { onDelete: "cascade" }).notNull(),
  text: text("text").notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pollVotes = pgTable("poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").references(() => polls.id, { onDelete: "cascade" }).notNull(),
  optionId: integer("option_id").references(() => pollOptions.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


