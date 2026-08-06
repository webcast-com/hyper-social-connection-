# Roadmap Map

- Phase 1: Database (Supabase) ✅
- Phase 2: Dark Mode ✅
- Phase 3: Preview / Build Fix ✅ (build passes; add SUPABASE_ANON_KEY + DATABASE_URL to .env.local)
- Phase 4: Feature Expansion ✅
  - Full Supabase integration: Supabase Auth (email/password + Google/GitHub OAuth),
    session refresh via proxy, `auth_id` profile linking, RLS policies + Realtime
    publication, storage-backed uploads with local fallback, and live chat via
    Realtime (`postgres_changes` on `messages`). UI unchanged.
  - See `SUPABASE_SETUP.md` for the one-time Supabase setup steps.

Upgrade Ideas (next):
- Image/video CDN optimization (Supabase Storage transforms / resize on upload)
- Notification push (Supabase Edge Functions + web push)
- Mobile responsive PWA
- Moderation / admin tools
