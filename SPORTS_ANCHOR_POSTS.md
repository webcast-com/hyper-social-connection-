# Sports anchor posts (Phase C)

The homepage's sports cards — the leaders board and the match highlights feed —
are laid out as posts (`SportsPostCard`), but until now their Like / Comment /
Share / Save row was `useState`. A visitor "liked" a stat card, reloaded, and the
like was gone: no count, no thread, no notification, no permalink, nothing in the
Following tab. The card looked like a post and behaved like a screenshot.

An **anchor post** closes that gap. Each card gets a real `posts` row, created the
first time a signed-in member engages with it, and every later interaction reuses
that row. Likes, comments, bookmarks, reposts, notifications, likers-with-faces,
trending hashtags, search, the sitemap and `/post/[id]` permalinks all keep
working exactly as they do for a member's own post — no parallel engagement
system, and no rows for cards nobody engaged with.

## Schema

Additive only, so every existing row stays valid. `src/lib/migrate.ts` remains the
source of truth for the physical schema (it runs on boot, every statement
`IF NOT EXISTS`), and `prisma/schema.prisma` declares the same fields:

| Column | Type | Why |
| --- | --- | --- |
| `posts.kind` | `text NOT NULL DEFAULT 'post'` | Separates an anchor (`sports_leader`, `sports_highlight`) from what a member wrote. |
| `posts.external_key` | `text NULL`, unique where present | One anchor per feed item. Postgres allows any number of NULLs in a unique index, so ordinary posts are unaffected and `INSERT … ON CONFLICT DO NOTHING` makes double submits and concurrent clicks resolve to one row. |
| `users.account_type` | `text NOT NULL DEFAULT 'person'` | Marks the system account that authors anchors as a `broadcaster`. |

Run `npm run db:generate` after pulling: the committed Prisma client in
`generated/prisma` predates these fields. Until it is regenerated, the anchor
store reads and writes the three columns with parameterised SQL
(`$queryRawUnsafe` / `$executeRawUnsafe`) and everything else — counts, comments,
likes, bookmarks — through Prisma as usual. That is why `account_type` is verified
by SQL below rather than by a Prisma select: a stale client silently omits fields
it does not know.

## Identity

`src/lib/sports-anchor.ts` is pure and client-safe, so the components that render
a card and the store that writes it can never disagree about which card is which.

- A client sends `{ kind, id }` and nothing else. `anchorRef` accepts only a known
  kind (`leader`, `highlight`) and an id matching `/^[a-z0-9][a-z0-9.:-]{0,159}$/`
  — bounded, lowercase, URL-safe, no markup, no path or query.
- `external_key` is `sports:{kind}:{id}`; `posts.kind` is `sports_{kind}`.
- A leader's id is `{sport}:{metric}:{player}`, so one player leading one metric
  keeps **one** thread across refreshes instead of starting a new conversation
  every 15 minutes. Diacritics are stripped, so ESPN's `Luka Dončić` and
  `Luka Doncic` land on the same post; a different player or metric does not.
- A highlight's id is ESPN's own clip id, which the highlights feed already bounds
  and de-duplicates.
- The anchor keeps the wording it was created with. The card always shows live
  values; the post is the conversation, not the stat.

## The desk

Anchor posts are authored by one system account, created on first use:
**Hyper Sports** (`sports@hyper.co.ke`, `@hypersports`). It is a real, followable
author — members can follow it and its anchors then appear in their Following tab
with no new feed logic — but:

- its password is a bcrypt hash of a discarded `randomUUID()`, so it can never
  sign in;
- notifications are off (`notify_likes`, `notify_comments`, `notify_follows`,
  `notify_messages` all `0`) and `message_privacy` is `nobody`, because engagement
  on its posts must not pile up notifications nobody will read;
- it is excluded from the homepage people-you-may-know and both Contacts rails
  (one filter on `otherUsers` in `src/app/page.tsx`) and from `/discover`.

Search is deliberately left alone: `/search` is an explicit query, and hiding the
author of every sports card from it would make the desk unfindable by name. It is
suggestions that must not contain it, not a member's own search.

## What the server does with a click

`src/app/sports-actions.ts` holds four form actions — `likeSportsAnchor`,
`commentOnSportsAnchor`, `saveSportsAnchor`, `shareSportsAnchor` — shaped as
`(formData) => Promise<void>`, the way `Post.tsx` already drives `toggleLike` and
`createComment`. Each one resolves the viewer, validates the ref, ensures the
anchor post, then delegates to the existing `toggleLike` / `createComment` /
`toggleBookmark` / `repostPost`. There is exactly one implementation of each.

The post's text, image and video are **always re-derived server-side from this
site's own feeds** (`resolveAnchorDraft`). A client cannot publish arbitrary
content as the desk, and a card whose board is the bundled sample (ESPN
unreachable) refuses to anchor at all: placeholder values must never be stored as
though a member had posted them. Media URLs still pass `isSafeMediaUrl`, and
content is bounded to 1200 characters.

## What the card shows

`SportsPostCard` now takes `anchor`, `engagement` and `signedIn`. Counts come from
the database via `loadAnchorEngagement` — one bounded pass per homepage render for
every card about to be drawn (≤60 refs, ≤12 comments per card, four queries in
parallel), not a query per card. The comment thread renders its authors and links
to their profiles; the composer posts into that same thread; the share menu gained
a note field and "Share to your feed" (a real repost); the more menu gained "Open
discussion" → `/post/{id}`.

When a card cannot be engaged with, it stays laid out and says why instead of
pretending:

- **Signed out:** Like and Save are disabled, no forms are rendered at all, and
  the panel reads "Sign in to like, comment on, save and share this card."
- **Sample board:** the same, with "Engagement is unavailable on sample cards" and
  "Comments open when this card has a live feed behind it."

The stale footnotes ("Comments stay in this browser") are gone from both the
leaders board and the highlights feed.

## Verification

Environment: local PostgreSQL 18.4 (`bash scripts/dev-db.sh start`) on a fresh
cluster, app on `0.0.0.0:36825`.

```sh
npm ci
npm run --silent typecheck          # exit 0
npm run test:sports                 # 271 tests, 271 pass, 0 fail (was 264)
```

New specs: `tests/sports/anchor.test.ts` (identity, key stability, drafts, which
boards may anchor). `tests/sports/leaders-post-cards.test.ts` and
`tests/sports/highlights-post-cards.test.ts` were rewritten: they had asserted the
old fake behaviour (local `aria-pressed` toggle, `0 cheers` → `1 cheer`). They now
mount the real components with server-supplied engagement and drive form actions
through a `submit` helper the jsdom harness gained, asserting submit buttons
rather than local state, the saved thread and its authors, the note field, and
`/post/{id}`. Both also assert the signed-out and sample-board copy.

Against the live database (throwaway script, since deleted):

- `ensureSportsDesk()` twice → the same id; SQL confirms `account_type =
  'broadcaster'`, all four notify flags `0`, `message_privacy = 'nobody'`, a
  60-char `$2b$` hash; the five seeded member accounts are untouched.
- Two concurrent `createAnchorPost(draft)` calls → the same post id, and exactly
  one row for that `external_key`. `posts.kind = 'sports_leader'`, authored by the
  desk, content `🏀 Luka Dončić leads the NBA in points per game with 33.9. /
  Dallas Mavericks · PG / #Sports #Leaders #HyperSports`.
- A like, a comment and a bookmark written by a seeded member →
  `loadAnchorEngagement` returns `likesCount 1`, `commentsCount 1`,
  `viewerLiked true`, `viewerSaved true`, and a thread entry carrying
  `{ id: 2, name: 'Maya Patel', avatar: … }`.
- A card nobody engaged with → no entry in the map (nothing to render, nothing
  stored). An unknown card id → `null`, nothing invented.

Over HTTP:

- Boot migration applied on the fresh cluster: `posts.kind`,
  `posts.external_key` + its unique index, `users.account_type`, then the demo
  seed (5 users, 9 posts, 7 comments, 15 likes).
- Four concurrent cold-start requests to `/` → all `200`, one clean seed. This
  exposed a real bug that is fixed here: `runMigration()` set `migrated = true`
  before running any DDL, so a second caller returned from `ensureMigrated()`
  while the statements were still in flight and queried columns that did not exist
  yet (`The column age of relation users does not exist`, first seed attempt
  failing). `migrated` is now raised only once the DDL has actually run.
- Signed in as `alex@example.com`: `/` renders with the honest "Sample cards ·
  ESPN … unreachable right now" copy and every Like disabled, because the boards
  are sample data in this sandbox — the designed refusal, not a broken control.
- `/`, `/discover`, `/sports`, `/login`, `/post/1`, `/profile/2`,
  `/notifications` → `200`.

Not verified here, with reasons:

- **Live ESPN boards.** This sandbox has no route to `site.api.espn.com` or
  `a.espncdn.com` (`SSL_ERROR_SYSCALL`; see `ESPN_ACCESS_DENIED.md`), so no anchor
  was created from a live feed — only from a draft built by the same code path.
  The refusal on sample boards is what runs here.
- **Browser layout at 320/768/1440.** `npm run test:sports-layout` needs a
  Chromium binary; none is installed and `cdn.playwright.dev` is outside the
  egress allowlist. The card's own layout assertions still run in jsdom.
- **`npm run db:generate`.** No route to `binaries.prisma.sh`, so the committed
  client is stale. Regenerate locally before relying on `kind` / `externalKey` /
  `accountType` through Prisma.


## Update (November 2026): drafts can now resolve from the stored index

Phase 19 added a permanent clip index (`SPORTS_HIGHLIGHTS_INDEX.md`), which stores
clips that have left the live board's ≤12. `resolveAnchorDraft` used to look a
highlight ref up **only** on that board, so engagement on a stored clip would
silently create no post. It now falls back to `findStoredHighlightClip(anchorKey)`,
which is inert without a database. A stored clip and the same clip on the board
derive the **same** anchor id from the same clip id, so they share one post and one
set of counts — a like on the homepage card is a like on the page card.
`highlightClipsAnchorRefs(clips)` was split out of `highlightAnchorRefs(board)` so a
page can load engagement for clips the board does not hold; the board variant keeps
its rule that a sample board contributes no refs at all. League video clips still
create no anchor posts, which is the video-news card's own existing rule.
