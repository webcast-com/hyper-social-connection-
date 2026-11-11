# ESPN league video news (a separate stack)

The match highlights board is **fixture-driven**: it sweeps seven days of
scoreboards, finds finished matches, and asks each match's own video collection
(`…/summary?event={id}` → the event's `videos`). That works where ESPN publishes
per-game clips, and its own notes record the gap — the Champions League, La Liga
and the NBA answer with clips; **the Premier League and the NFL answer with an
empty list**.

This stack is **feed-driven** instead: it asks a competition's *news* feed and
keeps the articles that are genuinely videos. Those are the clips ESPN publishes
as league video — goals, recaps, reactions, analysis — which is exactly what the
empty per-match collections leave out.

It was built apart from the highlights stack on purpose, and stays apart:

| | Match highlights (existing, untouched) | League video news (this stack) |
| --- | --- | --- |
| Parser | `src/lib/espn-highlights.ts` | `src/lib/espn-video-news.ts` |
| Feed | `src/lib/espn-highlights-feed.ts` | `src/lib/espn-video-news-feed.ts` |
| Endpoint | `GET /api/sports/highlights` | `GET /api/sports/video-news`<br>`GET /api/sports/video-news/clip?id=` |
| Card | `SportsHighlightsFeed` + `LinkMediaPlayer` | `SportsVideoNewsCard` (own player) |
| Asks ESPN for | finished fixtures, then each fixture's videos | each competition's news feed |
| Clip identity | a match: `home` vs `away`, score, `eventId` | a league clip: no fixture, ESPN's own team labels |
| Media in the listing | yes (`mp4`, `hls`, `playable`) | no — resolved on demand when a reader plays it |
| When ESPN is unreachable | bundled sample card, labelled as a sample | empty board; **no sample clips exist here** |

Nothing in one reads or writes the other: no shared cache, no shared in-flight
guard, no shared card, no changed behaviour in `/api/sports/highlights`,
`SportsHighlightsFeed` or `LinkMediaPlayer`. The only place the two meet is the
feeds section, and only as sibling card kinds.

## The three steps, and why they are three

A news article carries a clip **page** (`espn.com/video/clip/_/id/…`) and a clip
**id** — not a media file. So:

1. **Listing** — one request per competition to
   `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/news?limit=20`.
   `parseVideoNews` keeps an article only when ESPN itself marks it a video
   (`type: "Video"`, a `media` article whose page is under `/video/`, or an
   `api.videos` link) **and** it has a validated ESPN clip page, a title and a
   numeric id. Text stories that merely mention a video are dropped.
2. **Play** — `GET /api/sports/video-news/clip?id=49983806`. The route accepts a
   numeric id and builds the clip-record URL itself:
   `https://content.core.api.espn.com/v1/video/clips/{id}`. Taking an id and
   never a URL is what keeps this from being an open proxy — the host contacted
   is decided server-side from a validated pattern.
3. **Rendition** — `parseVideoNewsMedia` reads the record (bare clip or
   `videos[0]`, renditions hung under `links.source`, `links.source.HLS`,
   `links.mobile.source`) and classifies each candidate **by its own extension**:
   `.m3u8` → HLS, `.mp4/.m4v/.mov/.webm` → progressive. ESPN's auth-gated
   renditions (`…/video/auth/…`) carry no extension, so they fall through and are
   never handed to a `<video>` element that cannot authenticate.

Listing twelve competitions therefore costs twelve requests, and watching one
clip costs one more — not a media fetch per card on every scroll.

## What a card shows, and what it refuses to invent

- **No fixture.** A league clip has no match behind it. `teams` holds the labels
  ESPN attached to the article's own `categories`, and may be empty; the card
  renders them as chips and never composes a "Home vs Away" from a headline.
- **No sample clips.** When ESPN does not answer, the board is `unavailable` with
  an empty list and the feeds section shows no video cards. A made-up goal clip in
  a member's feed is worse than no card at all — unlike the highlights board,
  there is nothing bundled here to stand in.
- **No dead player.** If the clip route says not playable, the request fails, or
  the `<video>` element errors mid-clip, the player is replaced by a labelled
  "Watch it on ESPN" link to the clip's own page (`rel="noopener noreferrer
  nofollow"`, `target="_blank"`).
- **No blind HLS.** The progressive file wins. HLS is used only when
  `document.createElement('video').canPlayType('application/vnd.apple.mpegurl')`
  reports support, so Chrome and Firefox never receive a playlist they cannot
  play.
- **A real post, not a fake one.** Comment and Share follow the prediction card's
  idiom exactly: compose `FormData` and call `createPost`, which revalidates this
  page. Signed-out readers get disabled controls and a one-line notice.

## Feed wiring

`src/lib/feed-interleave.ts` holds the placement rule, because it is the one thing
that must not shift by accident when a card kind is added: each kind gets its own
pass over the list, so a new kind cannot move the kinds already there.

```ts
const forYouPosts = interleaveFeedCards(
  interleaveFeedCards(visiblePosts, [...sportsFeedPosts, ...predictionFeedPosts], SPORTS_FEED_SLOTS),
  videoNewsFeedPosts,
  VIDEO_NEWS_FEED_SLOTS,
);
```

- `SPORTS_FEED_SLOTS = [1, 3, 5, 7]` — the match and prediction cards, unchanged.
- `VIDEO_NEWS_FEED_SLOTS = [2, 6]` — league video clips, their own pass.
- `MAX_FEED_CLIPS = 2` — how many clips the feed interleaves; the rest stay
  available to `/api/sports/video-news`.
- `src/components/FeedTabs.tsx` gained one branch: `post.type === 'video-news'` →
  `SportsVideoNewsCard`. `sports`, `prediction` and ordinary posts render as
  before.
- With no clips the For You feed is **identical** to the feed before this card
  kind existed (`tests/sports/feed-interleave.test.ts` asserts exactly that), and
  the member posts list is never mutated, so the Following and Saved tabs are
  unaffected.

The page starts the fan-out before awaiting the other feeds
(`const videoNewsPromise = getSportsVideoNewsForRender()`) so its cost overlaps
theirs, and `getSportsVideoNewsForRender(budgetMs = 2500)` races the job against a
budget: a cold fan-out resolves to an empty `unavailable` board rather than
holding the render, and the job is never cancelled, so it fills the cache for the
next request.

## Endpoints

```http
GET /api/sports/video-news
GET /api/sports/video-news?refresh=1
GET /api/sports/video-news/clip?id=49983806
```

| Response | `Cache-Control` |
| --- | --- |
| list, `live` or `partial` | `public, max-age=120, stale-while-revalidate=300` |
| list, `unavailable`, or any `refresh=1` | `no-store` (a failure is never cached as an answer) |
| clip, playable | `private, max-age=300` |
| clip, not playable | `no-store` (a refusal may be transient, so it is asked again) |
| clip, id not numeric | `400` + `no-store` |

`status` uses the three values the rest of the sports feeds use — `live` (every
competition answered), `partial` (some did), `unavailable` (none did). A
competition that answers with **no** videos is a normal answer, not a failure:
ESPN publishes league video for some competitions and not for others.

Server-side caching: 15 minutes for a board, 60 seconds for a failed one, 15
minutes for a resolved rendition; concurrent callers share one in-flight fan-out
(`resetVideoNewsCaches()` is the test seam). Requests carry
`AbortSignal.timeout(6000)`, run at concurrency 6, and use the shared
`ESPN_REQUEST_HEADERS`.

## Coverage

Twelve competitions, resolved from `ESPN_LEAGUES` so the catalog stays the single
source of truth for provider paths — a slug that is not configured is skipped
rather than guessed at:

`ucl` `epl` `laliga` `seriea` `bundesliga` `ligue1` `caf` `afcon` `mls`
`liga-mx` `nba` `nfl`

Two honest caveats. First, whether the NBA and NFL news feeds actually publish
`type: "Video"` articles could **not** be confirmed from this environment (no
egress to ESPN — see [ESPN_ACCESS_DENIED.md](ESPN_ACCESS_DENIED.md)); the code
treats "answered with no videos" as success, so a competition that publishes none
simply contributes no card. Second, a news feed brings *clips*: full-match
Premier League highlights are territorially licensed, and ESPN CDN renditions are
geo-fenced per competition, so a clip that resolves in one country can legitimately
refuse in another. That is what the "Watch it on ESPN" fallback is for.

## Verified

- `npm run typecheck` — 0 errors.
- `npm run test:sports` — **300/300**, the 271 existing specs unchanged plus 29
  new ones: `video-news.test.ts` (9, the parser and its URL guards),
  `video-news-feed.test.ts` (8, fan-out, caching, honest failure, on-demand media,
  render budget), `video-news-card.test.ts` (7, the card mounted in jsdom: poster
  until play, one request by id, HLS gating both ways, every unplayable path,
  composer behaviour signed in and out), `feed-interleave.test.ts` (5, placement).
  The new feed specs use their own `fetch` harness and never touch the highlights
  stubs.
- `npm run build` — 0 errors; both routes appear as dynamic (`ƒ`).
- `npx eslint` on every new and changed file — 0 errors.
- Live smoke against the dev server and Postgres: `/` 200, `/sports` 200,
  `/api/sports/video-news` → `unavailable` with an empty list and `no-store`,
  `clip?id=abc` → 400, `clip?id=49983806` → `playable: false` with `no-store`,
  and `/api/sports/highlights` still returning its labelled sample board with its
  original cache header. A temporary env-gated fixture (removed afterwards, file
  restored byte-identical) proved the card renders inside the For You feed with a
  poster and play control, **zero** `<video>` elements and no fallback link before
  a reader presses play.

## Not verified here

- Live ESPN news feeds and clip records: this sandbox has no egress to
  `site.api.espn.com` or `content.core.api.espn.com`, so real payloads were never
  observed. The parser is written against the shapes the existing highlights and
  match readers already handle, and every guess is dropped rather than invented.
- Real playback in a browser (no Chromium binary here): HLS gating, the error
  fallback and the poster-to-player transition are covered in jsdom, not in a
  browser. `npm run test:sports-layout` (Playwright) could not run.
