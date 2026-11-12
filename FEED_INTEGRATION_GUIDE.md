# Movies & Sports Feed Integration Guide

## Current status

- ✅ **Movies API:** `/api/movies` — deterministic mock movie data with pagination and search
- ✅ **Sports API:** `/api/sports` — live sports data with provider fallbacks
- ✅ **Sports board:** `/sports` and the `SportsBoard` component display live and upcoming events
- ✅ **Sports feed cards:** featured matches, predictions and league video clips are interleaved into the For You feed by `FeedTabs`; placement lives in `src/lib/feed-interleave.ts`. The leaders board and the match highlights board are **homepage sections**, not interleaved cards — the highlights board also has its own page at `/sports/highlights` (see [SPORTS_HIGHLIGHTS_PAGE.md](SPORTS_HIGHLIGHTS_PAGE.md))
- ⚠️ **Movies feed integration:** movies are intentionally not inserted into the social feed yet

## Available endpoints

### Movies

```http
GET /api/movies?page=1&limit=10&search=drama
```

Query parameters:

| Parameter | Default | Notes |
| --- | ---: | --- |
| `page` | `1` | Positive page number |
| `limit` | `10` | Positive page size, capped at 50 |
| `search` | empty | Case-insensitive title, overview, and genre search |

The response contains a `movies` array, a `pagination` object, and top-level pagination values for simple clients.

### Sports

```http
GET /api/sports
GET /api/sports?refresh=1
```

The sports endpoint aggregates its configured providers on the server and falls back to demo fixtures when they are unavailable. Use `refresh=1` to bypass the short-lived in-process cache.

### Sports video

```http
GET /api/sports/highlights
GET /api/sports/highlights?refresh=1
GET /api/sports/video-news
GET /api/sports/video-news?refresh=1
GET /api/sports/video-news/clip?id=49983806
```

Two separate clip stacks, deliberately not sharing code, caches or cards:

| Endpoint | Source | Carries media? |
| --- | --- | --- |
| `/api/sports/highlights` | fixture-driven: finished matches, then each match's own video collection | yes (`mp4`, `hls`, `playable`); falls back to a labelled **sample** card when ESPN is unreachable |
| `/api/sports/video-news` | feed-driven: each competition's news feed, keeping articles ESPN marks as videos | no — a clip page and a numeric id only; empty board when ESPN is unreachable, **never** a sample clip |
| `/api/sports/video-news/clip?id=` | one clip's record, resolved when a reader presses play | yes: `mp4`, `hls`, `page`, `thumbnail`, `duration`, `playable` |

The clip route accepts a numeric ESPN id and builds the upstream URL itself, so it
cannot be used as a proxy for an arbitrary host. A non-numeric id is a `400`. See
[ESPN_VIDEO_NEWS.md](ESPN_VIDEO_NEWS.md) for the card, playback and placement
rules.

## Integration options

### Approach 1: Highlight banners (recommended)

Show a “Movie of the day” and “Live sports” module above or beside the regular feed. This keeps external/catalog content visually distinct from user posts and does not affect likes, comments, bookmarks, or reposts.

Recommended implementation:

1. Load movie and sports data in a server component or dedicated client widget.
2. Render compact cards above the feed tabs or in the right sidebar.
3. Link sports highlights to `/sports`.
4. Link movie highlights to a future movie catalog page rather than directly to raw JSON when that page exists.
5. Keep provider failures non-blocking so the social feed always renders.

Example server-side requests:

```ts
const origin = process.env.NEXT_PUBLIC_SITE_URL;

const [movieResponse, sportsResponse] = await Promise.all([
  fetch(`${origin}/api/movies?page=1&limit=3`, { next: { revalidate: 300 } }),
  fetch(`${origin}/api/sports`, { next: { revalidate: 45 } }),
]);

const movieData = await movieResponse.json();
const sportsData = await sportsResponse.json();
```

Inside a server component, prefer calling shared data functions directly when available. That avoids making an HTTP request back to the same Next.js process.

### Approach 2: Feed cards

Transform movies and sports events into explicitly typed, read-only cards and interleave them with posts. Do **not** make them look like user-created posts unless the product intentionally supports that model.

Suggested discriminated union:

```ts
type FeedItem =
  | { kind: 'post'; post: SocialPost }
  | { kind: 'movie'; movie: Movie }
  | { kind: 'sport'; event: SportsEvent };
```

Suggested renderer:

```tsx
function FeedItemCard({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'movie':
      return <MovieCard movie={item.movie} />;
    case 'sport':
      return <SportsEventCard event={item.event} />;
    case 'post':
      return <Post post={item.post} />;
  }
}
```

This is safer than adding private flags such as `__isMovie` to the existing post type. A discriminated union lets TypeScript ensure catalog items never accidentally reach post mutation handlers.

If full feed cards are selected, update:

1. `src/app/page.tsx` — assemble the typed feed items.
2. A new feed-item renderer — dispatch by `kind`.
3. `src/components/FeedTabs.tsx` — decide which tabs may contain catalog content.
4. Pagination — avoid duplicating highlights as more user posts load.
5. Analytics — distinguish impressions and clicks from social-post engagement.

## Engagement behavior

Movies and sports currently have no database-backed social identity. Before enabling likes or comments, choose one of these models:

- Keep catalog cards read-only.
- Create a dedicated engagement table keyed by content type and external ID.
- Materialize selected catalog entries as system-authored posts.

Do not route catalog IDs through the current post actions: movie ID `1` and post ID `1` are unrelated records.

## Recommendation

Use **Approach 1 (highlight banners)** first because it:

- needs fewer changes;
- cannot break existing post interactions;
- keeps external data recognizable;
- handles provider downtime gracefully; and
- can later evolve into typed feed cards without a schema migration.

Choose Approach 2 only after defining pagination, ranking, and engagement semantics for non-post content.
