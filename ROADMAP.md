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

- Phase 14: Sports cards become real social objects ✅
  Constraint: **keep the current social layout and functionality**. Comments,
  likes, follows and shares are reused, not reimplemented — sports content joins
  the existing graph instead of getting a parallel one. See
  [SPORTS_ANCHOR_POSTS.md](SPORTS_ANCHOR_POSTS.md).

  - The leaders and highlights cards used to keep Like / Comment / Save in
    `useState`: a visitor "liked" a stat card, reloaded, and it was gone. Each
    card can now anchor a real `posts` row, created on first engagement by a
    member and reused by everyone after, so counts, threads, bookmarks, reposts,
    notifications and `/post/[id]` permalinks work as they already do.
  - Additive schema: `posts.kind`, unique `posts.external_key`
    (`sports:{kind}:{id}`), `users.account_type` — declared in
    `prisma/schema.prisma`, applied by the boot DDL in `src/lib/migrate.ts`.
    `INSERT … ON CONFLICT DO NOTHING` makes double submits and concurrent clicks
    resolve to one post. Run `npm run db:generate` after pulling.
  - Anchors are authored by **Hyper Sports** (`@hypersports`), a followable
    `broadcaster` account that holds a hash of a discarded secret so it can never
    sign in, has notifications off and messages closed, and is kept out of
    people-you-may-know, both Contacts rails and `/discover`. Explicit search
    still finds it.
  - A client sends `{ kind, id }` only; the post's text and media are re-derived
    server-side from this site's own feeds, so an anchor cannot be used to publish
    arbitrary content as the desk. Sample boards (ESPN unreachable) refuse to
    anchor: placeholder values are never stored as though they were reported.
  - Cards that cannot be engaged with stay laid out and say why — disabled
    controls plus "Sign in to like, comment on, save and share this card." for
    guests and "Engagement is unavailable on sample cards." on sample data. The
    stale "Comments stay in this browser" footnotes are gone.
  - Engagement is read back in one bounded pass per homepage render
    (`loadAnchorEngagement`, ≤60 refs, ≤12 comments per card), not a query per
    card; cards nobody engaged with cost one key lookup.
  - Fixed a cold-start race found while verifying: `runMigration()` marked the
    process migrated before running any DDL, so a concurrent request queried
    columns that did not exist yet and the first seed attempt failed. `migrated`
    is now raised only after the DDL has run.
  - Verified: `npm run typecheck`, `npm run test:sports` 271/271 (new
    `tests/sports/anchor.test.ts`; the leaders and highlights card specs were
    rewritten off the old fake behaviour and now drive real form actions), plus a
    live-Postgres run proving desk idempotency, one post per key under concurrent
    creates, engagement read-back with authors, refusal of unknown and sample
    cards, and four concurrent cold starts all returning 200 with a single clean
    seed. Not verified here: live ESPN boards (no egress), Playwright layout
    (no browser binary), `npm run db:generate` (no route to `binaries.prisma.sh`).

- Phase 15: League video news, as its own stack ✅
  Constraint: **build it separately** — its own parser, feed, endpoints and play
  card, sharing nothing with the match highlights stack
  (`espn-highlights*.ts`, `/api/sports/highlights`, `SportsHighlightsFeed`,
  `LinkMediaPlayer`) — and wire it into the feeds section **without breaking
  anything**. See [ESPN_VIDEO_NEWS.md](ESPN_VIDEO_NEWS.md).

  - The highlights board is fixture-driven and its own notes record the gap: the
    Premier League and the NFL answer a finished match's video collection with an
    empty list. This reader is feed-driven — it asks a competition's **news** feed
    and keeps the articles ESPN itself marks as videos, which is where league
    clips (goals, recaps, reactions) actually live.
  - A news article carries a clip page and a clip id, not a media file, so the
    listing costs one request per competition and the rendition is resolved only
    when a reader presses play: `GET /api/sports/video-news` and
    `GET /api/sports/video-news/clip?id={numeric}`. The clip route takes an id and
    builds the host itself, so it cannot be pointed at an arbitrary URL.
  - Renditions are classified by their own extension, so ESPN's auth-gated
    `…/video/auth/…` URLs (no extension) are never handed to a player. The
    progressive file wins; HLS is used only when this browser says it can play it,
    and every unplayable path ends at a labelled "Watch it on ESPN" link rather
    than a black rectangle.
  - Nothing is invented: a league clip has no fixture, so team labels are only
    ESPN's own article categories (never a guessed "Home vs Away"), and when ESPN
    does not answer the board is empty — unlike the highlights board there are no
    bundled sample clips here.
  - Feed placement moved into `src/lib/feed-interleave.ts` so each card kind gets
    its own pass: match and prediction cards keep `[1, 3, 5, 7]`, video clips take
    `[2, 6]`, at most `MAX_FEED_CLIPS = 2` of them, and `FeedTabs` gained one
    branch. With no clips the For You feed is identical to the feed before this
    card kind existed, and the member posts list is never mutated.
  - A cold fan-out cannot hold a render: `getSportsVideoNewsForRender()` races the
    job against a 2.5s budget, resolves an empty `unavailable` board on timeout and
    never cancels the work, so the next render is served from the cache.
  - Verified: `npm run typecheck`, `npm run test:sports` 300/300 (271 existing
    specs unchanged, 29 new across parser, feed, card and placement; the new feed
    specs use their own `fetch` harness and never touch the highlights stubs),
    `npm run build`, `npx eslint` clean, plus a live smoke of both new routes and
    an unchanged `/api/sports/highlights`. Not verified here: live ESPN news feeds
    and clip records (no egress), real browser playback and Playwright layout (no
    Chromium binary).

- Phase 16: Native team and player pages, as their own stack ✅
  Constraint: **build it separately** — its own parsers, feeds, endpoints, pages
  and components, sharing nothing with the match/standings/leaders/highlights
  stacks — then wire links in **everywhere** without breaking anything. Covers
  both entity kinds and all 121 `ESPN_LEAGUES` competitions, not just the NBA and
  the NFL. See [ESPN_TEAM_ATHLETE_DETAILS.md](ESPN_TEAM_ATHLETE_DETAILS.md).

  - The vendored NFL/NBA SPA already knew how to ask ESPN for a team and a player
    (`teamUrls`, `athleteUrls`, `normalizeTeamInfo`, `normalizeRoster`,
    `normalizeAthlete`) but had no consumer here and no route, so those entities
    were only reachable under `/nfl-basketball/…`. They now have native pages at
    `/sports/teams/{league}/{teamId}` and `/sports/athletes/{league}/{athleteId}`,
    served by `GET /api/sports/teams/…` and `GET /api/sports/athletes/…`.
  - A team page is three ESPN parts settled together — identity, `/schedule`,
    `/roster` — so one refusal never hides the other two: the board reports
    `ready|partial|unavailable` with per-part `sources` (url, httpStatus,
    errorKind, error) and the page names the missing part.
  - A player page tries the site endpoint and falls back to the common endpoint
    only when it must, because some competitions publish a player through the
    common one alone. Statistics stay grouped as ESPN groups them, capped at
    `MAX_STAT_GROUPS = 3` × `MAX_STATS_PER_GROUP = 12`, and values that are really
    identifiers (the player's own name/id, a bare ≥5-digit number) are dropped.
  - Fixtures are split by the **state ESPN reports** (`status.type.state`), never
    by comparing a date with the clock, so a postponed match is not relabelled as
    a result; `"-"`, `"--"` and `"—"` are "no score reported", not zero.
  - Six things the paste does were deliberately not ported: headshot synthesis for
    every sport (here a frozen map allows only `basketball/nba` and
    `football/nfl`, everything else uses the provider's photo or initials, and the
    board says so via `portraitsFromCdn`); missing id validation (`validEntityId`
    gates every URL and CDN path, and a payload whose own id differs from the one
    requested is refused outright); unvalidated `src`/`href` (`safeProviderImage`,
    `safeExternalUrl` — https, no credentials, ≤2048 else rejected);
    `position: … ?? "—"` inventing data (every optional field is `null`); demo
    data always winning (no sample team or player exists — an `unavailable` board
    renders an honest empty state); and throwing on total failure.
  - Linking is gated on an id ESPN actually reported — a name is never turned into
    an id. `SportsLeaderRow` gained optional `athleteId`/`teamId` (null for
    bundled rows), so leader cards, standings rows and match lineups each become
    links only where `validEntityId` passes, and otherwise render exactly as they
    did before.
  - Bounds and caching follow the existing feeds: 300 s ready / 15 s failure TTL,
    an 8 s per-request timeout, ≤8 in-flight boards, ≤100 cached boards, one
    shared promise per entity, `?refresh=1` to bypass, `Cache-Control: no-store`,
    and a failed refresh keeps the data already on screen. Clients re-validate a
    payload with `validTeamBoard`/`validAthleteBoard` before replacing state.
  - Verified: `npm run typecheck`, `npm run test:sports` 329/329 (300 existing
    specs unchanged in behaviour, 29 new across parser, feed and two mounted
    pages; the existing leader-card href expectations were updated to the native
    routes and extended with an id-less case), `npm run build` with both routes
    dynamic, `npx eslint` clean on every touched file, plus a live smoke of both
    endpoints, both pages, a 404 competition, a 400 id and unchanged
    `/sports`, `/sports/matches/epl/1` and `/`. Not verified here: live ESPN team,
    roster, schedule and athlete payloads (no egress — see
    [ESPN_ACCESS_DENIED.md](ESPN_ACCESS_DENIED.md)) and Playwright layout (no
    Chromium binary).
