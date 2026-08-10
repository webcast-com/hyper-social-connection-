# Roadmap Map

- Phase 1: Database (Supabase + Drizzle ORM) ✅
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
  - Full Supabase integration: Supabase Auth, session refresh via proxy, `auth_id` profile linking, RLS policies + Realtime live chat (`postgres_changes` on `messages`).
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

