# The stored highlights index

**"All highlights, all competitions, all leagues, live and finished, kept for
days."** This is how the site gets there — and why it is a stored index walked a
slice at a time rather than one big fetch.

## The constraint that decides the design

ESPN has **no bulk highlights endpoint** and **no date range**:

- a game's clips live on that game's own video collection,
  `…/site/v2/sports/{sport}/{league}/videos?event={id}`;
- a scoreboard takes **one date per request**,
  `…/{sport}/{league}/scoreboard?dates=YYYYMMDD`.

So "everything" costs one scoreboard per competition per day, **plus one
collection per game**:

| To get | Requests |
| --- | --- |
| One day, every competition | 121 (one per `ESPN_LEAGUES` entry) |
| A week, every competition | **847** scoreboards |
| The clips themselves | **one per game** — thousands across a week |

That cannot happen during a render. It would hold the homepage (which awaits
`getSportsHighlights()` directly) for minutes, and it would risk a throttle or
block on `site.api.espn.com` that every other ESPN surface on this site shares —
scores, matches, standings, odds, leaders, team and player pages, video news
(`ESPN_ACCESS_DENIED.md` documents what a denial looks like here). Nor can the
existing caches hold anything for days: `dayCache` and the board `cache` in
`espn-highlights-feed.ts` are **per process** and are wiped by every deploy.

Two further facts no amount of fetching changes:

- ESPN publishes **no per-game clips** for some competitions. The Premier League
  and the NFL answer a game's own collection with an empty list
  (`ESPN_VIDEO_NEWS.md`). Their clips exist only as **league video news**.
- Retention has to be a decision, not a side effect: a clip kept for days must be
  kept somewhere that outlives a process.

## What was built

| | |
| --- | --- |
| Storage | `src/lib/highlights-index.ts` — three Postgres tables, all reads and writes |
| Sweeper | `src/lib/highlights-sweep.ts` — one bounded pass over a slice of the catalog |
| Endpoint | `GET /api/sports/highlights?index=1` — the stored read, plus the live board |
| Trigger | `GET|POST /api/sports/highlights/sweep?force=1[&league=][&days=]` |
| Page | `/sports/highlights` — two labelled sections, filters, paging, a sweep button |
| Schema | `CREATE TABLE IF NOT EXISTS` in `src/lib/migrate.ts`, the repo's existing pattern |

**`npm run db:generate` is not needed**: `build` does not run `prisma generate`,
and these tables are created by `ensureMigrated()` with idempotent DDL and read
with parameterised `$queryRawUnsafe`/`$executeRawUnsafe`, exactly like the
25-odd existing tables and like `sports-anchor-store.ts`.

### Tables

- **`sports_highlight_clips`** — one row per distinct clip, unique on
  `external_key` (`match:{clipId}` or `league:{clipId}`). Fixture columns
  (`event_id`, `event_name`, `home`, `away`, logos, `status`) are populated for a
  match clip and **null for a league clip**, which has no fixture; `teams` holds
  only the labels ESPN reported on the article. `anchor_key` is
  `slugify(clip.id)`, so engagement can find a stored clip. `discovered_at` is
  when this site first saw the clip and **never changes**; `seen_at` is the last
  sweep that still found it.
- **`sports_highlight_probes`** — one row per game collection asked
  (`probe:{league}:{eventId}`) with `clips_found` and `attempts`. This is what
  stops the same collection being read on every pass.
- **`sports_highlight_sweeps`** — one row per competition per UTC day walked
  (`sweep:{slug}:{date}`). This is the **cursor**: it survives a deploy and is
  shared by every instance, so coverage resumes instead of restarting at the
  first league on every boot.

### Retention: permanent

Nothing deletes a clip. Growth is bounded by what ESPN actually publishes, not by
a timer: one row per distinct clip, and a probe row per game asked. `?days=`
bounds the **query** (a year at most), not the storage.

## The sweeper's bounds

One pass, at most:

| Bound | Value |
| --- | --- |
| Scoreboard cells walked | `CELLS_PER_PASS = 24` (of 847 for a week of the catalog) |
| Game collections asked | `GAMES_PER_PASS = 24` |
| Collections for one named competition | `LEAGUE_GAMES_MAX = 40` |
| Requests in flight | `CONCURRENCY = 8` — deliberately below the live board's 24 |
| Shared deadline | `SWEEP_DEADLINE_MS = 4_000`, per request `max(750, min(6000, left))` |
| A cell re-walked after | `CELL_TTL = 6 h` |
| An **empty** collection re-asked after | `REPROBE_EMPTY_AFTER_MS = 24 h` |
| Passes per process | 10 min opportunistic, 30 s explicit, 5 min per named competition |
| League video news fan-out | joins a pass at most every 15 min |

Rules that keep it honest:

- A collection that answered **with clips is never asked again** — the clips are
  stored permanently. One that answered **empty is retried after 24 h**, because
  ESPN publishes highlights hours after full time.
- **Upcoming fixtures are never asked**: they have no clips by definition.
- A game with no provider id cannot be addressed and is skipped, never guessed.
- **Day-major order**: today across every competition first, then yesterday, so a
  reader arriving during the first passes sees the freshest sport the catalog has.
- A cell nobody answered is **not** recorded as walked, so a transient failure is
  retried; a cell that answered with no askable game **is** recorded, so the
  cursor advances past a competition with no fixtures today.
- The rate limit applies **after a failure too**: a refused ESPN is backed off
  from, not hammered on every page load.
- Concurrent callers **share** one in-flight pass.
- `truncated` says when the deadline or the slice cut a pass short.

### What triggers a pass

1. A page load of `/sports/highlights`, or a read of `?index=1` — `void
   runHighlightsSweep({})`, never awaited, at most once per 10 min per process.
2. The page's **Sweep more competitions** button → `?force=1` (30 s interval), or
   `?force=1&league=epl` to walk one competition's whole week (5 min interval).
3. A scheduler hitting the same route. There is no cron in this repo yet (no
   `vercel.json`); adding one is the way to make coverage advance without traffic.

**Consequence, stated plainly:** a complete first pass over 121 competitions × 7
days takes many passes — hours of traffic, or of a scheduler. It is not instant
and cannot be made instant without the unbounded fan-out this module exists to
avoid. After that it is incremental: 24 new cells and 24 new games per pass.

## Reading it

`GET /api/sports/highlights` **without** `index=1` returns exactly what it always
has — the bounded live board, `public, max-age=120, stale-while-revalidate=300`.
The homepage is untouched.

`GET /api/sports/highlights?index=1` returns `{ board, index }`, `no-store`, and
costs **no ESPN request for the `index` half**:

```
?index=1&league=epl&status=final&days=7&kind=match&limit=24&offset=24
```

Every parameter is clamped server-side before SQL (`resolveIndexQuery`): `league`
must be a catalog slug, `status` one of `live|upcoming|final`, `kind` one of
`match|league`, `days ≤ 365` (and `0` means *no* age filter, not "one day"),
`limit ≤ 60`, `offset ≤ 100000`. An unknown value is **dropped**, never queried.
The response also carries `remaining` for a Load more button and unfiltered
`byLeague`/`byStatus` totals, so a chip can count what is stored rather than what
happens to be on the page.

## The page

`/sports/highlights` now renders two labelled sources, because they are different
things:

- **On the live board now** — the feed's ≤12 clips, filtered in memory.
- **Stored match clips** — the index, filtered and paged through the endpoint.
- **League video** — stored league clips, rendered by `SportsVideoNewsCard`: no
  score, no kickoff, no match page, because there is no fixture. Nothing dresses
  one up as a match.

A clip that is on both is **one card** (deduped by anchor id). Chip badges count
stored clips while anything is stored and say so in a caption; while the index is
empty or unreadable they count the board's own clips, because a zero next to four
cards would be a lie about those cards. The header states how many clips are
stored, across how many competitions, when the sweeper last ran and how far back
the oldest clip goes. The sweep button prints the pass report verbatim — cells
walked, games asked, clips stored, requests made, seconds taken, and whether it
was truncated — including when the pass did nothing because one ran recently.

## Fallbacks

| Situation | Behaviour |
| --- | --- |
| No `DATABASE_URL` | `hasDatabase` false → every store call resolves inert with `reason: 'no-database'`; the sweep makes **zero** requests; the page says "No database is configured on this deployment" and shows the live board exactly as before |
| A query fails | `reason: 'query-failed'`, logged once; the page says the index could not be read and that stored clips are kept, not lost |
| Postgres down mid-pass | The pass stores nothing and reports it; nothing throws into a render |
| ESPN refuses a pass | `ok: true` with `cells: 0` and the request count; the cell is not recorded, so it is retried after the rate limit |
| A malformed `index` in a refresh | The client's `validIndex` rejects it and the clips on screen stay |

## Engagement on a stored clip

`resolveAnchorDraft` used to look a highlight ref up **only** on the live board's
≤12 clips, so a like on a stored clip that had left the board would silently
create no post. It now falls back to `findStoredHighlightClip(anchorKey)`. A
stored clip and the same clip on the live board produce the **same anchor id**,
so they share one post: a like on the homepage card is a like on the page card.
`highlightClipsAnchorRefs(clips)` was split out of `highlightAnchorRefs(board)`
for the same reason. League video clips still create no anchor posts, which is the
video-news card's own existing rule.

## Verified here

- `npm run typecheck` clean; `npm run test:sports` **374/374** (24 new: 8 index,
  11 sweep, 5 page).
- **Real Postgres smoke** (local cluster on `127.0.0.1:55432`, throwaway script,
  deleted afterwards): DDL creates the three tables and 12 indexes; a batch insert
  writes 3 clips; **writing the same 3 again leaves 3 rows** with `discovered_at`
  unchanged and `seen_at` advanced; reads honour `league`, `status`, `kind`,
  `days` and `limit`/`offset` with correct `remaining`; `byLeague`/`byStatus`
  totals are unfiltered; the anchor lookup finds a stored clip; probes increment
  `attempts` and an empty probe aged 25 h becomes askable again while one with
  clips never does; sweep cells are fresh inside 6 h and askable after 7 h.
  This smoke caught two real bugs the unit tests could not: the probes and sweeps
  `INSERT`s listed more columns than values (`42601 INSERT has more target columns
  than expressions`), which would have silently disabled the cursor and the
  never-ask-twice rule.
- Live smoke on the running preview: `/api/sports/highlights/sweep?force=1` →
  `{ok: true, cells: 0, games: 0, requests: 36, truncated: true, durationMs: 192}`
  — 24 scoreboards plus the 12-competition news fan-out, all refused by this
  sandbox's lack of ESPN egress, nothing stored, and the pass says exactly that;
  `?index=1` → `{board, index}` with `index.ok: true` from the real database;
  `/api/sports/highlights` unchanged; `/sports/highlights` and its filter
  variants, `/sports` and `/` all 200.

**Not verified here:** real clips being stored, because this sandbox has no egress
to `site.api.espn.com` (`ESPN_ACCESS_DENIED.md`). Every sweep in the sandbox asks
and is refused. On a deployment that can reach ESPN, the first passes will fill
the index; the sweep report on the page is how to watch that happen.

## Natural next steps (not built)

- A **cron** entry (`vercel.json`) hitting `/api/sports/highlights/sweep?force=1`
  every few minutes, so coverage advances without traffic.
- Letting the **homepage card** read stored clips, which would cut its render-time
  fan-out entirely. Deliberately not done here: the homepage's shape, cache
  headers and tests are unchanged by this feature.
- Per-competition "ask now" on `/sports` league pages, reusing `?league=`.
