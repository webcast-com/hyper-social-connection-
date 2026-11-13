# The match highlights page

Highlights already existed on this site as an **API and a homepage card** — but
nowhere as a page. There was no `/sports/highlights` route, the sports board had
no highlights section, the match page had no highlights pill, and the vendored
NFL/NBA SPA has no highlights route either (`basketball`, `nfl`, `team/:key`,
`player/:key`, `upcoming`, `top-scorers`, `news`, `match/:id`). So a reader who
wanted every clip had to sit on the homepage and press "Show all".

This adds the page, and nothing else:

| | |
| --- | --- |
| Route | `/sports/highlights`, with `?league=` and `?status=` honoured |
| Component | `src/components/SportsHighlightsPage.tsx` |
| Card | `HighlightPostCard`, now exported from `SportsHighlightsFeed.tsx` |
| Data | `getSportsHighlights()` — the existing feed, unchanged |
| Refresh | `GET /api/sports/highlights?refresh=1` — the existing endpoint, unchanged |
| Reached from | a "Match highlights" pill on the sports board, next to "View predictions" |

**No new ESPN request exists anywhere in this feature.** The page renders the
board the homepage already loads, and its refresh button re-reads the endpoint
that already existed. No parser, feed, cache or endpoint was touched, and the
homepage card renders exactly as it did.

## What the page adds over the card

- **Every clip, not four.** The homepage card slices to `limit = 4` behind a
  "Show all" control; the page lists the whole board.
- **Two filters**, in the vocabulary the sports board already uses: competition
  and match state (`Live`, `Upcoming`, `Full time`). Chips are derived from the
  board itself, so a competition or state with no clips on it is never offered —
  a filter cannot empty the page by construction. Each chip carries its own
  count, and the state counts follow the competition already chosen.
- **`?league=` and `?status=`** are read by the server page and validated before
  they become a filter: `league` must be a slug in `ESPN_LEAGUES`, `status` must
  be one of the three. An unknown value is ignored rather than turned into a
  request or an empty page.
- **An honest empty state.** The homepage card returns `null` when the board has
  no clips, which is right inside a feed and wrong on a page of its own. Here a
  reader gets "No highlight clips right now", why, and the feed's own source
  report in a `<details>` panel (status, clip and game counts, HTTP status,
  error kind and message).
- **A filter with nothing in it** says so, names the filters that are on, and
  offers "Show every clip" — rather than showing a blank column.

## What it deliberately keeps from the card

- **The same post card.** `HighlightPostCard` is exported and reused, so a clip
  looks, plays and engages identically on the homepage and here: home crest as
  the author image, fixture as the title, `LinkMediaPlayer` for the clip, the
  labelled "Watch on ESPN" link for a rendition that will not play inline, and
  the same Like / Comment / Share row.
- **Sample labelling and read-only samples.** `sample = status !== 'live' &&
  status !== 'partial'`, exactly as the card computes it. A sample board is
  headed "Sample cards · ESPN highlight videos are unreachable right now", its
  cards get no anchor ref, and `SportsPostCard` therefore shows no engagement
  form at all — the note reads "Engagement is unavailable on sample cards. It
  returns with the live feed." Nothing on this page substitutes a clip.
- **Anchor engagement** is loaded the same way the homepage loads it: one
  bounded `loadAnchorEngagement(highlightAnchorRefs(board), viewerId)` pass, and
  a sample board contributes no refs.
- **Where a card goes** is unchanged: basketball and American football to the
  dashboard the rest of the site links to, everything else to the competition
  board. (Highlight clips do carry `eventId` and `league`, so these cards could
  point at a native match page instead — that is a separate, small change and is
  not part of this one.)

## Refresh behaviour

One request to `/api/sports/highlights?refresh=1`, guarded by an in-flight ref so
a double press is one call, aborting on unmount. The response is checked against
a local `validBoard` guard — `clips` an array of at most 200 well-formed clips,
`status` one of the three, `games` a finite non-negative number, `source` with a
boolean `ok`, a string `url` and a `httpStatus` that is a number or null — before
it replaces anything. A response that fails the guard, or a refused request,
keeps the clips already on screen and says: "Could not refresh highlights.
Keeping the clips already shown. Please try again."

## Coverage, stated on the page

ESPN publishes per-game clips for some competitions and not others: the
Champions League, La Liga and the NBA answer with clips, while the Premier
League and the NFL answer with an empty list (see
[ESPN_VIDEO_NEWS.md](ESPN_VIDEO_NEWS.md)). The page says this in its header, so a
missing competition reads as provider coverage rather than as a broken page — and
points out that the same competition's league video news can still appear in the
For You feed, because that is a separate feed-driven stack.

## Verified

`npm run typecheck` 0 · `npm run test:sports` **350/350** (344 existing specs
unchanged; 6 new in `tests/sports/highlights-page.test.ts` mounting the page in
the jsdom harness — whole board listed with no "show all" control and no request
on load, chips offering only what the board holds, filtering and the
no-match/clear path, `?league=`+`?status=` honoured on first render, a sample
board labelled with zero engagement forms against a live board that has them, an
empty board's honest state and source report, and a refresh that replaces, then
keeps previous clips across a malformed and a refused response) ·
`npx eslint` 0 errors on every touched file (one pre-existing `<img>` warning in
`SportsHighlightsFeed.tsx`) · `npm run build` 0 with `/sports/highlights`
dynamic · live smoke: `/sports/highlights` and the `?league=`/`?status=` variants
all 200, an unknown `league`/`status` ignored rather than honoured, `/sports`
carrying the new pill, and `/`, `/sports/teams/epl/359`,
`/sports/athletes/nba/3945274` and `/sports/matches/epl/1` unchanged.

**Not verified here:** live clips — this sandbox has no egress to ESPN, so the
page renders the bundled sample board, labelled. Whether a given competition
publishes per-game clips is a provider fact the page reports rather than guesses.


## Update: the page now has a stored half

Phase 19 added a permanent clip index behind this page — see
[SPORTS_HIGHLIGHTS_INDEX.md](SPORTS_HIGHLIGHTS_INDEX.md). Everything above is still
true of the **live board** half, and the page still renders exactly this when there
is no database. What changed:

- `?index=1` reads bring a second, stored set of clips (plus league video), so the
  page lists more than the feed's ≤12 and can filter by age and page through
  hundreds of clips without any ESPN request at read time.
- Refresh now reads `/api/sports/highlights?index=1&refresh=1` and validates both
  halves; a malformed `index` keeps the clips already on screen, exactly as a
  malformed board always did.
- A **Sweep more competitions** button asks for one bounded background pass and
  prints its report.
- Chip badges count stored clips while anything is stored (with a caption saying
  so) and the board's own clips otherwise.
