# ESPN sports coverage

Scores and fixtures now use **ESPN only**, with **38 configured competitions across seven sports**. Provider IDs and regions live in `src/lib/sports-catalog.ts`. TheSportsDB requests, parsing, provider types and competition catalog have been removed.

## Configured coverage

- **Europe:** major football leagues, EFL Championship, Eredivisie, Primeira Liga, Scottish Premiership, Turkish Super Lig, UEFA competitions, Women's Super League and Premiership Rugby.
- **Africa:** CAF Champions League, CAF Confederation Cup, South African Premiership and African World Cup Qualifying.
- **Americas:** MLS, Liga MX, Brazilian Serie A, Argentine Primera Division, Copa Libertadores, NWSL, NBA, WNBA, men's/women's NCAA basketball, NFL, MLB and NHL.
- **Asia:** J1 League, Saudi Pro League and AFC Champions League Elite.
- **Oceania:** A-League Men and Super Rugby Pacific.
- **International:** Formula 1.

Coverage means a configured request, not guaranteed fixtures today or independently verified current endpoint availability. Regions describe competition home regions, not necessarily event venues. IPL/cricket was supplied only by the removed provider and is no longer advertised; no unverified replacement endpoint has been added. The separate predictions page now shows ESPN-reported upcoming match odds; see [ESPN_ODDS_CHECKS.md](ESPN_ODDS_CHECKS.md). No external model-prediction provider is connected.

## Request path and reliability

- Pages, homepage widgets and `/api/sports` share `getSportsBoard`, which fetches ESPN scoreboards through `src/lib/espn-client.ts`. Browser requests use the relative app API; ESPN requests are server-side, avoiding browser CORS.
- Scoreboard requests use HTTPS/JSON headers and no-store fetches. Fan-out is capped at 12 simultaneous jobs. The 45-second in-process cache and shared in-flight requests remain.
- Temporary HTTP 429/500/502/503/504 responses and connection failures get at most one retry. Both attempts share one four-second deadline. Retry-After is respected; a wait beyond the deadline fails instead of retrying early. Unsupported/unauthorized feeds and malformed JSON/schema responses are not retried.
- ESPN event IDs preserve distinct same-day doubleheaders and race sessions; cross-provider priority/merge rules are no longer needed. Failures are isolated per competition. Source reports identify the ESPN competition and request error. A successful empty scoreboard stays empty; it is not replaced with fabricated events. If every ESPN scoreboard fails, the existing clearly labeled sample board remains. Sample events use only competitions in the ESPN catalog and never count as live. The scores board compatibility `predictions` array remains empty, including on sample boards; the odds page uses its own endpoint.
- **Refresh scores** calls `/api/sports?refresh=1`, bypasses the board cache and receives `Cache-Control: no-store`. Normal API requests retain short response caching. Loading/duplicate-request protection and retryable HTTP/invalid-response errors are tested. Failed refresh responses retain the previous board; automatic 45-second polling and hidden-tab checks remain.

## Scoreboard normalization

`src/lib/espn.ts` normalizes home/away metadata, numeric/string/object scores, live/upcoming/completed states, event-level status, logo arrays and multiple competitions. Invalid dates/unnamed teams are skipped. Missing or invalid `events` arrays are source failures, not successful empty schedules. Unknown scores remain unknown in cards and shares.

F1 uses race titles and reported athlete positions rather than invented Home/Away teams. Same-day sessions have separate IDs and survive aggregation. Race titles and every reported driver are searchable; competition cards, homepage summaries, shares and polls are race-aware. Upcoming races without a line-up remain visible without invented drivers.

## Responsive presentation

- Sport, status, region, competition and team/league search filters combine. Changing sport/region resets incompatible competition selections. All configured competitions remain discoverable, including those without fixtures.
- Phone sport chips scroll horizontally; filters use two columns. On the prior 320px running-page review, this moved the first sample competition card from approximately 988px down to 700px. The browser fixture asserts that cards begin within the first 700px of a 900px viewport.
- Mobile homepage summaries show two distinct competitions near the top, sharing one component and one board with the desktop rail's four-competition summary — see [the match centre](#the-homepage-match-centre).
- Team names get their own row below logos and the central score. Three-digit basketball scores, long names/status labels and poll inputs fit narrow cards. Comment/Poll/Share controls have at least 44px height.
- Sample fixtures are labeled consistently across summaries and event cards. Unrelated predictions are not attached by array index.
- Shared header/navigation and safe-area-aware page padding remain available to signed-in and signed-out visitors.

## The homepage match centre

One component, `src/components/SportsMatchCentre.tsx`, renders both homepage
surfaces — the compact summary in the mobile column and the rail in the desktop
column — from the board the page already fetched. It replaced
`SportsScoresWidget` plus `SportsLiveWidget`, and the second of those called
`getSportsBoard()` itself: a cold cache paid for the 121-competition fan-out
twice per render, and because the two calls were two snapshots taken at different
moments, the mobile summary and the desktop rail could disagree about the same
fixture. Neither component can fetch now; both take `board` as a prop.

Which rows they show is one rule in `src/lib/match-centre.ts`, tested without a
browser:

1. live first, then upcoming, then results — the board's own order;
2. within that, one fixture per competition before a second fixture from any
   competition, so four rows read as four competitions;
3. a fixture the For You feed already carries as a card is **deprioritised, not
   dropped**, and never deprioritised while it is live.

Rule 3 is a preference on purpose. Dropping every fixture the feed mentions would
empty the centre on a quiet day, when the two or three fixtures that exist are
exactly the ones a reader wants scores for — a centre that shows nothing because
the feed is showing it is a hole, not a deduplication. So rows are filled from
fixtures the reader has not just seen, and only then repeated; a quiet day still
fills its rows, and a live score is never treated as a repeat.

The rail also carries a count of what ESPN reports as in play (`2 live`), which is
computed only from `source: 'espn'` fixtures, so a sample board still says "Sample
fixtures" and never claims a live sport.

### How many matches the feed carries

**Every fixture the board reports** — live, upcoming and finished, from any of the
121 configured competitions and any sport. Neither For You nor the Live tab caps
how many matches it carries; the two matches For You used to show and the six the
Live tab used to show are both gone.

What is bounded is the **DOM, not the list**. A match card is a client component
with its own state, poll and share affordances, and a busy day across the whole
catalog can report a thousand fixtures, so a tab materialises
`FEED_RENDER_BATCH = 24` cards at a time and offers the rest with a control that
states exactly how many are left ("Show 24 more · 276 remaining in this tab").
Every card the page built is reachable, the control disappears when nothing is
left, and switching tab starts from the first batch again so one tab's scrolling
does not decide another's. This is why the number on that button is a rendering
fact and never a claim about how much sport is happening.

Ordering, and what each surface does with it:

- **For You** asks `featuredSportsEvents(events, events.length)`, which keeps the
  rule it already had instead of adding a second one: one fixture per sport first,
  so the cards interleaved at slots 1, 3, 5 and 7 among the member posts are not
  four football matches on a day when football dominates the board, and then every
  remaining fixture in the board's own order — live first, then by kickoff. Those
  first four keep their slots; the rest follow the member posts rather than
  displacing them, so the feed still reads as a feed for its first screenful.
- **The Live tab** uses `orderCentreEvents` directly: the board's own order, whole
  and unranked, because a list that shows everything has no scarce rows to spend on
  one fixture per competition.
- **The centre surfaces keep their bounds** — 2 rows in the compact mobile summary,
  4 in the desktop rail — and now that the feed carries every fixture, rule 3 above
  means the rail's fresh tier is the live ones, with the rest filled from the
  board. It still never drops a fixture, so a quiet day still fills its rows.

### The feed's Live tab

`FeedTabs` has a fourth tab beside For You, Following and Saved. It is the sports
desk on its own: every fixture the board reports, live first, then predictions,
then league video news. A prediction already attached to one of those fixtures is
not repeated beside it as a second card for the same match, and For You keeps its
own slots — the tab is additive and moves nothing.

The tab says what it is showing, counted by `summariseLiveCards` rather than by
the component: a fixture this site invented is listed but never counted as live,
and a card that is not a fixture never counts as one. With nothing on the desk it
offers `/sports` instead of filling the gap.

Four tabs do not fit a 320px column with icons and labels, so the icons — which are
decorative, the label carries the meaning — render from `sm` up and labels truncate
rather than push the strip wider than the viewport.

### Basketball and American football: the dashboard's score card

Fixtures in `SCORE_CARD_SPORTS` — basketball and American football, which today
means the NBA, WNBA, NCAA men's and women's basketball and the NFL — are drawn in
the feed as the NFL & basketball dashboard's own match card: two crests either side
of a `V/S`, a competition chip carrying that league's colour from the dashboard's
catalog, a clock pill, one row per side with its score, and a footer naming the
broadcaster. A race is never drawn this way; it has no two sides to put either side
of a `V/S`.

The card is the dashboard's, styled for this feed rather than copied pixel for
pixel: the same structure and the same words, in the app's own light and dark
palette, so it sits beside the other cards instead of punching a dark hole in the
column. Home is first, as it is on the dashboard — the rest of the feed's match card
shows away first, and that difference is deliberate rather than an oversight.

It replaces the league and date row, the two-badge score box, the separate "View
match details" link and the kickoff and venue row, because the card carries the
competition, the clock and the broadcaster instead and the page it links to carries
the venue. What it does *not* replace is the rest of the post: the author header
with its status chip, any prediction, and Comment / Poll / Share all stay, so a
basketball fixture is still something a reader can talk about and not only a
scoreboard row.

**Where the click goes.** The dashboard's match page,
`/nfl-basketball/basketball/match/{id}` or `/nfl-basketball/nfl/match/{id}`, with
`?competition=` for every league that is not that board's flagship — WNBA and both
NCAA divisions — exactly as the dashboard's own `matchPath` decides it, so its
commentary asks the right ESPN feed. Two fallbacks keep the card from ever being a
dead click or a wrong one: a league the dashboard does not serve goes to this app's
own `/sports/matches/{league}/{id}`, and a fixture with no ESPN-reported numeric id
goes to `/sports`. Only a numeric id is ever put in a match URL. A spec walks every
basketball and American football league in the catalog and fails if one has
nowhere to send a reader, so a league added later cannot quietly lose its link.

**What it refuses to claim.** A fixture this site invented never wears a live clock
or a `Final`: it shows its kickoff in the neutral tone while the card's own chip
still says "Sample fixture", and it links to the board rather than to a match page
that cannot answer for it. A score the provider did not report is an em dash — a
fixture that has not started has no score, and none is invented — while a real zero
stays a zero. A broadcaster the provider did not name is "TV TBD". A logo that fails
to load falls back to the team's code on a crest rather than leaving a broken image
in the layout.

The broadcaster is new data: `SportsEvent.broadcast`, parsed the way the dashboard
reads the same payload — the first name in `broadcasts`, or failing that the media
short name, or null. It costs no extra request, because the scoreboard response the
board already fetches carries it; a card and the page it links to cannot disagree
about who is showing a game.

### Highlights in the For You feed

Match highlight clips are **in the feed**, not only in the "Match highlights"
section beside it. For You carries every stored clip in the window — there is no
cap on the list — ordered newest to oldest, each one the same `HighlightPostCard`
the section renders, so a reader can like, comment on and save a highlight exactly
as they can a post. The two surfaces are now deliberately different: the section
stays a bounded list of at most 12 (it is a summary with a link to `/sports/highlights`),
and the feed is the whole window.

What is bounded is the **DOM, not the list**, by the same rule the match cards
follow: `FEED_RENDER_BATCH = 24` cards materialise at a time and the rest are
offered by the control that says how many remain. Clips are interleaved by their
own pass at `HIGHLIGHTS_FEED_SLOTS = [4, 9]` — the last pass, so neither the desk's
score cards (`[1, 3, 5, 7]`) nor the league video (`[2, 6]`) moves when highlights
join — and every clip past the first two simply follows the member posts, newest
first.

**Where the clips come from.** `readFeedClips(days, limit)` in `highlights-index.ts`:
two indexed queries, the rows and a `count(*)`, and nothing else. It cannot reuse
`read()`, which also builds the index page's summary, per-competition totals and
per-state counts — five queries, four of which a feed never looks at. The window is
`STORED_BOARD_DAYS = 7`, the same one the board and the sweep already use, and the
per-query ceiling is the feed's own `FEED_INDEX_LIMIT = 300`, not `read()`'s 60
rows per page. `remaining` reports how many clips the ceiling withheld, so a
ceiling is never silent. Only `kind = 'match'` rows come back: league video is a
separate stack with its own cards.

**Order.** Newest to oldest by the clip's own time, with the index's own tiebreak —
`ORDER BY occurred_at DESC NULLS LAST, id DESC` in SQL, and `orderHighlightClips`
in memory for clips that arrive from a live board rather than from storage. Both
are the same rule, so a feed built from stored rows, from a board, or from both
runs the same way and the two surfaces cannot disagree about what is newest. A clip
with no reported time sorts last inside a merged list rather than jumping to the
front; with a window it does not appear at all, because `occurred_at >= $since`
excludes a NULL — the same behaviour the index read has always had.

**Merge.** `getHighlightClipsForFeed` reads storage first, then adds any real clip
on the board the sweep has not stored yet, deduplicated by clip id and keeping the
stored copy. A board ESPN did not answer (`status: 'unavailable'`) contributes
nothing: its clips are the bundled samples, and the section dresses those in a
heading that says so while a card in the middle of the feed has no such heading.
No clips is the honest answer when there are none.

**Cost and failure.** No extra ESPN request: the board is already fetched for the
section, and the feed spends stored rows. The read is raced against
`FEED_BUDGET_MS = 1200` — above the board's own 900ms because it happens after it,
and a ceiling for a cold pooled connection rather than an expected cost — and never
throws. Storage that is missing, slow or broken leaves the feed with the board the
page already had, which is what it showed before this existed, so the feed is never
the reason the homepage waits or fails.

**Engagement.** Each card's like/comment/save state comes from the anchor post
lookup the page already runs. That lookup is bounded (`MAX_REFS = 60` covered two
leader boards and the highlights list), so a feed rendering up to 300 cards asks
for its own refs with `maxRefs`, up to `MAX_ENGAGEMENT_REFS = 400` — sized so a
full feed plus the boards beside it fit in one lookup. A card whose ref was cut off
would render a Like count of zero over a clip that has likes: a wrong number rather
than a missing one. `dedupeAnchorRefs` therefore orders the groups by priority —
the cards always on screen first, then the feed's clips newest to oldest — so a
ceiling, if one ever bites, cuts the oldest card deep in a batch rather than an
arbitrary one.

**Playing 300 clips does not mean fetching 300 clips.** The card's player keeps
`preload="none"`, so nothing is requested until a reader presses play, and a stream
that will not play falls back to the clip's thumbnail.

Verified: `npm run typecheck`, `npm run test:sports` **479/479** (15 new: the order
rule including clips with no time and the `id DESC` tiebreak, the merge keeping one
card per clip, a sample board contributing nothing, every way storage can fail
degrading to the board, the window and ceiling the read is asked for, `remaining`,
the interleave leaving existing cards where they were, and the ref ordering),
changed-file ESLint, `npm run build`, and five routes at 200.

Because this sandbox has no egress to ESPN, the sweep refuses and the index stays
empty, so the read was also proved against a **real PostgreSQL 18 cluster**
(`scripts/dev-db.sh`): 8 rows written through the real store path, then the 7-day
window returning exactly the five clips inside it newest first, the league row
excluded by kind, the older clip excluded, a smaller ceiling carrying three and
reporting the two it withheld, no window meaning no date filter with the timeless
clip last, an absurd window clamped to a year, the feed's provenance reading
`stored`, a read that misses its budget degrading to no clips rather than an error,
and an anchor post created from a stored clip reachable at ref 90 of 90 with
`maxRefs` while the default bound of 60 cannot reach it — **15/15**, with every
seeded row deleted afterwards and the table back to zero. A temporary 30-clip seed
then confirmed the rendered page: all 30 clips serialized to the client with no cap,
the first batch showing the two newest as cards at their slots ahead of 24 more,
both "Match highlights" sections still showing their own four, and the page at 200
with no trace of them once the seed was removed.

## Verification

```sh
npm ci
npm run test:sports
npm run test:sports-layout
npm run typecheck
```

Install compatible Playwright Chromium first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed browser.

- **72 data/API/transport/odds tests:** ESPN-only catalog/request coverage, bounded concurrency, caching/coalescing, outages, empty schedules, three-digit ESPN scores, samples, normalization, F1 sessions, retries, Retry-After, shared deadlines and API cache headers. Request assertions reject non-ESPN score hosts and assert exactly one request per configured scoreboard on success even when a legacy prediction credential is configured. Prediction arrays stay empty on both real and sample boards; kickoff formatting remains provider-independent. Odds tests cover money-line conversion, modern/legacy schemas, supported filters, per-league/day limits, batching, cache/coalescing, deduplication, sorting, free/premium flags, aborts, total budgets and API validation.
- **46 browser tests:** filters, provider labels, removed competition controls, empty/sample/partial states, dark mode, competition/homepage sizing at 320/375/768/1024/1440px, race positions/polls, unknown scores, manual refresh/retry/loading and automatic score polling. The preserved predictions route is checked at 320/768/1440px for its empty state, responsive odds cards, free/premium metadata, guest sharing links, signed-in share/poll form payloads, filtered refresh/retry and source-outage states. There is no automatic odds polling.
- Fixtures use real components with controlled HTTP/server data. They do not prove current ESPN availability, upstream schema compatibility, successful authentication or database persistence.

### Live deployment diagnostic

```sh
# All configured ESPN scoreboards:
npm run check:espn
# Or selected competitions:
npm run check:espn -- epl nba f1
```

The diagnostic shares the exact app transport/parser, prints endpoint URLs, request/parse status, network errors and event/live counts, limits concurrency to eight and exits nonzero if any selected feed fails. `ok: true` with zero events indicates a valid empty schedule, not necessarily an outage. No ESPN API key is required by these requests.

This sandbox's outbound allowlist excludes `site.api.espn.com`. Prior direct checks resolved DNS but failed TLS with ECONNRESET, before any ESPN HTTP response. Removing another provider does not remove this network restriction. Run the diagnostic from the deployment network before considering live scores confirmed. Do not disable TLS certificate verification to work around connectivity failures.

Latest ESPN-only verification: **72 data/API/transport/odds + 46 sports/homepage browser tests passed (118 total)**. TypeScript and diff whitespace checks passed. Screenshots/traces live under ignored `test-results/`, not in Git.


## Predictions page and removed integration

`/sports/predictions` and the sports-page link remain available to guests and members, with the shared header/navigation. The page now fetches its own ESPN upcoming-match odds feed, not the scores board. See [ESPN_ODDS_CHECKS.md](ESPN_ODDS_CHECKS.md) for API and filtering details. Odds are not advertised as generated picks, and no sample prices are injected.

The previous external prediction endpoint, authentication headers, response parser, credential lookup, prediction fetch jobs, source reports, branding and setup instructions remain removed. The new odds feed is independent: its failures cannot mark healthy score feeds as partial. Existing provider-neutral manual/sample card and time-formatting code remains available without an automatic model-prediction source.

The obsolete integration script was replaced with regressions covering legacy-key isolation and time formatting. The unused credential entry was removed from `.env.example` and test-server instructions. Private environment files were not modified; any obsolete prediction key in a deployment can be deleted, and any genuine key previously exposed in a tracked example should be revoked with its issuer.


## All-sports endpoint / HTTP 404 audit

See [ESPN_ENDPOINT_AUDIT.md](ESPN_ENDPOINT_AUDIT.md) for the complete 38-route inventory, corrected Premiership/Super Rugby IDs, exact upstream URL/status diagnostics, and the distinction between a missing app route and an upstream ESPN 404. `npm run check:espn -- --sport rugby` filters checks by sport; `npm run --silent check:espn -- --json` produces a machine-readable all-sport report. Null HTTP status means no HTTP response, not 404.


## HTTP 403 access denials

See [ESPN_ACCESS_DENIED.md](ESPN_ACCESS_DENIED.md). The user reports HTTP 403 in both preview and deployment; origin/cause is not proven by status alone. Source reports now include bounded, allowlisted `responseMetadata` on HTTP errors, and the diagnostic counts 403 separately. No headers are spoofed, no access restriction is bypassed, and no successful live-data fix is claimed.
