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

- Phase 17: Team and player pages become browser-first ✅
  Constraint: the new detail pages should be **clickable with real data in the
  preview**, which the server route alone cannot deliver from a sandbox with no
  ESPN egress. Solution: give them the transport the scoreboard, match and
  league-table surfaces already use, leaving the server feed and its endpoints
  exactly as they were. See
  [ESPN_BROWSER_TRANSPORT.md](ESPN_BROWSER_TRANSPORT.md) and
  [ESPN_TEAM_ATHLETE_DETAILS.md](ESPN_TEAM_ATHLETE_DETAILS.md).

  - `browserTeamBoard` asks ESPN for a team's three parts together and calls
    `/api/sports/teams/...` **once** only when some part failed, taking just the
    failed parts from it. A part ESPN answered in the browser is never replaced by
    a second opinion, and for a part neither route reached the server's own
    explanation is kept — the rule the scoreboard transport already follows per
    competition.
  - `browserAthleteBoard` keeps the two-endpoint order (site, then common only if
    it must) in the browser and falls back to `/api/sports/athletes/...` when
    neither answered, accepting a server board only if it passes
    `validAthleteBoard` for the same reference.
  - Every source now carries `transport: 'browser' | 'server'`, printed in both
    pages' diagnostics panels. The ESPN URL is identical for both routes, so
    without the label a reader could not tell who answered — and a page that says
    "not reported" should be able to say who was asked.
  - Both routes build their board through one shared assembler (`teamBoardOf`,
    `athleteBoardOf`) in the parser modules, so the browser and the server cannot
    drift apart on a page's shape or its status; the server feeds were refactored
    onto it with no behaviour change.
  - A broken server route with nothing from the browser throws `SportsApiError` (a
    deployment problem, not an ESPN outage) and the component keeps the data on
    screen; with at least one part from the browser the page keeps what ESPN
    answered. Cancellation is never reported as an unavailable board, and an
    already-aborted request runs no fallback at all. `?refresh=1` is passed through
    to the server fallback for a manual refresh.
  - Verified: `npm run typecheck`, `npm run test:sports` 344/344 (15 new: 14 for
    the transport — direct success with no server call, per-part merge, refresh
    passthrough, server explanation preferred, broken route thrown or tolerated,
    wrong-entity refusal, cancellation, bad ids never reaching the network, and
    the player endpoint order — plus one mounted spec proving a page ESPN answers
    in the browser never asks this site's endpoint), `npm run build`, `npx eslint`
    clean on every touched file, and a live smoke of both pages plus unchanged
    `/sports`, `/sports/matches/epl/1` and `/`. Not verified here: live ESPN
    payloads (no sandbox egress) and Playwright layout (no Chromium binary).

- Phase 18: A page for every match highlight ✅
  Constraint: highlights already existed as an API and a homepage card, but there
  was no page — no `/sports/highlights` route, no highlights section on the sports
  board or the match page, and none in the vendored NFL/NBA SPA. Add the page
  **without asking ESPN for anything new**. See
  [SPORTS_HIGHLIGHTS_PAGE.md](SPORTS_HIGHLIGHTS_PAGE.md).

  - `/sports/highlights` renders the board the homepage already loads
    (`getSportsHighlights`) and refreshes through the endpoint that already
    existed (`/api/sports/highlights?refresh=1`). No parser, feed, cache, endpoint
    or ESPN request was added, and the homepage card renders exactly as before.
  - It lists **every** clip rather than four behind a "Show all" control, and adds
    the two filters the sports board already speaks — competition and match state.
    Chips are derived from the board, so a competition or state with no clips is
    never offered and a filter cannot empty the page by construction; each chip
    carries its count and the state counts follow the chosen competition.
  - `?league=` and `?status=` are validated server-side before becoming a filter:
    a slug must be in `ESPN_LEAGUES`, a state must be one of the three, and
    anything else is ignored rather than turned into a request or an empty page.
  - It reuses the very same post card (`HighlightPostCard`, now exported from
    `SportsHighlightsFeed`), so a clip looks, plays and engages identically on the
    homepage and here — including the sample rules: a sample board stays labelled,
    contributes no anchor refs, and shows no engagement form at all.
  - Where the homepage card returns `null` for an empty board, the page says "No
    highlight clips right now", why, and prints the feed's own source report; a
    filter combination with nothing in it names the filters and offers "Show every
    clip". The header states that ESPN publishes per-game clips for some
    competitions and not others, so a missing competition reads as provider
    coverage rather than a broken page.
  - A refresh is one guarded request whose response must pass a local board
    validation before replacing anything; a malformed or refused response keeps the
    clips already on screen and says so.
  - Verified: `npm run typecheck`, `npm run test:sports` 350/350 (6 new specs
    mounting the page: whole board with no request on load, chip derivation,
    filtering and the no-match/clear path, query-string filters, sample vs live
    engagement, the empty-board state and source report, and refresh
    replace/keep), `npm run build` with `/sports/highlights` dynamic, `npx eslint`
    clean on every touched file, and a live smoke of the page, its filter
    variants, the new sports-board pill and four unchanged routes. Not verified
    here: live clips (no sandbox egress, so the labelled sample board renders).

- Phase 19: Every highlight, in every competition, kept for days ✅
  Constraint: ESPN has **no bulk highlights endpoint and no date range** — a
  game's clips live on that game's own `videos?event={id}` collection and a
  scoreboard takes one date per request. "Everything" therefore costs 121
  scoreboards per day (847 for a week) **plus one request per game**: thousands of
  calls, which cannot run inside a render and would risk a throttle on the host
  every other ESPN surface shares. Nor can the existing in-memory caches keep
  anything for days: they are per process and die on every deploy. So the reads
  move into Postgres and the fetching moves into the background. See
  [SPORTS_HIGHLIGHTS_INDEX.md](SPORTS_HIGHLIGHTS_INDEX.md).

  - Three tables, created by `ensureMigrated()` with the repo's existing
    idempotent DDL (no `prisma generate` needed): `sports_highlight_clips` (one row
    per distinct clip, unique `external_key`, `discovered_at` never changes),
    `sports_highlight_probes` (one row per game collection asked, so a collection
    that answered with clips is **never** asked again and an empty one is retried
    after 24 h, because ESPN publishes highlights hours after full time), and
    `sports_highlight_sweeps` (one row per competition per UTC day — the cursor,
    which survives a deploy and is shared by every instance).
  - Retention is **permanent**: nothing deletes a clip. `?days=` bounds the query
    (a year at most), not the storage.
  - `highlights-sweep.ts` walks a **bounded slice**: ≤24 scoreboards and ≤24 game
    collections per pass, 8 in flight (below the live board's 24, because this is
    background work sharing an upstream host), inside one shared 4 s deadline;
    day-major, so today across every competition comes before yesterday anywhere.
    Rate-limited per process (10 min opportunistic, 30 s explicit, 5 min per named
    competition) **including after a failure**, and concurrent callers share one
    pass. A pass reports cells walked, games asked, clips stored, requests made,
    seconds taken and whether it was truncated.
  - Upcoming fixtures are never asked; a game with no provider id is skipped, never
    guessed; a cell nobody answered is not recorded as walked, so it is retried.
  - **League video news is stored in the same index** (`kind = 'league'`), because
    it is the only clip source for competitions whose per-game collections are
    always empty — the Premier League and the NFL. A league clip keeps its fixture
    columns null and is rendered by `SportsVideoNewsCard`: no score, no kickoff, no
    match page, and nothing dressed up as a match.
  - `GET /api/sports/highlights` is **byte-identical without `index=1`**; with it,
    the response is `{board, index}` and the stored half costs **no ESPN request**.
    `?league=&status=&kind=&days=&limit=&offset=` are clamped server-side before
    SQL, and an unknown value is dropped rather than queried. A new
    `GET|POST /api/sports/highlights/sweep` runs one pass on demand.
  - `/sports/highlights` renders two labelled sources (the live board and the
    stored index) plus league video, dedupes a clip that is on both, pages with
    "Load more", and prints the sweep report verbatim — including when a pass did
    nothing because one ran recently. Chip badges count stored clips while anything
    is stored and say so; while the index is empty or unreadable they count the
    board's own clips, because a zero next to four cards would be a lie about those
    cards.
  - Engagement follows the clip: `resolveAnchorDraft` now falls back to
    `findStoredHighlightClip(anchorKey)`, so a like on a stored clip that has left
    the live board still creates its post. A stored clip and the same clip on the
    board share one anchor, so they share one post.
  - Without a database every store call resolves inert with a reason, the sweep
    makes **zero** requests, and the page shows the live board exactly as it did
    before this phase.
  - Verified: `npm run typecheck`, `npm run test:sports` **374/374** (24 new: 8
    index, 11 sweep, 5 page), `npm run build`, changed-file ESLint, a **real
    Postgres smoke** of the DDL, insert idempotency (`discovered_at` preserved,
    `seen_at` advanced), every filter, paging, the anchor lookup and both cursor
    tables — which caught two genuine `INSERT` column-count bugs the unit tests
    could not — and a live smoke in which a forced sweep honestly reported
    `{ok: true, cells: 0, requests: 36, truncated: true}` because this sandbox has
    no ESPN egress. Not verified here: real clips being stored, for the same
    reason. Coverage advancing without traffic is phase 20, and needs no cron.

- Phase 20: Coverage without a scheduler, and a homepage that reads what it stored ✅
  Two follow-ups to phase 19, both about making the stored index earn its keep on
  the render path. See
  [SPORTS_HIGHLIGHTS_INDEX.md](SPORTS_HIGHLIGHTS_INDEX.md).

  - **No cron, and no `vercel.json`.** Every trigger now calls
    `nudgeHighlightsSweep()`, which schedules the pass with Next's `after()` instead
    of a bare `void`. That distinction is the whole reason traffic-driven coverage
    works on a serverless host: a fire-and-forget call can be frozen the moment its
    response leaves — requests started, nothing stored — while an `after()` callback
    runs to completion. Outside a request scope `after()` throws, so the nudge falls
    back to the call it replaced and can never throw into a render. Triggers are the
    homepage, `/sports/highlights`, `?index=1` and the sweep button, so a first
    rotation of 847 cells (~36 passes) is about six hours of ordinary traffic; a
    quiet period stops growth and breaks nothing, because stored clips are
    permanent.
  - **The homepage reads stored clips first.** `getHighlightsBoardForRender()` asks
    Postgres for `kind=match` over the last seven days — the live board's own
    window, so the card's copy still holds — at most twelve clips, inside a 900 ms
    budget, and costs **zero ESPN requests**. Four or more stored clips is the board
    (`provenance: 'stored'`, `games` counted as the distinct fixtures its clips
    name, `source.url` the endpoint that produced the newest row, `httpStatus` left
    `null` because this render received no HTTP response). Fewer than four is a
    thinner card than twelve live clips, so the live board answers as before and the
    stored clips it is missing are appended, deduplicated by clip id, live clips
    first in their own order.
  - A stored board reports `status: 'live'`, because that is what it is: the feed
    only dresses cards as samples — and strips their anchor post, so no Like button
    — when a board is neither live nor partial. `provenance` is optional on the
    board type, so the feed, the bundled sample board and a page's empty board are
    all still valid untouched, and no consumer branches on it.
  - Storage that is missing, slow, empty, throwing or reporting a failed query
    degrades to exactly the board the homepage rendered before this phase, sample
    cards included.
  - Also fixed a **pre-existing** flake in `highlights-feed.test.ts`: a spec that
    seeded the finished-fixture pool 16 minutes old and then asserted against
    `Date.now()` at assert time, so it failed for the first 16 minutes of every UTC
    day and passed again at 00:17 with nothing in `src/` changing. Both expectations
    now come from the bracketed seed instant, and a second spec locks the rule with
    fixed timestamps instead of waiting for midnight.
  - Verified: `npm run typecheck`, `npm run test:sports` **386/386** (12 new: 11 for
    the board read, 1 for the midnight rule), `npm run build`, changed-file ESLint,
    a **real-Postgres seed-and-delete** in which 6 stored match clips across 5
    fixtures made the homepage board `provenance: stored` with `games: 5` in 84 ms
    and no league clip on it, then went back to the bundled sample board once the
    rows were deleted — a **marker route** proving a pass starts *after* the handler
    returns, so `after()` and not the fallback ran — and a control/experiment on the
    running preview in which a forced sweep ran a pass with no recent traffic and
    returned `rate-limited` after loading only the homepage, proving the homepage is
    a trigger. Not verified here: real clips being stored, no sandbox ESPN egress.

- Phase 21: A news video's rendition is resolved once, and kept ✅
  League video news was already stored as `kind='league'` rows, but a listing from
  ESPN carries no media URL — only a clip page and an id — so those rows stored
  `mp4`, `hls`, `duration` and `playable` as null. The playable rendition was
  resolved per clip when a reader pressed play and cached **in memory for 15
  minutes**, which meant the same popular clip was resolved again after every
  deploy, on every instance, and could not play at all while ESPN was unreachable.
  See [SPORTS_HIGHLIGHTS_INDEX.md](SPORTS_HIGHLIGHTS_INDEX.md) and
  [ESPN_VIDEO_NEWS.md](ESPN_VIDEO_NEWS.md).

  - No new table — the columns already existed. `resolveVideoNewsMedia` now asks
    the index before ESPN and writes an answer back onto the clip's row, so a
    rendition is resolved **once per clip rather than once per process**, survives a
    deploy, and plays with ESPN unreachable. A partial index
    (`… WHERE "kind" = 'league'`) serves the lookup by ESPN's clip id.
  - A sweep **pre-warms at most six renditions per pass** (`MEDIA_WARM_PER_PASS`),
    newest first, inside the pass's existing 4 s deadline: only rows whose media
    columns are still null, skipping any clip that refused within the same 24 h the
    collection rule uses and any already answered in memory, so `pass.requests`
    stays exact. A row stops appearing in that query once stored, so the work
    converges instead of repeating. `pass.mediaWarmed` reports it.
  - A refusal is recorded as a probe (`media:{clipId}`) but **never stored as a
    fact**: a rendition that cannot play updates no row, and a reader who presses
    play again still gets a fresh attempt. The probe steers a sweep's pre-warm, it
    does not lock a reader out.
  - **A re-store can no longer wipe what is known.** The upsert merges the media and
    URL columns with `COALESCE(EXCLUDED.x, table.x)` and derives `playable` from the
    merged `mp4`, because a pass re-reads the league listing every 15 minutes with
    no media on it — a plain assignment would have nulled every resolved rendition
    on the next join. A rendition fills gaps beside it (a row whose listing had no
    thumbnail takes the rendition's) but never replaces a value the listing stored.
  - Verified: `npm run typecheck`, `npm run test:sports` **398/398** (12 new: 3
    index, 4 feed, 5 sweep), `npm run build`, changed-file ESLint, a **real-Postgres
    probe** (deleted in the same run) covering the index, the rendition round-trip,
    the thumbnail precedence both ways, the re-store survival with `discovered_at`
    unchanged and `seen_at` advanced, the clamp to 12 newest-first, and a
    nothing-playable write updating no row — plus a live check in a sandbox with no
    ESPN egress where `clip?id=…` returned `playable: true` with the stored mp4 (an
    answer that could only have come from Postgres), a clip with no stored rendition
    returned `playable: false` with `no-store`, and id validation still returned 400.

- Phase 22: One match centre, and a Live tab that collects the desk ✅
  The homepage rendered the same fixtures from **two different boards**: a compact
  summary in the mobile column and a rail in the desktop column, where the second
  component called `getSportsBoard()` itself. A cold cache paid for the
  121-competition fan-out twice per render, and — worse — the two surfaces could
  disagree, because they were two snapshots taken at different moments. On top of
  that, a fixture the For You feed already carried as a card was repeated beside it.
  Detail in [SPORTS_CHECKS.md](SPORTS_CHECKS.md#the-homepage-match-centre).

  - `SportsMatchCentre` replaces `SportsScoresWidget` **and** `SportsLiveWidget`
    (both deleted). It cannot fetch: both surfaces take the page's board as a prop,
    so one render pays for one board and the two surfaces cannot disagree.
  - One row rule in `src/lib/match-centre.ts`: live first, then one fixture per
    competition before a second from any, and a fixture the feed already shows as a
    card is **deprioritised rather than dropped** — never deprioritised while live.
    Dropping every mentioned fixture would empty the centre on a quiet day, which is
    a hole rather than a deduplication, so rows fill from fresh fixtures first and
    only then repeat.
  - The rail carries a count of what ESPN reports as in play, computed only from
    `source: 'espn'` fixtures, so a sample board still says "Sample fixtures".
  - A fourth `FeedTabs` tab collects the desk: up to six fixtures by the same rule,
    then predictions, then league video news, with a prediction already attached to
    a fixture not repeated beside it. For You keeps its own cards at their own
    slots. The tab's own summary is counted by `summariseLiveCards`, so a fixture
    this site invented is listed but never counted as live.
  - Verified: `npm run typecheck`, `npm run test:sports` **439/439** (12 new centre
    specs, 5 new tab specs driven in jsdom), changed-file ESLint, `npm run build`.
    The Playwright spec lost the `SportsLiveWidget` substitution it needed only
    because that widget fetched its own board; its invariants are unchanged
    (exactly one visible "Sports scores" region, both competitions named, no "LIVE"
    on a sample board) but it cannot run in this sandbox.

- Phase 23: A pick is a pick, and it gets graded ✅
  A pick used to become a post — free text with the odds pasted in — which no
  surface could ever answer, so a prediction was decoration. Detail in
  [SPORTS_PICKS.md](SPORTS_PICKS.md).

  - New `sports_picks` table: a side, the price ESPN reported when it was taken,
    both team names as reported then, the kickoff, and — once a result arrives — an
    outcome, a point and the score that decided it. Unique per reader per fixture,
    with a partial index for the grader's read.
  - Three rules hold it honest: a pick is addressed by **league slug plus ESPN's
    event id**, never a team name; it **locks at kickoff**, decided server-side from
    the kickoff the odds board reported rather than a browser clock, and the first
    pick stands; and it is **graded only from a result ESPN reported** — a missing or
    fractional score leaves it awaiting a result instead of being rounded into one,
    and a sample fixture is never a result.
  - One point per correct pick, ranked `points DESC, graded ASC`, with the record
    shown beside the score. A price-weighted total would compare readers who picked
    at different prices and cannot be computed when no price was reported. The
    viewer's rank is counted with the same comparison the ordering uses, so a rail
    cannot say "3rd" above a list that disagrees.
  - Grading rides on traffic — no cron: `nudgePickGrading()` schedules a pass with
    `after()` behind **the homepage only**, rate-limited to one per ten minutes per
    process, reading the board that page has just fetched with no cache bypass, so a
    pass normally costs **zero ESPN requests**. The predictions page does not nudge,
    because it reads odds and a pass there would pay for a full scoreboard fan-out.
    At most 12 picks per pass, oldest kickoff first; graded rows leave the read, so
    the work converges.
  - With no database there is no rail at all rather than an empty one: "no graded
    picks yet" and "picks are not being stored" are different claims.
  - Verified: `npm run typecheck`, `npm run test:sports` **439/439** (24 new specs,
    including seven pass specs against an injected store), changed-file ESLint,
    `npm run build`, and a **real-Postgres probe** (deleted in the same run) covering
    all four indexes, a second pick refused by the unique index with the original
    returned, the multi-array `unnest` grading UPDATE and its idempotence, the
    leaderboard's ordering, record, reader count and both readers' ranks, the clamped
    window, and convergence. The probe caught a bug no spec could: `JOIN "users" AS
    user` is a **syntax error in Postgres** (`user` is reserved), so the leaderboard
    query had never run — the alias is now `reader`.
  - Not verified here: no pick has been taken against live ESPN odds, because this
    sandbox has no egress to ESPN and the odds board is empty — which the action
    reports correctly rather than storing a pick it cannot check.

- Phase 24: The feed carries every fixture, and the DOM stays bounded ✅
  For You showed **two** matches and the Live tab **six**, whichever the board
  reported. Both caps are gone: the feed now carries every fixture on the board —
  live, upcoming and finished, from any of the 121 configured competitions and any
  sport. Detail in
  [SPORTS_CHECKS.md](SPORTS_CHECKS.md#how-many-matches-the-feed-carries).

  - **The list is unbounded; the DOM is not.** A match card is a client component
    with its own state, poll and share affordances, and a busy day across the whole
    catalog can report a thousand fixtures, so a tab materialises
    `FEED_RENDER_BATCH = 24` cards and offers the rest with a control that states
    what is left ("Show 24 more · 276 remaining in this tab"). Every card the page
    built is reachable, the control disappears when nothing is left, and switching
    tab starts from the first batch again. Nothing was removed from the feed to make
    the page fast — only from the initial render.
  - For You asks `featuredSportsEvents(events, events.length)`, keeping the rule it
    already had rather than adding a second one: one fixture per sport first, so the
    four cards interleaved at slots 1, 3, 5, 7 are not four football matches on a
    football-heavy day, then every remaining fixture in the board's own order. The
    rest follow the member posts instead of displacing them, so the feed still reads
    as a feed for its first screenful.
  - The Live tab uses `orderCentreEvents` directly — the board's own order, whole and
    unranked, because a list that shows everything has no scarce rows to spend on one
    fixture per competition. `LIVE_TAB_MATCHES` is deleted.
  - The centre surfaces keep their bounds (2 compact, 4 rail). Now that the feed
    carries every fixture, the rail's fresh tier is the live ones and the rest fill
    from the board; it still never drops a fixture, so a quiet day still fills its
    rows.
  - No extra ESPN cost: the board was already fetched once per render, so this spends
    data that was in memory and changes only what is rendered from it.
  - Verified: `npm run typecheck`, `npm run test:sports` **447/447** (8 new: every
    fixture returned when asked for every fixture with the sport-diverse head kept, an
    uncapped Live tab ordering, a 1,000-fixture board listed whole by the tab and still
    bounded to four rows in the rail, and five batching specs — one batch rendered with
    an honest remaining count, the whole list reachable, a partial last batch, no
    control when nothing is withheld, and the batch resetting on tab switch),
    changed-file ESLint, `npm run build`, and the rendered homepage DOM.

- Phase 25: Basketball and NFL fixtures wear the dashboard's match card ✅
  The feed's match card was one shape for every sport. Basketball and American
  football — the NBA, WNBA, both NCAA basketball divisions and the NFL — are now
  drawn as the NFL & basketball dashboard's own score card, so a fixture reads the
  same in the feed and on the page the feed sends a reader to. Detail in
  [SPORTS_CHECKS.md](SPORTS_CHECKS.md#basketball-and-american-football-the-dashboards-score-card).

  - Two crests either side of a `V/S`, a competition chip in that league's colour
    from the dashboard's catalog, a clock pill, one row per side with its score, and
    a footer naming the broadcaster. The dashboard's structure and words, in this
    app's light and dark palette rather than its dark panel, so the card sits beside
    the others instead of punching a hole in the column. Home is first, as it is on
    the dashboard.
  - The card replaces the league and date row, the badge-and-score box, the separate
    match link and the kickoff and venue row. It does **not** replace the rest of the
    post: the author header and its status chip, any prediction, and Comment / Poll /
    Share all stay, so a basketball fixture is still something a reader can talk
    about. Every other sport keeps the card it had, byte for byte.
  - It links to the dashboard's match page — `/nfl-basketball/{basketball|nfl}/match/{id}`,
    with `?competition=` for every league that is not that board's flagship — exactly
    as the dashboard's own `matchPath` decides it. A league the dashboard does not
    serve falls back to this app's `/sports/matches/{league}/{id}`; a fixture with no
    ESPN-reported numeric id falls back to `/sports`. Never a dead click, never a link
    to a page that cannot answer for the fixture.
  - Honesty rules kept, and moved into `score-card.ts` so they cannot drift: a sample
    fixture never wears a live clock or a `Final` (it shows its kickoff, neutral tone,
    while its chip still says "Sample fixture"); a score the provider did not report is
    an em dash, while a real zero stays a zero; an unnamed broadcaster is "TV TBD"; a
    logo that fails to load falls back to the team's code.
  - New data: `SportsEvent.broadcast`, read from the scoreboard the board already
    fetches the same way the dashboard reads it — first broadcast name, else media
    short name, else null. No extra request anywhere.
  - Verified: `npm run typecheck`, `npm run test:sports` **464/464** (17 new, including
    five that mount the real card in jsdom and read it — home first, both scores,
    crests for missing logos, a logo that fails to load falling back to its code, a
    sample fixture showing scores but never a live clock, a finished fixture reading
    "Final"), a spec that walks every basketball and American football league in the
    catalog and fails if one has nowhere to send a reader, changed-file ESLint,
    `npm run build`, all six dashboard routes at 200, a client-bundle audit (the card's
    own strings and league colours ship to the client; no Prisma, `next/server` or
    query fingerprints), and the rendered homepage DOM: the NBA sample fixture as one
    score card, tone `soon`, crests LAL/BOS, home-first rows 78 and 74, `TV TBD`,
    linking to `/sports` because a sample has no match page — and the other 15 fixtures
    unchanged.

- Phase 26: Highlights are in the feed, all of them, newest first ✅
  Match highlights lived in their own section beside the feed, at most 12 clips, and
  the feed itself carried none. For You now carries **every** stored clip in the
  window, newest to oldest, each one the same card the section renders — a highlight
  is something a reader can like, comment on and save, not a panel they have to leave
  the feed for. Detail in
  [SPORTS_CHECKS.md](SPORTS_CHECKS.md#highlights-in-the-for-you-feed).

  - **The list is unbounded; the DOM is not**, by the rule Phase 24 set for match
    cards: `FEED_RENDER_BATCH = 24` cards materialise at a time and the rest are
    offered by the control that states how many remain. Clips get their own
    interleave pass at `HIGHLIGHTS_FEED_SLOTS = [4, 9]` — last, so the desk's score
    cards and the league video keep the slots they already had, and nothing is
    removed from the feed to make room for a highlight.
  - The two surfaces are now deliberately different, and say so by what they show:
    the section stays a bounded summary of 12 with a link to `/sports/highlights`,
    and the feed is the whole seven-day window. `STORED_BOARD_CLIPS`, `MAX_GAMES`
    and `MAX_CLIPS` are untouched — the feed's "no max" comes from its own read, not
    from loosening the board's.
  - A new lean read, `readFeedClips`: two indexed queries, the rows and a
    `count(*)`. It cannot reuse the index page's `read()`, which spends five queries
    building summaries, per-competition totals and per-state counts a feed never
    looks at. Its ceiling is the feed's own `FEED_INDEX_LIMIT = 300` rather than 60
    rows per page, and `remaining` reports what the ceiling withheld, so a ceiling is
    never silent. Only `kind = 'match'` rows; league video is a separate stack.
  - **One order, two sources.** Clips come from stored rows and from a live board
    the sweep has not stored yet, deduplicated by id and ordered by the clip's own
    time with the index's `id DESC` tiebreak — `orderHighlightClips` in memory is the
    same rule as `ORDER BY occurred_at DESC NULLS LAST, id DESC` in SQL, so a feed
    assembled from either source runs the same way and the two surfaces cannot
    disagree about what is newest. A clip with no reported time goes last rather than
    jumping to the front.
  - **Honesty rule kept:** a board ESPN did not answer contributes nothing to the
    feed. The section dresses sample clips in a heading that says what they are; a
    card in the middle of the feed has no such heading, so a sample there would read
    as a real highlight nobody can play. No clips is the honest answer when there are
    none.
  - No extra ESPN cost and no new failure mode: the read is raced against
    `FEED_BUDGET_MS = 1200` and never throws, so storage that is missing, slow or
    broken leaves the feed with the board the page already had — what it showed before
    this existed. The player keeps `preload="none"`, so carrying 300 clips does not
    mean fetching 300 clips.
  - Engagement for every card, not just the first 60: the anchor lookup takes a
    `maxRefs` (ceiling `MAX_ENGAGEMENT_REFS = 400`, sized so a full feed plus the
    boards beside it fit one query), and `dedupeAnchorRefs` orders the groups so a
    ceiling would cut the oldest card deep in a batch rather than a card always on
    screen. A cut ref would render a Like count of zero over a clip that has likes —
    a wrong number rather than a missing one.
  - Verified: `npm run typecheck`, `npm run test:sports` **479/479** (15 new: the
    order rule, the merge, a sample board contributing nothing, every way storage can
    fail degrading to the board, the window and ceiling asked for, `remaining`, the
    interleave leaving existing cards where they were, and the ref ordering),
    changed-file ESLint, `npm run build`, five routes at 200.
  - Proved against a **real PostgreSQL 18 cluster**, because this sandbox has no
    egress to ESPN and the index stays empty here: 8 rows through the real store path,
    then the window, the kind filter, the order, the clamps, `remaining`, the feed's
    provenance and a budget miss all read back as specified — **15/15** — with an
    anchor post created from a stored clip reachable at ref 90 of 90 under `maxRefs`
    while the old bound of 60 could not reach it. Every seeded row was deleted
    afterwards; a temporary 30-clip seed confirmed the rendered page carries all 30
    with the two newest carded in the first batch, then left no trace.
  - Not verified here: no clip has been stored by a live sweep against real ESPN,
    because this sandbox cannot reach it. The rules that decide what a reader sees
    when it can are the ones tested above.

- Phase 27: Every stored clip and fixture is a page a crawler can reach ✅

  Search Console reported **11 indexed pages, zero impressions, zero clicks** on a
  site holding 667 real stored highlight clips. The audit ranked seven causes; this
  phase is the first three, in order of what they cost.

  - **The homepage told Google the site was a demo.** It rendered four sample cards
    with copy reading "sample value while ESPN is unreachable" *while* the stored
    index beside it held 667 fresh, playable clips. The cause was a budget, not the
    data: `BOARD_BUDGET_MS = 900` raced a five-query `store.read()` on a pooled
    connection and lost, and losing fell through to the live feed's samples. The
    budget is `1_500` and, more importantly, the stored board is **remembered** for
    15 minutes so the render never has to win a race it already won once — memory is
    used only when nothing was stored, so "too few clips" still falls through and a
    stale board can never be served over a fresher one. Verified by rendering the
    homepage against a real server: stored clips, and no sample-card copy anywhere.
  - **The clips had no URLs.** Each is now a page at `/sports/highlights/{id}`, keyed
    by the same identity its post anchor uses so a card, its Like button and its
    permalink cannot disagree about which clip they mean. Server-rendered from
    storage, `VideoObject` + `BreadcrumbList`, the clip's thumbnail as the shared
    image, 404 for anything never stored. Nothing on the page claims a fact ESPN did
    not report: no thumbnail means no `VideoObject` rather than one with an invented
    image, no reported length means no `duration`, and a description that is only the
    title again is assembled from the fixture, competition, state and length instead.
  - **Nothing linked to them, and the sitemap asked for the wrong pages.** Clip cards
    gained a visible "Highlight page" link — the card-wide href goes to the fixture's
    board and the menu's links exist in the DOM only once opened, so neither was
    crawlable. The sitemap gained `/sports/highlights` plus one URL per stored clip,
    and **dropped the dashboard's 96 hub/team/player URLs**: they are one
    client-rendered document over the vendor's bundled sample data ("Sample
    schedule"), and on a site this size they were spending nearly all of the crawl
    budget on pages that say nothing true.
  - **A match page is indexable only when this server can describe it.**
    `/sports/matches/…` was `index: false` because it was a shell — a crawler arrived
    at an `<h1>` reading "Loading match details…". But every stored clip carries the
    fixture's own reported facts, so a fixture with clips now renders them as prose
    before any browser fetch, links its clips, and marks itself `index: true` with a
    `SportsEvent`. A fixture with nothing stored **stays exactly the shell it was** —
    an index full of empty match pages would be worse than none. This is the long
    tail: 595 finished fixtures with real stored clips.
  - Two rules made the fixture page possible. `readEventClips` matches a stored
    `event_id` exactly **or as a dash-separated prefix**, because the id is
    namespaced (`espn-{league}-{id}`) and a scoreboard reporting more than one
    competition appends to it — a clip's id cannot be turned into a match URL by
    string surgery, and a match page finds its clips by prefix instead. And
    `storedMatchReference` reverses that prefix into a match reference **only** when
    the stored id really is this site's namespaced form, refusing anything else: a
    match URL built from a guess is a 404, and a 404 a crawler meets is remembered
    longer than a page it never found.
  - Verified: `npm run typecheck`, `npm run test:sports` **484/484**,
    `npm run test:seo` **52/52**, changed-file ESLint with 0 errors, `npm run build`,
    and a real server rendering the clip page (`index, follow`, own canonical,
    `og:type video.other`, both JSON-LD blocks), an unknown clip id at 404, a fixture
    page with the fixture in its `<h1>` and no "Loading" text in the HTML, a
    fixture with nothing stored still `noindex`, and a sitemap carrying one deduped
    match URL and one per clip.
  - Proved against a **real PostgreSQL 18 cluster**, which caught a bug no spec
    could: `readStoredClip` passed `rows[0]` to `rowToMatchClip` without checking the
    row existed, so every unknown clip id threw and was logged as a failed query —
    a crawler asking for ids that do not exist is ordinary traffic, not an error.
    Every seeded row was deleted afterwards.
  - Not done here, deliberately: real editorial content and de-seeding the demo
    profiles and groups (cause 6), and the minor sitemap cleanups — `/search`,
    `/login`, `/signup` and the 13 demo profile URLs are still submitted, static
    routes still carry no `lastModified`, and the homepage still links to
    `Disallow:`ed `/messages/*` pages. Those are cause 7 and out of this phase's
    scope.

- Phase 28: The sitemap asks only for pages worth visiting, and dates them honestly ✅

  Phase 27 filled the sitemap with 667 clips and 595 fixtures. This phase stops it
  asking for the pages that were wasting the budget those needed, and gives the
  static routes a date they can actually support. Both decisions live in
  `src/lib/sitemap-rules.ts` as pure rules, because a sitemap is a request rather
  than an inventory and the reasoning belongs somewhere testable.

  - **`/login`, `/signup` and `/search` are no longer submitted.** Two forms with no
    content, and a query surface that invites a crawler into an unbounded space of
    near-duplicate result pages it can never finish. All three stay reachable and
    indexable — nothing blocks them, the site just stopped asking.
  - **Two kinds of account are not submitted.** The sports desk is a system account
    that authors the anchor posts, and Discover, people suggestions and the homepage
    contacts rail already leave it out; a sitemap is the same kind of list. The five
    seeded demo accounts live at `example.com`, reserved by RFC 2606 and created by
    both seeds in this repo with a password published in the repo — five people who
    do not exist, with generated avatars and the same five bios as every other
    installation of this app.
  - The desk is recognised by `SPORTS_DESK.email`, not by its
    `accountType = 'broadcaster'` column: the committed Prisma client predates that
    column and this repository does not regenerate it, which is also why
    `discover/page.tsx` filters on the address. **The rule excludes only on positive
    evidence** — an account with no address, or at a domain the rule does not
    recognise, is submitted, because dropping a real member's page is a worse mistake
    than listing one account that should not have been there.
  - **A page is dated by the newest thing it renders**: `/` and `/discover` by the
    newest public post, `/groups` by the newest public group, `/sports` and
    `/sports/highlights` by the newest stored clip. All three reads already return
    newest-first, so dating a page costs no extra query. `/sports/predictions` gets
    no date (live odds carry no stored instant) and neither do `/about` or `/privacy`
    (their copy changes when a person edits it): a constant that has to be remembered
    and bumped is a date that eventually lies, and a made-up `lastmod` is a lie in
    the one file a crawler is told to trust.
  - **The homepage stopped linking where robots.txt says not to.** `/messages`,
    `/notifications` and `/settings` are disallowed, yet the anonymous homepage handed
    a crawler seven links to them — both contacts rails linking every contact to
    `/messages/{id}`, the rail's heading to `/messages`, and the desktop nav and
    mobile tab bar to `/messages` and `/notifications` unconditionally. Those now
    depend on whether anyone is signed in, following the pattern the nav's own
    Profile link already used: to a member a contact is a conversation, to a visitor
    it is a person, and the person's page is the one worth crawling. `MOBILE_TABS`
    gained a `memberOnly` flag so the account tabs point at signing in for a visitor
    while Home, People, Sports and Groups keep working for guests. The anonymous
    homepage now contains **zero** links to a disallowed route.
  - Verified: `npm run typecheck`, `npm run test:sports` **484/484**,
    `npm run test:seo` **60/60** (8 new sitemap-rule specs plus extended sitemap
    specs), changed-file ESLint with 0 errors, `npm run build`, and a running server
    against the real seeded database: the three routes absent, **zero** of the five
    demo profiles submitted, `/`, `/discover` and `/groups` dated by their own newest
    row, `/sports*` undated while the clip table is empty rather than inventing a
    date, and no disallowed link in the anonymous homepage.
  - **Known gap at the time, closed in Phase 29:** the demo profiles were still
    linked from the homepage rails, so a crawler could still discover them even
    though the sitemap no longer submitted them — removing a URL from a sitemap
    lowers its priority, it does not hide the page.

- Phase 29: A profile that is not a person is not indexed ✅

  Phase 28 stopped submitting the sports desk and the five seeded demo accounts, but
  a sitemap is a request and not a barrier: those profiles are still linked from the
  homepage rails, so a crawler still finds them and still has to decide what they
  are. Five generated avatars with the same five bios as every other installation of
  this app, presented as members of a community, is exactly the page that makes a
  young domain look like a template.

  - Those profile pages now carry `noindex, follow`. `follow` stays on, as it does
    for a private profile, because what a page links to is judged for itself — a
    noindexed author does not take their posts and groups with them.
  - **One rule, two call sites.** Which accounts belong to the app rather than to a
    person moved to `src/lib/app-accounts.ts`, and both the sitemap and the profile
    page ask it, so they cannot drift into submitting a page they do not index or
    indexing one they will not submit. The detection is unchanged: the desk by
    `SPORTS_DESK.email`, the demo people by the RFC 2606 reserved domains both seeds
    use.
  - **It still excludes only on positive evidence.** An account with no address, or
    one at a domain the rule does not recognise, is a person as far as it is
    concerned — hiding a real member from search is a worse mistake than leaving one
    account that should have been hidden. That was the whole reason this was an
    owner's decision rather than a default, and it is why the rule was kept narrow
    enough to be safe to apply: `someone@notexample.com` and `desk@hyper.co.ke` are
    people, and only the desk's own address is the desk.
  - The address decides the flag and is never published: the profile's `select`
    gained `email` for this one comparison, and the specs assert it appears nowhere
    in the metadata — not in the title, the description or the share cards.
  - Verified: `npm run typecheck`, `npm run test:sports` **484/484**,
    `npm run test:seo` **65/65** (5 new detection specs, 4 new profile-metadata
    cases), changed-file ESLint with 0 errors, `npm run build`.
  - Proved against a running server and real rows, in both directions: all five
    seeded profiles serve `noindex, follow`; a temporary member at `gmail.com` and a
    lookalike at `notexample.com` both serve `index, follow`; the desk's own address
    serves `noindex`; and while those three rows existed the sitemap submitted
    exactly the two members and neither app account — submitted and indexable agree.
    All three temporary rows were deleted afterwards and the table is back to the
    five it started with.
  - Found while verifying, and fixed in Phase 30: `/profile/{id}` returned HTTP 200
    for an id that did not exist.

- Phase 30: A missing profile is a 404, not a 200 that says so ✅

  Phase 29 made the profiles that are not people unindexable, and verifying it turned
  up the defect underneath: `/profile/{id}` answered **HTTP 200** for an id that did
  not exist, with a body reading "User not found." The metadata was honest —
  `noindex`, generic title — but the status was not, so a crawler walking
  `/profile/1..n` found an unbounded space of soft 404s, each one costing a visit and
  saying nothing. Search Console reports those separately from real 404s, and a site
  this young does not have visits to spare.

  - **A missing row rendered a sample person.** With the database reachable and no
    such member, ids 1–5 fell through to the hardcoded `DEMO_USERS_MAP` and rendered
    five people who do not exist. A configured database that has no such member is a
    404. The offline demo install, which has no database to ask, keeps its fallback —
    this changes what a real deployment says about a missing member, not what a
    laptop with no Postgres shows a developer.
  - **`parseInt(id) || 1` guessed.** `/profile/abc` became member 1 and
    `/profile/12abc` became member 12 — a page whose URL names nobody rendering
    somebody, at 200, while the metadata parsed strictly and described nobody. The
    two disagreed about which member was on screen. `profileIdFromRouteParam` is now
    the one rule, in `src/lib/profile.ts`, and the page and its metadata both ask it:
    an id is a positive integer written in full, or it is not an id. Padded,
    truncated, signed, fractional, zero, negative and past-a-safe-integer addresses
    are refused rather than guessed at, because a guess renders a real person under
    an address that is not theirs.
  - `notFound()` is called **outside** the page's `try` on purpose. It throws to
    unwind, and the catch that handles a database outage would otherwise swallow it
    into the demo fallback — a 404 that never reaches the client. A database outage
    still falls back rather than 404ing, because a transient failure must not tell a
    search engine a page does not exist.
  - **`src/app/not-found.tsx` now exists**, because without it `notFound()` rendered
    Next's bare fallback: an empty body, no navigation, nothing to read. It says what
    happened, guesses honestly at why, and points at five pages that carry content —
    and it answers every unmatched URL on the site as well as the five routes that
    throw `notFound()`: profile, clip, match, team and athlete.
  - Verified: `npm run typecheck`, `npm run test:sports` **484/484**,
    `npm run test:seo` **69/69** (3 new route-rule specs plus a metadata spec proving
    a non-id asks the database for nobody), changed-file ESLint with 0 errors,
    `npm run build`. Then against a dev server **and a production build**:
    `/profile/999999`, `/profile/abc`, `/profile/12abc`, `/profile/0`, `/profile/-5`
    and a 25-digit id all answer 404, `/profile/1` and `/profile/5` still answer 200.
  - **Known limitation, found by checking the production HTML rather than assuming:**
    an unmatched URL server-renders the new 404 page in full, but a `notFound()`
    thrown from a page streams — the HTML carries the flight payload, a client renders
    the page on hydration, and a client without JavaScript sees an empty body. The
    status is 404 either way, which is what a crawler acts on, and it is framework
    behaviour for every thrown `notFound()` in this app rather than something these
    routes do. Not browser-verified: this sandbox has no Chromium.
  - Found while verifying, and fixed in Phase 31: `/post/{id}` and `/groups/{id}`
    returned HTTP 200 for an id that did not exist — the same soft 404, two more
    unbounded id spaces.

- Phase 31: One rule for every id this site takes from a URL ✅

  Phase 30 fixed `/profile/{id}`. The other two routes that take an id had the same
  soft 404, and fixing them separately would have left three parsers — which is how
  the site got here. Each was loose in its own direction: `parseInt(id) || 1` turned
  `/profile/abc` into member 1, `Number(raw)` turned `/post/1e3` into post 1000 and
  `/post/0x10` into post 16, and `parseInt(id)` handed `/groups/abc` a NaN that
  Prisma rejected — and the rejection was logged as a database failure. A URL that
  named nobody rendered somebody, at HTTP 200.

  - **`routeIdFromParam` in `src/lib/route-id.ts` is now the one rule**, and all
    three routes ask it in the page *and* in its metadata, so neither can describe a
    record the other is about to say does not exist. It replaces
    `profileIdFromRouteParam`, the same rule under a name that only fitted one of the
    three. An id is a positive integer written in full, or it is not an id; padded,
    truncated, signed, fractional, exponential, hexadecimal, zero, negative and
    past-a-safe-integer segments are refused rather than guessed at, because a guess
    renders a real person, group or post under an address that is not theirs.
  - **`groups/[id]` was worse than soft.** It called `redirect('/groups')` for a
    missing group *inside* the `try` whose `catch` turns a failure into a placeholder
    page, so its own error handler caught the throw, logged
    `[group detail] DB query failed: NEXT_REDIRECT`, and never redirected — the page
    rendered "Demo Group" at 200. The lookup is its own step now and the 404 is
    decided outside the `try`, because a throw that unwinds must not be caught by a
    handler whose job is coping with a database that could not be reached. **"No such
    group" is an answer; "the query failed" is a failure**, and only the second may
    fall back. The same trap, avoided deliberately, is why Phase 30 put the profile's
    `notFound()` outside its `try`.
  - A missing group is a **404 rather than the redirect it used to attempt**: an
    address that names no group is not another page's address, and a crawler told the
    two are the same learns the wrong thing. A database outage still falls back at
    200, because a transient failure must not tell a search engine a page does not
    exist.
  - `post/[id]` already told the two apart — it carries a `dbError` flag — so its 404
    is precise: `hasDatabase && !dbError && !post`. Offline demo mode and an
    unreachable database still render their own explanation at 200, which is all the
    "This post isn't available" copy is for now.
  - Verified: `npm run typecheck`, `npm run test:sports` **484/484**,
    `npm run test:seo` **70/70** (a new spec proving a non-id asks the database for
    nobody on both routes, and that `/post/0x10` no longer reaches post 16),
    changed-file ESLint with 0 errors, `npm run build`. Then against a dev server
    **and a production build**: `/profile/999999`, `/groups/999999`, `/groups/1e3`,
    `/post/0x10` and `/post/12abc` all answer 404, while `/profile/1`, `/groups/1`
    and `/post/1` still answer 200 and still render their own content — the group its
    real name and members, the post its real text — rather than a placeholder. The
    `NEXT_REDIRECT` warning is gone from the server log.
  - With that, the routes that take a **record id** answer 404 for an id they do not
    have: profile, group, post, clip, team and athlete. The three unbounded id spaces
    a crawler could walk — `/profile/1..n`, `/groups/1..n`, `/post/1..n` — no longer
    pay 200 for nothing.
  - Found while verifying, and fixed in Phase 32: `/sports/matches/{league}/{eventId}`
    answered HTTP 200 for an address that names no fixture — a soft 404 with the right
    content and the wrong status, caused by the route's `loading.tsx` flushing the
    status line before the page could throw. Left out of this phase deliberately: it is
    a UX trade-off on a route outside its scope, and should not be decided silently.

- Phase 32: The match page's 404 was already on the wire before the page could throw ✅

  Phase 31's verification turned up a third soft 404 of the same class, on a route
  whose own logic was already correct.

  - `/sports/matches/{league}/{eventId}` answered **HTTP 200** for an address that
    names no fixture — `/sports/matches/nhl/abc` and `/sports/matches/zzz/401892706`
    both served the not-found body at 200, on a dev server **and** in a production
    build. The right content with the wrong status, which is what a crawler records as
    a real page.
  - It was not the route's logic. `resolveMatch` throws `MatchInputError`, and both the
    page and its metadata call `notFound()` exactly as the team and athlete routes do —
    and those answer 404. `matchReference` even requires `/^[1-9]\d{0,19}$/`, the same
    shape as Phase 31's `routeIdFromParam`, so this route always had the strict rule
    and was only prevented from acting on it.
  - **The cause was `loading.tsx`**, which this was the only route in the app to have.
    It wraps the page in a streaming `<Suspense>` boundary, so the shell — and with it
    the HTTP status line — is flushed *before* the page runs. By the time `notFound()`
    throws, 200 is already on the wire and the not-found content arrives later in the
    stream. The same flush-before-the-throw mechanism as the empty body of a thrown 404
    (Phase 30), seen from the status side rather than the body side.
  - Proven rather than assumed: moving the file aside turned all three bad addresses
    into **404** while the real fixture stayed **200**; restoring it brought the 200s
    back. That is what made the cause certain enough to act on.
  - **Deleted.** Two options were on the table — delete the placeholder, or move the
    stored-clip read into a `<Suspense>` child so the page settles the status before
    anything flushes and keeps the instant line. The second is a restructure of Phase 27
    code with 10 specs on it, for a placeholder that turned out to be redundant:
    `SportsMatchDetails` renders the same "Loading ESPN match details…" copy itself
    while it fetches (`src/components/SportsMatchDetails.tsx:153`), so the deleted file
    only covered the interval before the server responds — an interval no other route on
    this site covers either. Nothing in the repo referenced `loading.tsx` or its
    component, and no spec asserted the placeholder, so deleting it changed no test.
  - Verified: `npm run typecheck` 0, `npm run test:sports` **484/484**,
    `npm run test:seo` **70/70**, `npm run build` exit 0. Then on a dev server **and a
    production build**: `/sports/matches/nhl/abc`, `/sports/matches/zzz/401892706` and
    `/sports/matches/nhl/000000000` all **404**, while `/sports/matches/nhl/401892706`
    stays **200** and still renders `NHL match details | Hyper` with that loading copy
    intact. Every other route re-checked and unchanged: profile, group, post, clip, team
    and athlete 404 for an id they do not have, while `/`, `/sitemap.xml`,
    `/profile/1`, `/groups/1`, `/post/1` and `/sports/highlights` all 200.
  - With that, **every** id route on the site answers 404 for an id it does not have:
    profile, group, post, clip, match, team and athlete. Still open at this point: the
    *body* of a thrown 404 is empty on Next 16.2.6 here (the status is right; the
    visible content reaches only the RSC payload). Investigated in Phase 33 — it is
    upstream behaviour, deliberate, and not fixable in app code on any released Next.

- Phase 33: A thrown 404 has no HTML body — investigated, and it is upstream's by design ✅

  Every route that throws `notFound()` answers with the right **status** and an empty
  **body**: `<div hidden=""></div>` plus a
  `<template data-next-error-message="NEXT_HTTP_ERROR_FALLBACK;404">` marker, with the
  404 page's own content only in the flight payload. An unmatched URL server-renders
  `not-found.tsx` in full. Phase 30 recorded that as a limitation; this phase went and
  checked whether it could be fixed.

  - **Ruled out by measurement, not by reading:** throwing from `generateMetadata`
    instead of the page does not help — the team and athlete routes already throw there
    and their bodies are just as empty, and metadata runs before the page, so if
    anything could settle the response early it would be that.
  - **`experimental.globalNotFound` was implemented, enabled, measured and reverted.**
    Next 16.2.6 does have the flag, and it does what its code says: the not-found tree is
    built with `app/global-not-found.tsx` as the *layout* and an empty stub as the page,
    so the document itself becomes the 404. Measured on a dev server **and in a
    production build**: every thrown 404 still had **zero visible characters**, while an
    unmatched URL — the one case that already worked — **lost its `<title>`**, because
    with `global-not-found` present Next takes a 404's metadata from the page and an
    unmatched URL has none. It also turned `/_not-found` dynamic at build time and added
    a viewer read to every 404. No benefit, one regression, so the flag and the file were
    both removed.
  - **Upstream confirms the mechanism and that it is deliberate.** Per
    vercel/next.js#100596: the flight phase emits an error chunk for the segment, Fizz's
    `InnerLayoutRouter` re-throws `NEXT_HTTP_ERROR_FALLBACK;404` while turning that stream
    into HTML, `HTTPAccessFallbackErrorBoundary` is a class-based boundary so streaming SSR
    does not catch it and the SSR pass aborts, and `app-render`'s `catch` then sets
    `res.statusCode = 404` and emits the `<html id="__next_error__">` recovery shell with
    the original flight stream embedded so a client can render it. A fix landed in #92231
    and was **reverted on purpose** in #94037 (merged 2026-05-26, so it is in 16.3 and
    later too) to keep error pages resumable for parallel routes and `cacheComponents`.
    The community PRs that would server-render the nearest boundary, #98455 and #98583,
    are both still **open**; 16.4.6 shipped 2026-11-09 without them. **Upgrading is not a
    fix** — this is current, intentional behaviour. See also #99287, #99793 and #85446
    ("global-not-found not served for pages with dynamic paths"), which is precisely what
    the measurement found.
  - **Two workarounds exist in app code and neither was taken.** A `proxy.ts` rewriting a
    malformed id to a path nothing matches, with `status: 404`, would give real HTML 404s
    — an unmatched path is the one case that renders a full body — but only for addresses
    that are not ids at all (`/profile/abc`, `/post/1e3`, `/sports/matches/nhl/abc`), not
    for `/profile/999999`, the case a crawler walking an id space actually hits; covering
    that too means a database existence check in request middleware, i.e. a second read on
    the site's hottest routes and Prisma coupled into the proxy. Both put a new component
    in front of **every** request to improve the body of a response whose status is
    already correct, for readers who do not run JavaScript. Not worth it. If that
    trade-off ever changes — a no-JavaScript audience that matters, or one of those PRs
    merging — the rewrite half is cheap and can be added on its own.
  - **What is true for readers today:** a browser that runs JavaScript gets the full 404
    page, because the payload carries it — `404 — page not found`, `This page isn't here`,
    `Discover people` and `Match highlights` are all present in the response for
    `/profile/999999`, against zero visible characters in the `<body>`. A crawler gets the
    404 status, which is the part it acts on. A client with JavaScript off gets a blank
    404, the same as every other Next 16 app that throws `notFound()`. Still not
    browser-verified: this sandbox has no Chromium.
  - **One real bug came out of looking:** `not-found.tsx` rendered its own `<main>` inside
    the root layout's `<main>` — invalid HTML, and two landmarks both claiming to be the
    page for assistive technology. It is a `<div>` now, and a 404 has exactly one
    `<main>`. Verified: `/this-route-does-not-exist` renders one `<main>`, three `<nav>`,
    the full copy and its site title.
  - Gates: `npm run typecheck` 0, `npm run test:sports` **484/484**, `npm run test:seo`
    **70/70**, `npm run build` exit 0 — once with the flag on, to measure it, and again
    after the revert. Statuses re-checked after the revert and unchanged:
    `/profile/999999`, `/groups/999999`, `/post/999999`, `/sports/matches/nhl/abc`,
    `/sports/teams/nhl/abc` and `/sports/highlights/99999999` all 404; `/profile/1` and
    `/` 200.

- Phase 34: Housekeeping — 1.9 MB of dead vendor code, a homepage that showed the same
  section twice, and two pull requests that cannot be merged ✅

  Three items from the backlog that needed no product decision, plus the assessment of
  the two open pull requests.

  - **Deleted `nfl-nba-main (1)/nfl-nba-main/`** — 71 tracked files, 1.9 MB, at the
    repository root. It was the original vendor drop the Basketball & NFL dashboard was
    copied from; the copy the build actually reads is `vendor/nfl-nba`
    (`scripts/build-nfl-basketball.mjs:5`). The only reference anywhere in the repo was
    one prose line in `NFL_BASKETBALL_INTEGRATION.md`, now reworded to past tense and
    pointing at the live copy. Keeping a second unreferenced copy in Git invited edits to
    the wrong one. Proved nothing needed it: `npm run build:nfl-basketball` still emits
    the dashboard (a 298 kB JS bundle and 46 kB of CSS), `npm run build` exits 0, and the
    dashboard specs — which read the built `public/nfl-basketball/index.html` and fail
    without it — still pass.
  - **The homepage rendered "Players & top scorers" and the highlights feed twice.**
    `SportsMatchCentre` already divides correctly between a compact copy in the mobile
    `lg:hidden` "Catch up fast" rail and a full copy in the desktop `hidden lg:flex`
    sidebar, but `SportsLeadersBoard` and `SportsHighlightsFeed` were rendered in the
    mobile rail *and* again in the main column with **no responsive gate at all** — so a
    phone got two of each stacked in one column. The second pair now sits in a
    `hidden lg:block` wrapper: one of each visible at any width.
  - Both copies remain in the HTML, deliberately. The mobile pair lives inside the rail's
    card with `border-t` separators and the desktop pair are separate cards in the column
    flow, so a true single render means restructuring the rail rather than adding a class
    — a UX change, not housekeeping. Verified by parsing the served homepage and walking
    each section's **ancestors** (a first attempt that compared string offsets matched the
    wrong `lg:hidden` and reported nonsense; DOM ancestry is the only reliable way), and
    the gate was proved to exist in the shipped CSS — `.lg\:block{display:block}`,
    `.lg\:hidden{display:none}`, one `min-width:64rem` query — because a responsive class
    Tailwind never generated would silently do nothing. Not browser-verified: no Chromium
    in this sandbox.
  - **PR #52 cannot be merged, and should be closed as superseded.** Its own work is
    already on main: every one of the 17 files it touches has also changed on main since
    the merge base `ae0c7b2`, and **no file is unique to it**. Main has since moved 1,701
    insertions beyond it. Decisively, its version of `src/lib/highlights-index.ts` exports
    neither `readEventClips` nor `readStoredClip`, which
    `src/app/sports/highlights/[clipId]/page.tsx` and
    `src/app/sports/matches/[league]/[eventId]/page.tsx` both import — so merging it would
    not merely conflict, it would **fail `tsc`**. Its remaining unique premise, storing
    *every* clip ESPN publishes with no cap, is the approach already ruled out: ESPN
    refuses unbounded sweeps, which is why the `MAX_*` limits exist.
  - **PR #32 should be closed too.** "Fixing Mobile device layout" has been stale since
    2026-09-10 and patches `src/components/MobileTabBar.tsx`, **a file that no longer
    exists on main** — the navbar now drives its tabs from `MOBILE_TABS`. It also carries
    vendor scaffolding (`.base44/environment.json`, `docker-compose.base44.yml`,
    `AGENTS.md`) and touches `next.config.ts`, `layout.tsx` and `migrate.ts`. Anything
    worth keeping from it is a layout idea to re-implement against today's navbar, not a
    branch to rebase. Neither PR was closed here: both are other branches' work and that
    is the owner's call.
  - Gates: `npm run typecheck` 0, `npm run test:sports` **484/484**, `npm run test:seo`
    **70/70**, changed-file ESLint 0 errors (5 pre-existing `<img>` warnings elsewhere in
    `page.tsx`, none on the lines touched), `npm run build` exit 0 with the one
    pre-existing Turbopack `next.config.ts` warning. Homepage re-fetched after the change:
    200, both sections present exactly once per breakpoint.

- Phase 35: Team pages became real pages — the parser was throwing away the one field
  that could name them ✅

  Backlog item 6: `/sports/teams/**` and `/sports/athletes/**` were still `index: false`
  after Phases 27–33 made fixtures, clips, profiles, groups and posts crawlable. The
  recorded cause was that `src/lib/migrate.ts` holds 38 stored tables and **no team,
  athlete or standings storage**, so a team page had nothing to be rendered from.

  The cheaper half turned out to be available after all, and the reason it was not
  already taken was one line. A team page is addressed by a numeric ESPN id, and this
  site stores no team table — but it does store clips, and every clip's fixture carries
  both sides' names. `src/lib/espn.ts`'s `team()` reader was taking a competitor's
  `displayName`, `abbreviation`, `logo` and `score` and **discarding `team.id`**, the one
  field that ties a stored clip to a team URL. Other parsers in the same repo already
  read it (`espn-leaders.ts`, `espn-insights.ts`, `espn-match-history-feed.ts`, which
  builds team-schedule URLs from it), so the id space was known to match — the scoreboard
  reader was simply not keeping it.

  - **The id now travels with the clip.** `SportsTeam.id` (optional), read through a new
    `entityIdFrom` exported from `espn-team.ts` beside `validEntityId` and sharing one
    `ENTITY_ID` pattern — so there is one rule, not a fourth spelling of it, and no reader
    can accept an id another refuses. ESPN sends some ids as numbers; both are normalised
    and an unconfirmed id stays absent rather than being coerced. `SportsHighlightClip`
    and `SportsHighlightContext` gained optional `homeId` / `awayId` (optional so the 17
    existing clip literals across 13 files stay valid, and because absent is a real state:
    a clip stored before this has none).
  - **Storage:** `sports_highlight_clips` gained `home_id` / `away_id`, plus two *partial*
    indexes on `("league", …) WHERE … IS NOT NULL` — league clips have no sides, so they
    would only bloat them. Both values are re-gated on the way in (`matchRow`) and on the
    way out (`rowToMatchClip`), because retention here is permanent: a malformed id stored
    once would address the wrong team's page forever.
  - **The upsert COALESCEs the ids instead of assigning them.** A row stored before ids
    were captured picks one up on the next sweep, and a sweep reporting none keeps the one
    already held; clearing it would silently un-answer a team page that used to render.
    This is why the change needs no backfill and no operator action — **production fills
    the columns in by itself within one sweep** of the league listings.
  - **`readTeamClips(league, teamId)`** returns that team's clips inside that competition,
    newest first, plus the team's own name via `teamNameFromClips` — taken from whichever
    side of each row the id actually matches, so a team stored as the away side still
    resolves to itself, and an id no row carries answers `null` rather than the other
    side's name. That name is the only server-side way to turn a numeric id into a team,
    and it comes from rows already held: **no ESPN call, nothing inferred from the URL**.
    The reader also reports `bad-reference` separately from `no-database`, because
    conflating them sends whoever debugs next to look at connection settings for what is
    really a malformed id.
  - **`src/lib/team-page.ts`** (new, pure and client-safe like `match-page.ts`) turns those
    rows into `teamPageFacts` / `teamPageTitle` / `teamPageDescription` /
    `teamBreadcrumbFor`. The description claims **a count and opponents — never a score, a
    result or a date**, since a stored clip proves a fixture happened and that highlights
    exist for it and nothing more; a spec asserts that no result word appears. Opponents
    are deduplicated, newest first, capped at `MAX_NAMED_OPPONENTS = 6`.
  - **The page** renders that prose, links the stored clips, marks itself `index: true`
    with a `BreadcrumbList`, and passes the name down as a new `knownTitle` prop on
    `SportsTeamDetails` so its own `<h1>` names the team in the HTML a crawler reads.
    **A team with no stored clips stays exactly the shell it was** — `noindex`, no stored
    section, `<h1>` still "Loading team details…" — and so does a team with clips but no
    resolvable name.
  - **Discovery,** because an indexable page nothing links to is a page nobody finds:
    `readRecentTeamRefs` unions both sides of every stored match clip and groups by
    competition and id, and the sitemap submits one URL per team (weekly, 0.5, capped at
    `SITEMAP_TEAMS = 500`) only when the new `storedTeamReference` reverses the stored
    league and id into a reference the route will serve. Mirrors `storedMatchReference`.
  - **Athlete pages are deliberately unchanged and still `noindex`.** Leaders and squads
    are fetched live and stored nowhere, so there is no row for `/sports/athletes/**` to be
    answered from and this trick has nothing to work with. Making them indexable needs new
    tables and a sweep writer, and no sweep can be verified in this sandbox — there is no
    ESPN egress. Recorded as remaining work rather than attempted.
  - **Proven against a real local cluster,** because no spec catches a raw-SQL error (the
    suite runs without `DATABASE_URL`). A temporary probe inserted two marked clips through
    the production write path — one with the team home, one away — and confirmed:
    `ensureMigrated()` added both columns and both indexes to an existing table;
    `readTeamClips` returned 2 clips newest-first with the name resolved from either side;
    the away-side row alone gave the same name and the right opponent; another competition
    returned 0; unknown, non-numeric and malformed ids all refused; a re-store with null
    ids left `4993/4994` intact (the COALESCE). Probe rows deleted, remaining count
    printed **0**, and both temp scripts removed.
  - **Then over HTTP,** seeded and unseeded: `/sports/teams/nhl/4993` 200 `index, follow`
    with `<h1>Vancouver Canucks</h1>` and `data-team-stored="2"`; `/sports/teams/nhl/999999`
    200 `noindex, follow` with the shell `<h1>`; `/sports/teams/nhl/abc` and
    `/sports/teams/zzz/4993` 404. `/sitemap.xml` went 22 → 27 URLs adding exactly
    `/sports/teams/nhl/4993` and `/sports/teams/nhl/4994` — the away-side team once,
    despite appearing in both clips — and back to 22 with 0 team URLs after cleanup. Full
    route table in `SPORTS_CHECKS.md`.
  - Gates: `npm run typecheck` 0, `npm run test:sports` **488/488** (was 484),
    `npm run test:seo` **84/84** (was 70; `tests/seo/team-page.test.ts` is new),
    changed-file ESLint 0 errors, `npm run build` exit 0 with the one pre-existing
    Turbopack warning. `test:calls` / `test:uploads` still cannot run here — both abort at
    config load and no Playwright browser is installed — and neither config is touched.
  - Not verified, and not claimable: the rendered section against **production's** stored
    clips (667 rows, no egress to `hyper.co.ke` from this sandbox), and browser rendering
    (no Chromium). On deploy the team URLs appear only once a sweep has re-stored clips
    with ids — expected within one 15-minute sweep pass, with no action required.
