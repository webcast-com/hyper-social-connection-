# Roadmap Map

- Phase 1: Database (PostgreSQL + Drizzle ORM) ✅
- Phase 2: Dark Mode & Theming ✅
- Phase 3: Preview / Build Fix & Storage ✅
- Phase 4: Feature Expansion & Next-Level Capabilities ✅
  - Feed Tabs: "For You" (global engagement feed), "Following" (personalized creators feed), and "Saved" (bookmarks).
  - Bookmarks & Saved Posts collection (`bookmarks` table + instant bookmark toggle).
  - Repost & Quote Post system (`RepostModal.tsx` + `repost_of_id` foreign key with embedded original post preview).
  - Interactive Full-Screen Image Lightbox with zoom in/out, download, and Escape key controls (`ImageLightbox.tsx`).
  - Content Moderation & Reporting modal (`reports` table + `ReportModal.tsx`).
  - Chat Enhancements: Live active status indicator, quick emoji reaction badges (❤️, 👍, 😂, 🔥, 👏).
  - Post and Comment deletion for content authors.
  - Progressive Web App (PWA) manifest (`manifest.webmanifest`) with standalone mobile installation support.
  - (Historical) Full Supabase integration: Supabase Auth, session refresh via proxy, `auth_id` profile linking, RLS policies + Realtime live chat — replaced in Phase 7.
- Phase 5: Social Depth Pack ✅
  - Full-screen Story Viewer: click any story card to preview — segmented auto-advance progress bars, press-and-hold to pause, tap zones / arrow keys / chevrons to navigate, author + relative time header (`StoryViewer.tsx`).
  - Live Trending Topics: real #hashtag usage computed server-side from recent posts (incl. demo feed) with category inference and real post counts (`src/lib/trending.ts`), replacing the static widget.
  - Post permalinks: dedicated `/post/[id]` page with full comments, poll and repost enrichment; "Copy Link", share-sheet link and like/comment notifications now deep-link to it; post routes included in `sitemap.xml`.
  - Edit Post: authors can edit their post content from the post menu (`posts.updated_at` + `EditPostModal`), with an "Edited" marker by the timestamp and instant optimistic update.
  - Likes with faces: metrics row shows stacked liker avatars and "Liked by A, B and N others", opening a full likers list linked to profiles.
- Phase 6: Communities & Groups ✅
  - Group discussions: posts can be scoped to a community (`posts.group_id`, ON DELETE SET NULL) with a full enriched feed on the group page (likes, comments, polls, reposts) and an "in <group>" chip on feed posts.
  - Members-only composer on group pages (membership enforced server-side in `createPost`).
  - Join ⇄ Leave membership toggle with optimistic state (`GroupMembershipButton`); admins keep their groups (leave disabled, delete instead).
  - Group admin controls: edit name/description/cover and delete group with confirm step (`GroupAdminControls`); member rows cascade, posts survive as regular feed posts.
  - Upgraded groups directory: "Your groups"/"Discover groups" sections, member counts, joined badges, member avatar stacks, dark-mode styling, create-group modal (`CreateGroupButton`).
  - Home sidebar Shortcuts now list the viewer's real joined groups.
- Phase 7: Supabase decoupling ✅
  - The app now runs on **any PostgreSQL database** (Neon, AWS RDS, Railway, DigitalOcean, local Postgres, …) via `DATABASE_URL` — no Supabase project required.
  - Auth: email/password with bcrypt-hashed credentials and revocable Prisma database sessions (no Supabase Auth / OAuth dependency).
  - Media uploads: stored on local disk under `public/uploads` (no Supabase Storage). Swap in S3/R2 later if needed.
  - Live chat: HTTP polling against `/api/messages` (replaces Supabase Realtime `postgres_changes`).
  - Removed: `@supabase/ssr`, `@supabase/supabase-js`, `supabase/*.sql`, session-refresh proxy, `auth_id` profile linking. See `DATABASE.md` for setup.

- Phase 9: Social schema port ✅
  - Added `sql/001_social_connection_schema.sql`: the uuid-based Supabase "Social Connection Platform" schema (profiles/posts/connections/likes/comments + RLS + counter triggers), as an **opt-in** migration for a Supabase project. Preflight guards abort it against this app's database, so it cannot corrupt the live schema.
  - Ported the compatible parts into the app itself (`src/db/social-ddl.ts`, applied by `src/lib/migrate.ts`): unique `(post_id, user_id)` on `likes` (with de-duplication of existing rows), nullable+unique `users.username` backfilled from the email local-part, and cached `posts.likes_count` / `posts.comments_count` with triggers and a self-healing reconciliation pass.
  - `toggleLike` now uses `onConflictDoNothing` and only notifies when a like is genuinely created — fixing double-like rows and duplicate like notifications.
  - Both layers covered by executable specs under `sql/__tests__/` (88 + 40 checks) that run the real DDL against an in-process Postgres.

- Phase 8: UI polish & code health ✅
  - Redesigned login/signup: split brand-panel + form card, icon inputs, show/hide password, loading spinners, demo-mode banners, seeded-account hint.
  - Illustrated empty states: new `EmptyState` component with six hand-drawn, theme-aware SVG illustrations applied to feed tabs, groups, notifications, messages, search and profiles.
  - Mobile spacing tightened; fixed doubled gap between feed posts (`space-y-4` wrapper + per-post `mb-4`).
  - Dark-mode coverage completed for profile, discover, messages, notifications and global page background.
  - Fixed nested-anchor hydration error in search results (new `FormattedContent.interactive` prop).
  - Lint cleaned to 0 errors (pure renders, no sync setState-in-effect, escaped entities).
  - Added README.

- Phase 10: Profile, settings & group admin — real social features ✅
  Constraint: **keep the current page formation and existing functionality**. New controls extend the same cards, headers, and modals — they do not replace the feed, composer, follow/message buttons, cover/avatar uploads, or group join/leave.

  ### User profile & settings
  - Settings stays the existing `/settings` card. Sections (Profile / Privacy / Notifications / Account) sit inside it.
  - Profile: keep name, bio, avatar, cover. Add `@username`, location, website, pronouns, workplace, education.
  - Privacy: who can see the profile (`public` / `followers` / `private`) and who can message (`everyone` / `followers` / `nobody`).
  - Notifications: per-type toggles (likes, comments, follows, messages) honored when creating notifications.
  - Account: email is visible; password can be changed with the current password.
  - Profile page keeps cover → avatar → follow/message → About / Photos / Followers → Posts. New identity fields render in the existing About card; private profiles hide posts from outsiders.

  ### Groups (members + admin)
  - Create Group and Group Settings keep name, description, cover, delete.
  - Admin adds: public/private, category, rules, location, website, join-approval.
  - Members get roles (`admin` / `moderator` / `member`). Admins can invite, remove, and change roles without leaving the settings modal.
  - Private or approval-required groups create a join request instead of instant join; admin reviews pending requests.
  - Private groups hide the discussion feed from non-members. Existing public groups keep working unchanged.

  ### Data
  - Prisma + PostgreSQL only. New columns are nullable or defaulted (`ALTER … IF NOT EXISTS`) so current rows stay valid.
  - New table: `group_join_requests`. `group_members.role` backfilled (`admin` for `groups.admin_id`).

- Phase 11: Safety, follow requests, ownership, schedule & events ✅
  Constraint: keep the current page formation. New controls sit on existing profiles, settings tabs, the composer, and the group modal.

  - Block and mute lists (`blocks`, `mutes`). Blocked people cannot follow or message you; their posts drop out of your feed. Mute only hides posts.
  - Report a person from their profile (extends `reports.reported_user_id` — post reports stay as they are).
  - Follow-request inbox for locked accounts (`follow_privacy = approval`). Public accounts still follow instantly.
  - Transfer group ownership from Group Settings → Members.
  - Scheduled posts (`posts.scheduled_at`) from the composer; they stay hidden until the time.
  - Group events with RSVP (`group_events`, `group_event_rsvps`) on the group page.

- Phase 12: Next
  - OAuth (Google / GitHub) via Auth.js.
  - Recurring group events and event reminders.

- Phase 13: Object-store media ✅
  - Hybrid upload adapter (`src/lib/storage.ts`): Prisma Object Store / any
    S3-compatible bucket when `S3_*` is set, local `public/uploads` otherwise.
  - Stable `/uploads/<uuid>.<ext>` URLs in Postgres; `/api/media` streams
    local files (Range) or 302s to a short-lived presigned GET.
  - Client fail-fast size/type checks; avatar/cover/story/group URLs go
    through `isSafeMediaUrl`.
