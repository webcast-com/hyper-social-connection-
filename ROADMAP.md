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

