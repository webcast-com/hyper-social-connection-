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

### The desktop homepage: two rails and two card rows

From `lg` (1024px) the homepage is a centre column with a right rail (scores,
trending, people, contacts); from `xl` (1280px) a left rail of navigation joins it.
Both rails are sticky under the navbar and scroll on their own when they are taller
than the window, so they stay in reach for the whole feed. Below `lg` nothing here
applies — the single-column page is unchanged.

"Players & top scorers" and "Match highlights" pass `layout="row"` on the homepage.
`src/components/CardRow.tsx` then lays their cards out as one sideways,
scroll-snapping row from `lg`, with previous / next buttons that appear only when
there is more in that direction, and keeps the ordinary stacked column below `lg`.
Stacked, the two boards stood about 3,000px tall and the first member post sat
below them; as rows the feed's tabs start roughly 1,500px higher. Cards in a row
are narrow, so `SportsPostCard` takes `dense` (three-line body, full text in
`title`) and its action row drops to icons by container width, not viewport width —
the same card is full-width on a phone and 280px wide in a desktop row.

### Players & top scorers in the rails

`src/components/SportsLeadersRail.tsx` is one sport's leaders as a compact list:
photo, name, team and statistic, and the value ESPN reported, each line linking
to the player. The homepage places **NFL at the foot of the left rail**, under
the groups ("Find groups to join" for someone in no group), and **basketball at
the foot of the right rail**, under Contacts. Between `lg` and `xl` there is no
left rail, so the NFL list follows basketball in the right rail instead of not
appearing. Both read the boards the page already fetched for
`SportsLeadersBoard`, which stays in the feed column; no extra ESPN request is
made. A sport ESPN did not answer for renders no list and no sample players.
Tests: `leaders-rail.test.ts`.

### Endless scrolling, no "load more" button

The homepage feed and the Match Highlights page both used to stop and wait for a
press ("Show 24 more", "Load 24 more stored clips"). Both now continue on their
own: `src/components/InfiniteSentinel.tsx` is an invisible marker after the last
card, and when it comes within 800px of the window it asks for more — the feed
reveals its next 24 cards, the highlights page reads its next page from
`/api/sports/highlights`.

- **It cannot stall.** An observer reports a change, not a state, so if the marker
  is still in range after cards arrive (a tall window, a short page) nothing would
  fire again. The observer is rebuilt every time the list grows, and a new one
  always reports where the marker is now.
- **It cannot loop.** On the highlights page the marker is not watched while a
  request is in flight, and a failed read stops the scrolling from asking again:
  the end of the list says "Could not load more clips" with a **Try again** button.
  That button is the only one, and only after a failure.
- **A repeated clip is shown once.** A clip stored between two page reads moves
  every later row down one, so the next page can start with the last clip of the
  previous one; appended pages are de-duplicated by clip.
- **No IntersectionObserver, no dead end.** A browser without it gets a plain
  button in the marker's place.
- **The homepage "Match highlights" board** holds every clip (at most 12) in its
  desktop row, with no control. Stacked on a phone it still shows four behind
  "Show all": it sits above the feed, and twelve stacked cards would bury it.

Tests: `feed-tabs.test.ts`, `highlights-page.test.ts` and
`highlights-post-cards.test.ts` (with `fake-intersection.ts` standing in for the
observer jsdom lacks), and `infinite-sentinel.test.ts` for the button fallback.

### The board's featured match

When the view holds more than one fixture and ESPN reports one of them as live, `/sports` draws that match large above the competitions (`SportsFeaturedMatch`, chosen by `pickFeaturedEvent` in `src/lib/featured-match.ts`). The rules, all covered by `tests/sports/featured-match.test.ts` and the browser fixture (`tests/sports/layout.spec.ts`):

- **Only a live fixture ESPN reported is featured.** A sample fixture, a race and an upcoming or finished match never are, so a board with nothing live looks exactly as it did before, and the 700px rule above is unchanged for it. When a match is featured, that card is the first score on the page and the first competition card starts below it (about 900px at 320px wide).
- **It is a second view, not an extra fixture.** The match stays in its competition below; the featured card is a labelled `section`, not an `article`, and has no heading, so counts of cards and competition headings are unaffected. With a single fixture in view there is nothing to feature it over, so no card is drawn.
- **It follows the filters.** It is picked from the filtered view and sits under the controls, so changing a filter never moves the control being used.
- **Sports are not ranked against each other.** The first live fixture in the board's order decides the sport; within it the most combined scoring wins, then the football match furthest into its clock, then board order.
- **Nothing is invented.** Away is first, as on every board card; an unreported score is a dash and counts as nothing when ranking; the progress bar is drawn only from a football minute the provider gave (`54'`, `HT`).

The same file supplies three additions to the board's own card, none of which changes its markup for an existing state: the loser of a finished match is dimmed (never in a draw or with an unreported score), an upcoming fixture inside the next 24 hours shows a countdown (`in 2h 15m`, refreshed each minute from the board's clock), and a scoreline that changes between two refreshes is tinted for a moment (colour only, off under reduced motion). A logo that fails to load is replaced by the side's code. A back-to-top button appears after 600px of scroll and sits above the mobile tab bar.

### Matchday mode

The **Matchday** control beside "Reset filters" opens `SportsMatchday`: the fixtures in the current view at large size, six to a page, in a dialog that fills the window. It sits in the existing count row, which keeps its 44px height at 320px, so nothing below it moves.

- **The same fixtures as the board.** It is handed the filtered list and the board's clock, in the board's order, and fetches nothing: a refresh of the board is a refresh of the dialog. Nothing is rendered while it is closed, so the board's card, heading, link and status counts are unaffected.
- **A native modal `<dialog>`.** Focus stays inside, Escape and "Exit matchday" close it, the page behind is inert and does not scroll, and focus returns to the launcher. Without `showModal` the launcher does nothing rather than open a layer that cannot be left.
- **The board's honesty rules.** Away first; an unreported score is a dash; a sample fixture's pill reads "Sample fixture" and has no match link; a race is drawn as its title and reported positions, never as a scoreline; the loser of a finished match is dimmed.
- **Paging.** `matchdayPage` clamps a page past the end to the last page, so a view that shrinks under the reader never shows an empty page while fixtures remain. Opening always starts on page 1.

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
`FEED_RENDER_BATCH = 24` cards at a time and adds the next batch as the reader
scrolls towards the end of the one on screen — endless scrolling, with no button
(`InfiniteSentinel`, see [below](#endless-scrolling-no-load-more-button)).
Every card the page built is reachable, the end marker disappears when nothing is
left, and switching tab starts from the first batch again so one tab's scrolling
does not decide another's.

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
follow: `FEED_RENDER_BATCH = 24` cards materialise at a time and the rest arrive
as the reader scrolls. Clips are interleaved by their
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

### The feed's Highlights tab

The feed's fourth tab is **Highlights**; it took the place of Saved. It is
supplied by the same stored index the Match Highlights page (`/sports/highlights`)
pages through: the homepage's one clip read now asks for **no window**
(`ALL_STORED_DAYS`), so it returns every stored match clip newest first, up to the
read's ceiling (`FEED_INDEX_LIMIT`, 300), merged with any real clip on the board
the sweep has not stored yet. It is still one lean read — rows and a count — and
still no ESPN request.

- **Highlights** shows that whole list as the same `HighlightPostCard` For You
  renders, revealed in batches like every tab, under a line that counts the clips
  and links to the page with the competition, state and age filters. When the
  ceiling, not the index, was what stopped the read, the tab ends with
  "N older clips on Match Highlights" rather than ending as though that were all.
- **For You** takes the recent clips from that same list (`recentHighlightClips`:
  the seven-day window it has always had, plus any real board clip), so the cards
  between member posts are the same ones as before this tab existed.
- A board ESPN did not answer still contributes nothing to either. An empty tab
  says so and links to the page; nothing is invented.
- League video is not in this tab. It is a different card with its own feed, and
  stays where it was: For You and Live here, and its own section on the page.

Saved posts moved to the member's own profile: a **Saved** section beside Posts
(`ProfilePostTabs`, `src/lib/saved-posts.ts`), reached from the header: the
avatar is a **profile menu** (`ProfileMenu`) with *Your profile* and *Saved*.
The menu's link is `/profile/{id}?tab=saved` and carries no `#fragment` — the
router doubled one on a second visit and did not scroll — so the menu asks for
the section and the section scrolls itself into view (`src/lib/saved-section.ts`),
which also covers pressing Saved when it is already the address. Pressing the
Posts / Saved switch rewrites `?tab=` without a request to the server. It keeps the tab's rules — no post by a
blocked or muted author, nothing still scheduled — and lists the most recently
saved first. Bookmarks are private: the loader takes the viewer's id, the page
calls it only when the viewer is the profile's owner, and on anyone else's
profile (or signed out) there is no switch and no saved list in the payload,
whatever `?tab=` says. Checked in a browser against the local database: three
saved posts in save order, removing one from its menu drops it and the count
without leaving the section, another member's saved post absent from their
profile's HTML, and no overflow at 320px.

At 320px the four labels are as wide as their text needs (`flex-auto` below `sm`)
instead of four equal quarters, which were too narrow for "Highlights".

### Players & top scorers: ESPN only, no sample players

The leaders board on the homepage and the Top scorers section on Discover showed
sample players because the endpoint they asked had stopped existing:
`site.web.api.espn.com/apis/common/v3/sports/{sport}/{league}/leaders` answers
**404** for both the NBA and the NFL (checked 2026-11-15). ESPN serves the same
data from `site.api.espn.com/apis/site/v3/sports/{sport}/{league}/leaders`, which
is what `leadersUrl` in `src/lib/espn-leaders.ts` now builds. `limit` is players
per statistic — every entry repeats its team's whole logo and link set — so the
homepage asks for 1 and Discover for 5.

The payload's shape differs from the old one (`leaders` is an object, the
statistics are its `categories`, and the `team` sits on the entry beside the
`athlete`); the normalisers already walked nested lists and read either team
position, and `tests/sports/leaders-v3-fixture.ts` locks today's shape.

The bundled fallback is gone (`bundledRows`, `bundledTopScorers`). A feed ESPN
does not answer is an `unavailable` board with **no rows**: if the other sport
answered, the board opens on that one and the failed tab says "ESPN did not
return … leaders just now"; if neither did, the section is not rendered.

The Basketball & NFL dashboard asked the same dead path, so its leaders rail and
Top scorers screen never left demo data. `leadersUrls` in
`vendor/nfl-nba/src/api/espn.js` now asks the v3 endpoint, and the same-origin
proxy (`src/lib/nfl-basketball-proxy.ts`) serves that one endpoint from `site/v3`.
The dashboard's own demo data for its first paint is unchanged.

## Highlights and fixtures as pages of their own

The site stores every clip it has ever read — production holds 667, each with a
title, a description, a fixture, a competition and a length — and all of it sat
behind one filterable list at `/sports/highlights`. There was no URL for a crawler
to reach, so none of it could rank for the search that brings a reader to a
highlight ("Canucks vs Rangers highlights"), and nothing on the site was eligible
for a video result. Search Console reported 11 indexed pages and no impressions.

### One URL per stored clip

`/sports/highlights/{clipId}` is keyed by `highlightAnchorId` — the same identity
the clip's post anchor uses — so a card, its Like button and its permalink cannot
disagree about which clip they mean. The page is server-rendered from storage and
makes no ESPN request:

- `generateMetadata` with `type: 'video.other'`, the clip's thumbnail as the shared
  image, and keywords from the league, fixture and both sides.
- `VideoObject` + `BreadcrumbList` structured data, `<`-escaped as the homepage does.
- `LinkMediaPlayer` with `preload="metadata"` — one page whose whole subject is one
  video, so the poster loads but the bytes do not until the reader plays it. When
  the stored row is unplayable the page says so in prose and shows the thumbnail as
  an image rather than rendering a player that cannot play.
- A clip this site has never stored is a **404**, not a heading with nothing under it.

**Nothing on the page claims a fact ESPN did not report.** A clip with no thumbnail
gets no `VideoObject` at all rather than one with an invented image; a clip with no
reported length gets no `duration`; `iso8601Duration` returns null for a
non-finite or non-positive value and drops fractions rather than rounding them; a
clip whose stored `description` is only its `title` again gets a description
assembled from the fixture, competition, match state and length; and a clip with no
reported time gets no `lastmod` in the sitemap.

`clipPageTitle` appends the fixture only when the title does not already carry it:
a clip titled "Perreault lights the lamp" becomes "Perreault lights the lamp —
Vancouver Canucks vs New York Rangers highlights", while "Canucks hold off Rangers"
is left alone because it already names the fixture. Each side's **last word** counts
as naming it, and a clip ESPN gave no title for is headed by its fixture rather than
by a placeholder that would repeat the word "highlights" and name nothing.

### Discovery, because a page nothing links to is a page nobody finds

- The sitemap lists `/sports/highlights` (hourly, 0.8) and one URL per stored clip
  ref (weekly, 0.7), newest first, capped at `SITEMAP_CLIPS = 1000` per query with
  `lastModified` only where a stored time exists.
- The dashboard's **96** hub, team and player URLs are **no longer submitted**. They
  are one client-rendered document over the vendor's bundled sample data — the pages
  say "Sample schedule" — and asking a crawler to spend 96 of its visits on a site
  this size left little for pages carrying something true. `dashboardSitemapRoutes()`
  is kept for when they do.
- A highlight card now carries a visible **"Highlight page"** link (`SportsPostCard`'s
  new optional `permalink`). The card-wide link goes to the fixture's board and the
  menu's links exist in the DOM only once a reader opens it, so neither was a way for
  a crawler to reach the clip.

### A match page is indexable only when this server can describe it

`/sports/matches/{league}/{eventId}` used to be a shell: it rendered an empty board
and fetched in the browser, so a crawler arrived at an `<h1>` saying "Loading match
details…" and nothing else — which is why the route was `index: false`, the honest
setting for a shell. But every stored clip carries the fixture's own reported facts,
so a fixture with stored clips has something true to say before any browser fetch:

- `readEventClips` matches a stored `event_id` **exactly or as a dash-separated
  prefix**, because the id is namespaced (`espn-{league}-{id}`) and a scoreboard
  reporting more than one competition appends the competition id to it. A clip's id
  therefore cannot be turned into a match URL by string surgery, and a match page
  finds its clips by prefix instead.
- `matchPageFacts` takes each fact from the newest stored clip that has it, so a
  later clip can supply a detail an earlier one did not.
- The page renders the fixture's facts as prose, links its stored clips, marks the
  page `index: true` with a `SportsEvent` + `BreadcrumbList`, and passes the fixture
  name down as `knownTitle` so the page's own `<h1>` names the fixture in the HTML a
  crawler reads. The fetched title still wins once it lands.
- **A fixture with no stored clips stays exactly the shell it was** — `noindex`, no
  stored section, no `SportsEvent`. An index full of empty match pages would be
  worse than none.
- Fixture URLs enter the sitemap only when `storedMatchReference` reverses the stored
  id into a reference the route will actually serve, deduplicated so two stored forms
  of one fixture are one URL. Submitting a URL that 404s costs the crawl budget it
  was meant to earn.
- **An address that names no fixture is a 404**, not a shell: `resolveMatch` refuses a
  non-numeric id, an all-zero id and an unknown competition, because `matchReference`
  requires `/^[1-9]\d{0,19}$/` — the same shape as `routeIdFromParam` below. This route
  always had the strict rule; it was only prevented from acting on it, by a
  `loading.tsx` that flushed the status line before the page could throw.

### Which routes and accounts are submitted at all

A sitemap is a request, not an inventory, and everything in it costs crawl budget on
a domain this young. `src/lib/sitemap-rules.ts` holds the two decisions as pure,
tested rules.

**Three pages are no longer submitted.** `/login` and `/signup` are two forms with no
content and are the least worth a visit of anything on the site; `/search` is a query
surface, so submitting it invites a crawler into an unbounded space of
near-duplicate result pages it can never finish. All three remain reachable and
indexable — nothing blocks them, the site just stopped asking for them.

**Two kinds of account are not submitted.** The sports desk is a system account that
authors the anchor posts, not a person: Discover, people suggestions and the homepage
contacts rail already leave it out, and a sitemap is the same kind of list. And the
five seeded demo accounts live at `example.com`, reserved for documentation by RFC
2606 and created by both seeds in this repository with a password published in the
repo. The desk is recognised by `SPORTS_DESK.email` rather than by its
`accountType = 'broadcaster'` column, because the committed Prisma client predates
that column and this repository does not regenerate it — the same reason
`discover/page.tsx` filters on the address.

**The rule excludes only on positive evidence.** An account with no address, or one
at a domain the rule does not recognise, is submitted: dropping a real member's page
is a worse mistake than listing one account that should not have been there.

**Those same accounts are not indexed either.** Leaving a URL out of the sitemap
lowers its priority; it does not hide the page, because the homepage rails still link
to it. So the profile page asks the same question — `isAppAccount` in
`src/lib/app-accounts.ts` is the single place that decides, so the two call sites
cannot drift into submitting a page they do not index or indexing one they will not
submit — and answers `noindex, follow` for the desk and the five demo people.
`follow` stays on, as it does for a private profile: a noindexed author does not take
their posts and groups with them. The address is read for that one comparison and is
never published; the specs assert it appears nowhere in the metadata.

**A page is dated by the newest thing it renders.** `/` and `/discover` carry the
newest public post's date, `/groups` the newest public group's, `/sports` and
`/sports/highlights` the newest stored clip's — all three reads already come back
newest-first, so no extra query is made to date a page. `/sports/predictions` gets no
date because live odds carry no stored instant, and neither do `/about` or `/privacy`
because their copy changes when a person edits it: a constant that has to be
remembered and bumped is a date that eventually lies, and a made-up `lastmod` is a
lie in the one file a crawler is told to trust.

### The homepage no longer links where robots.txt says not to

`/messages`, `/notifications` and `/settings` are disallowed in `robots.ts`, but the
anonymous homepage handed a crawler seven links to them: the desktop and aside
contacts rails linked every contact to `/messages/{id}`, the rail's heading linked to
`/messages`, and the mobile tab bar and desktop nav linked `/messages` and
`/notifications` unconditionally. A link to a route the crawler was told to skip is
wasted discovery, and for a visitor it is a dead end at the login wall anyway.

Those links now depend on whether anybody is signed in, following the pattern the
nav's own Profile link already used. To a member a contact is a conversation; to a
visitor it is a person, and the person's page is the one worth crawling. The rail's
heading reads "Inbox" for a member and "Sign in" for a visitor. `MOBILE_TABS` gained
a `memberOnly` flag so the two account tabs point at signing in for a visitor while
Home, People, Sports and Groups keep working for guests. The anonymous homepage HTML
now contains **zero** links to a disallowed route.

### Verification

`npm run typecheck`, `npm run test:sports` **484/484**, `npm run test:seo` **70/70**
(27 metadata/sitemap + 12 clip-page rules + 10 match-page rules + 8 sitemap-rules +
5 app-account rules + 3 route-id rules + the pre-existing dashboard specs),
changed-file ESLint with 0 errors, `npm run build`.

The 404s were then checked against both a dev server and a **production build**:
`/profile/999999`, `/profile/abc`, `/profile/12abc`, `/profile/0`, `/profile/-5` and
a 25-digit id all answer 404, `/profile/1` and `/profile/5` still answer 200, and the
metadata on a non-id describes nobody rather than the member a loose parse would have
found.

### A missing profile is a 404, and an address that names nobody is too

`/profile/{id}` answered HTTP **200** for an id that did not exist, with a body
reading "User not found." Its metadata was honest — `noindex` and the generic
"Profile on Hyper" — but the status was not, so a crawler walking `/profile/1..n`
found an unbounded space of soft 404s, each costing a visit and saying nothing.

Two causes, both fixed:

- **A missing row rendered a sample person.** When the database was reachable but had
  no such member, ids 1–5 fell through to the hardcoded `DEMO_USERS_MAP` and rendered
  five people who do not exist. A configured database that has no such member is a
  404. The offline demo install, which has no database to ask, keeps its fallback.
- **`parseInt(id) || 1` guessed.** `/profile/abc` became member 1 and `/profile/12abc`
  became member 12 — a page whose URL names nobody rendering somebody at 200, while
  the metadata, parsing strictly, described nobody. `profileIdFromRouteParam` in
  `src/lib/profile.ts` is now the one rule and both the page and its metadata ask it:
  an id is a positive integer written in full, or it is not an id. Padded, truncated,
  signed, fractional, zero, negative and past-a-safe-integer addresses are all
  refused rather than guessed at, because a guess renders a real person under an
  address that is not theirs.

`notFound()` is called **outside** the page's `try`, deliberately: it throws to
unwind, and the catch that handles a database outage would otherwise swallow it into
the demo fallback — the same trap that turns `redirect()` into a logged query failure
in `groups/[id]`. A database outage still falls back rather than 404ing, because a
transient failure must not tell a search engine that a page does not exist.

**`src/app/not-found.tsx` now exists.** Without it, `notFound()` rendered Next's bare
fallback: an empty body, no navigation, nothing to read. The page says what happened,
guesses honestly at why, and points at five pages that carry content. It answers every
unmatched URL on the site as well as the five routes that throw `notFound()` —
profile, clip, match, team and athlete.

**Known limitation, investigated rather than assumed — see "A thrown 404 has no HTML
body, and no released Next.js fixes that" below.** An unmatched URL server-renders that
page in full, but a `notFound()` thrown from a page returns **HTTP 404 with an empty
`<body>`**: the copy is present in the response, but only inside the flight payload, so
a client that runs JavaScript renders the page and one that does not sees nothing. The
status is 404 either way, which is what a crawler acts on. Not browser-verified here —
this sandbox has no Chromium — but the payload was checked directly: the strings
`404 — page not found`, `This page isn't here`, `Discover people` and `Match highlights`
are all in the response for `/profile/999999`, with zero visible characters in the
`<body>`.

### A thrown 404 has no HTML body, and no released Next.js fixes that

Every route that throws `notFound()` — profile, group, post, clip, match, team, athlete
— answers with the correct **404 status and an empty `<body>`**. What the server sends
is `<div hidden=""></div>` plus
`<template data-next-error-message="NEXT_HTTP_ERROR_FALLBACK;404">`, and the 404 page's
own content only in the flight payload. An unmatched URL, by contrast, server-renders
`src/app/not-found.tsx` in full — same status, complete body, site chrome and all.

This was investigated rather than accepted. Two things were ruled out by measurement:

- **Throwing from `generateMetadata` instead of the page does not help.** The team and
  athlete routes already throw there, and their bodies are just as empty. Metadata runs
  before the page, so if anything could settle the response early it would be this.
- **`experimental.globalNotFound` + `src/app/global-not-found.tsx` does not help, and
  costs something.** Next 16.2.6 does have the flag: with it, the not-found tree is
  built with that file as the *layout* and an empty stub as the page, so the document
  itself is the 404. It was implemented, enabled and measured on a dev server **and in a
  production build**: every thrown 404 still had **zero visible characters**, while an
  unmatched URL — the one case that already worked — **lost its `<title>`**, because
  with `global-not-found` present Next takes the 404's metadata from the page and an
  unmatched URL has none. It also made `/_not-found` dynamic at build time and added a
  viewer read to every 404. Reverted: no benefit, one regression.

Upstream confirms the mechanism and that it is deliberate. Per vercel/next.js#100596,
the flight phase emits an error chunk for the segment; Fizz's `InnerLayoutRouter`
re-throws `NEXT_HTTP_ERROR_FALLBACK;404` while turning that stream into HTML;
`HTTPAccessFallbackErrorBoundary` is a class-based boundary, so streaming SSR does not
catch it and the whole SSR pass aborts; `app-render`'s `catch` then sets
`res.statusCode = 404` and emits the `<html id="__next_error__">` recovery shell with
the original flight stream embedded, so a client can render it. A fix landed in #92231
and was **reverted on purpose** in #94037 (merged 2026-05-26, so it is in 16.3 and
later too) to keep error pages resumable for parallel routes and `cacheComponents`. The
community PRs that would server-render the nearest boundary, #98455 and #98583, are both
still **open**, and 16.4.6 shipped 2026-11-09 without them. **Upgrading is therefore not
a fix** — the behaviour is current and intentional. See also #99287, #99793 and #85446
(`global-not-found` not served for dynamic paths, which is exactly what was measured).

Two workarounds exist in app code, and neither was taken:

1. **A `proxy.ts` that rewrites a malformed id to a path nothing matches**, with
   `status: 404`. An unmatched path is the one case that *does* render a full body, so
   this would give real HTML 404s — but only for addresses that are not ids at all
   (`/profile/abc`, `/post/1e3`, `/groups/0x10`, `/sports/matches/nhl/abc`). It cannot
   cover `/profile/999999`, the case a crawler walking an id space actually hits,
   without a database query in the proxy.
2. **That same proxy with an existence check**, which would cover everything at the cost
   of a second read on the site's hottest routes and Prisma coupled into request
   middleware.

Both put a new component in front of every request the site serves to improve the body
of a response whose **status is already correct**, for readers who do not run
JavaScript. Not worth it while the status — the part a crawler acts on — is right.

One real bug did come out of looking: `not-found.tsx` rendered its own `<main>` inside
the root layout's `<main>`, which is invalid HTML and gives assistive technology two
landmarks both claiming to be the page. It is a `<div>` now, and a 404 has exactly one
`<main>`.

### The same rule for every id this site takes from a URL

`/post/{id}` and `/groups/{id}` had the same soft 404, and each route parsed its id
its own way, each loose in a different direction: `parseInt(id) || 1` turned
`/profile/abc` into member 1, `Number(raw)` turned `/post/1e3` into post 1000 and
`/post/0x10` into post 16, and `parseInt(id)` handed `/groups/abc` a NaN that Prisma
then rejected — and the rejection was logged as a database failure. A URL that named
nobody rendered somebody, at HTTP 200.

`routeIdFromParam` in `src/lib/route-id.ts` is now the one rule and all three routes
ask it, in the page **and** in its metadata, so the two cannot disagree about which
record is on screen. It replaced `profileIdFromRouteParam`, which was the same rule
under a name that only fitted one of the three.

**`groups/[id]` was worse than soft.** It called `redirect('/groups')` for a missing
group *inside* the `try` whose `catch` turns a failure into a placeholder page, so its
own error handler caught the throw and logged it as
`[group detail] DB query failed: NEXT_REDIRECT` — the redirect never happened, and the
page rendered "Demo Group" at 200. The lookup is now its own step, and the 404 is
decided outside the `try`, because a throw that unwinds must not be caught by a handler
whose job is to cope with a database that could not be reached. **"No such group" is an
answer; "the query failed" is a failure**, and only the second may fall back.

A missing group is a **404 rather than the redirect it used to attempt**: an address
that names no group is not another page's address, and a crawler told the two are the
same learns the wrong thing. A database outage still falls back to the placeholder at
200, because a transient failure must not tell a search engine that a page does not
exist.

`post/[id]` already distinguished the two — it carries a `dbError` flag — so its 404 is
precise: `hasDatabase && !dbError && !post`. Offline demo mode and an unreachable
database both still render their own explanation at 200, which is now the only thing
that "This post isn't available" copy is for.

Verified against a dev server **and a production build**: `/profile/999999`,
`/groups/999999`, `/groups/1e3`, `/post/0x10` and `/post/12abc` all answer 404, while
`/profile/1`, `/groups/1` and `/post/1` still answer 200 and still render their own
content — the group its real name and members, the post its real text — rather than a
placeholder. The `NEXT_REDIRECT` warning no longer appears in the server log.

### The match route's status line was already sent before the page could say 404

`/sports/matches/{league}/{eventId}` answered **HTTP 200** for an address that names no
fixture — `/sports/matches/nhl/abc` and `/sports/matches/zzz/401892706` both served the
not-found body at 200. A soft 404 with the right content and the wrong status, and not
the route's own logic: `resolveMatch` throws `MatchInputError`, and both the page and
its metadata call `notFound()` exactly as `/sports/teams/` and `/sports/athletes/` do —
and those two answer 404.

The difference was `loading.tsx`, which this was the **only** route in the app to have.
A `loading.tsx` wraps the page in a streaming `<Suspense>` boundary, so the shell — and
with it the HTTP status line — is flushed **before** the page runs. By the time
`notFound()` throws, 200 is already on the wire and the not-found content arrives later
in the stream: the reader sees the right page and the crawler records the wrong status.
The same flush-before-the-throw mechanism as the empty body of a thrown 404 above, seen
from the status side rather than the body side. It was proved rather than assumed — move
the file aside and all three bad addresses become 404 while the real fixture stays 200;
restore it and the 200s come back.

**The file is deleted**, and the route now answers like its siblings:
`/sports/matches/nhl/abc`, `/sports/matches/zzz/401892706` and
`/sports/matches/nhl/000000000` are all **404**, while the real fixture
`/sports/matches/nhl/401892706` is **200** and still renders its own title and content —
verified on a dev server **and in a production build**.

What the deletion costs is less than it looks. The placeholder said "Loading ESPN match
details…", and `SportsMatchDetails` renders that same line itself while it fetches
(`src/components/SportsMatchDetails.tsx:153`), so the copy is still in the HTML this
route serves — confirmed by fetching the real fixture after the deletion. The file only
covered the interval before the server responds, an interval no other route on this site
covers either. What is **not** fixed is the body: like every thrown 404 here — profile,
group, post, clip, team, athlete — the status is right and the visible body is empty,
the framework limitation documented above. Nothing in the repo referenced `loading.tsx`
or its component, and no spec asserted the placeholder, so deleting it changed no test.

The three new index reads were proved against a **real PostgreSQL 18 cluster**, which
caught a bug no spec could: `readStoredClip` passed `rows[0]` to `rowToMatchClip`
without checking the row existed, so every unknown clip id threw
`Cannot read properties of undefined (reading 'status')` and was logged as a failed
query — a crawler asking for ids that do not exist is ordinary traffic, not an error.
Every seeded row was deleted afterwards. Rendering was then checked against a real
server: the clip page 200s with `index, follow`, its own canonical, `og:type
video.other`, the clip thumbnail as the shared image and both JSON-LD blocks; an
unknown clip id 404s; the fixture page 200s with the fixture in its `<h1>` and no
"Loading" text in the HTML, while a fixture with nothing stored 200s as `noindex`;
and the homepage renders stored clips with **no** sample-card copy anywhere in it.

The profile rule was checked in both directions against a running server and real
rows: all five seeded profiles serve `noindex, follow`; a temporary member at
`gmail.com` and a lookalike at `notexample.com` both serve `index, follow`; the
desk's own address serves `noindex`; and while those three rows existed the sitemap
submitted exactly the two members and neither app account. All three temporary rows
were deleted afterwards.

The sitemap and link rules were then checked against a running server with the real
seeded database: `/login`, `/signup` and `/search` absent, no dashboard URLs, **zero**
of the five `example.com` demo profiles submitted, `/`, `/discover` and `/groups`
carrying the newest post's and group's dates, `/sports*` carrying none while the clip
table is empty rather than inventing one, and no disallowed link anywhere in the
anonymous homepage.

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


## Live streams (`/sports/live`): SportSRC

The live-stream screen is a three-column dashboard (navigation and leagues, the
player and the match list, news and highlights) with its own near-black and
orange styling, scoped to that route in `src/app/sports/live/stream.css`. From
1024 px it replaces the site header with its own top bar; from 1280 px it is the
three columns; below 1024 px the site header and bottom tabs stay and the
columns stack.

Matches and streams come from SportSRC (`https://api.sportsrc.org/v3/`), three
free endpoints: `matches` (fixtures that have a stream, by league), `detail`
(the stream sources for one fixture) and `sports`.

- **The key stays on the server.** `src/lib/sportsrc-feed.ts` is the only file
  that reads `SPORTSRC_API_KEY`; it sends it as the `X-API-KEY` header. The
  browser talks to `/api/sports/streams` and `/api/sports/streams/detail`.
  `/api/health` reports `streams.configured` (present or not, nothing more).
- **Requests are rationed.** The free plan is 1,000 requests a day for the whole
  site. One `matches` request serves all five tabs (no status filter); answers
  are kept in memory (current list 2 min, a picked day 10 min, a match's sources
  5 min, the sports list 1 h); concurrent readers share one request; under 100
  remaining everything is kept four times as long; at zero nothing is asked
  until 00:00 UTC; a failed refresh serves the last list, marked stale. The
  browser re-reads once a minute and only while the tab is visible.
  `SPORTSRC_MATCHES_TTL_SECONDS` shortens the two minutes on a paid plan.
- **Nothing is invented.** A status is one of SportSRC's exact strings; a clock
  is its minute, else the period it named ("2H"), never worked out from the
  kickoff; a fixture that has not started has no score; SportSRC has no viewer
  count, so there is none; the sport tabs are the sports SportSRC lists.
- **The player is a third party's, in a frame.** It is requested only when play
  is pressed and removed on stop. Only `https` addresses are framed. The frame
  has no `sandbox` attribute and the default referrer policy, because the player
  refuses a sandboxed frame and one with no referrer. Controls that would need
  to reach inside the frame (volume, seeking) are not drawn; play, stop, the
  source switcher and full screen are real.
- **Play is offered when it can work**: a stream exists and the match is in play
  or starts within 30 minutes (SportSRC's own rule). Otherwise no request is
  spent.
- Bookmarks, saved stories and favourite clubs are kept in the browser
  (`src/lib/stream-saved.ts`); they need no account.
- Latest News is the league video news the home feed uses; Latest Highlights is
  the stored highlights list. Neither comes from SportSRC, which has no news or
  video data.

### The homepage's floating live-stream card

`src/components/LiveStreamToast.tsx`, mounted on the homepage only. A small card
in the bottom-right corner (above the tab bar on a phone) names one match that
can be watched now — in play, or starting within 30 minutes — stays 8 seconds,
goes away, and returns 22 seconds later with a **different** match
(`src/lib/stream-toast.ts`: every match is shown before any is repeated, and a
new round never opens with the match just shown). The card links to
`/sports/live?match=<id>`, which opens the player on that match.

It first appears 3 seconds after the page loads and reads `/api/sports/streams`
itself, so the homepage render pays nothing for it. It shows nothing when there
is nothing to watch or no key is set, waits while the pointer or keyboard focus
is on it, is `inert` while hidden, is not a live region, pauses in a hidden tab,
and its close button ends it for the rest of the visit (`sessionStorage`).
Tests: `stream-toast.test.ts`.

### What the service sends, and finding out why nothing plays

SportSRC's answers differ from its documentation, and the first release read
only the documented shape. Seen on the live site on 2026-11-19:

- `timestamp` is in **milliseconds**, not Unix seconds. Read as seconds, every
  kick-off landed in the year 58854: no upcoming match ever came inside the
  30-minute window, and the list's order by kick-off meant nothing.
  `streamInstant` reads both.
- the score is not under `score.home` / `score.away`; every row said "vs". It is
  now also read from `score.current` and from `score.display` ("2 - 1").
- `detail` answered `unavailable` for every match, so no match had a source and
  **nothing played**. `parseStreamDetail` now reads the match's fields under
  `data` (documented) or under `data.match_info` (the earlier version's
  nesting), takes the sources from `data.sources`, and no longer discards an
  answer for not repeating the id.

When `detail` has no source for a match in play, or cannot be used at all, the
free `stream` request (sources only) is tried once. A match that has not
started costs one request, as before.

`/api/sports/streams/detail?id=<match id>` now says why there is nothing to
play: `reason` is `http-<status>`, `refused`, `timeout`, `network`, `not-json`,
`shape` or `no-sources`, and `note` carries SportSRC's own message when it
refused (the key is cut out of it). Adding `&debug=1` also returns `shape`: the
field names and types of the answer that could not be used, no values. It reads
the cached result, so it costs no SportSRC request.

Outside the code, a stream plays only when a key is set **and** the site's
domain is on SportSRC's embed whitelist (the player checks the page's referrer).

Tests: `sportsrc.test.ts` (parsing and rules), `sportsrc-feed.test.ts` (key,
caching, allowance, failures), `stream-dashboard.test.ts` (the screen mounted in
jsdom, including the frame's attributes).

## Sponsored banners

Two paid betting banners, listed in `src/lib/sponsor-banners.ts` (the link and
the creative are the advertiser's own; empty the list to take them down) and
drawn by `src/components/SponsorBanners.tsx`:

- **Homepage**: under the scores panel on phones and tablets, and between the
  leaders and the highlights on a desktop. Two instances, one per layout; the
  one that is `display: none` at the current width never loads anything.
- **Homepage sidebars** (desktop only, where the sidebars exist): one banner
  each, so the two show different creatives (`sponsorBannerFor`). Left rail,
  from 1280 px: under the sports links. Right rail, from 1024 px: under the
  scores. Capped at 16rem tall. These are in addition to the block above.
- **`/sports/live`**: between the player and the list of matches, capped at
  13rem tall so the list stays in reach.

The advertiser's snippet put the `.mp4` creatives in `<img>` tags, which most
browsers will not play, so each is a muted, looping, inline `<video>` inside the
link. What the block does and does not do:

- nothing is rendered on the server and nothing is requested from the
  advertiser's host until the slot is within 600px of the viewport; a visitor
  with data saving on gets no banner;
- the slot has no height until a creative has loaded, and a creative that fails
  (an ad blocker, the host being down) is removed: there is never an empty box;
- a video plays only while on screen and the tab is in front, and not at all
  with reduced motion (its first frame is shown, still a link);
- the creatives' sizes are not known in advance: each tile takes its video's
  proportions, strips (2:1 or wider) are stacked and anything else sits side by
  side (`sponsorLayout`);
- links open in a new tab with `rel="sponsored nofollow noopener"`; the block is
  captioned "Sponsored" and "18+ · Gamble responsibly".

Not verified: the real creatives could not be loaded from the build sandbox, so
the layout was checked in a browser with stand-in videos of three shapes
(728×90, 600×500, 360×640) at 390, 768 and 1440 px. Tests:
`sponsor-banners.test.ts`.

### The still banner (second set)

A third creative, a `.jpg`, is its own list (`SPONSOR_INLINE_BANNERS`), so the
placements above show exactly what they showed before. An entry now names a
`video` or an `image`; a still is drawn with an `<img>` in the same marked link
and follows every rule above (nothing until the slot is near the viewport, no
room until it has loaded, removed if it fails, none with data saving). Where:

- **`/sports`** (and its competition pages): after the first competition's
  fixtures, never above the scores. Capped at 13rem tall.
- **`/sports/highlights`**: between the filters and the clips. Capped at 13rem.
- **`/post/<id>`**: under the post and its comments. Capped at 16rem.

Checked in a browser with stand-in images (300×250, 728×90, 160×600) at 390,
768 and 1440 px: one request for the still per page, none on the homepage, no
sideways overflow, and no gap left when the request is blocked. A 300×250 is
drawn 250×208 in the lists and 307×256 on a post; a 728×90 fills the column. A
tall creative (160×600) comes out narrow (55×208) under the 13rem cap: if the
real one is a skyscraper, raise `maxHeight` or move it to a sidebar.

Not verified: the real image, for the same reason as the videos.

## Predictions page and removed integration

`/sports/predictions` and the sports-page link remain available to guests and members, with the shared header/navigation. The page now fetches its own ESPN upcoming-match odds feed, not the scores board. See [ESPN_ODDS_CHECKS.md](ESPN_ODDS_CHECKS.md) for API and filtering details. Odds are not advertised as generated picks, and no sample prices are injected.

The previous external prediction endpoint, authentication headers, response parser, credential lookup, prediction fetch jobs, source reports, branding and setup instructions remain removed. The new odds feed is independent: its failures cannot mark healthy score feeds as partial. Existing provider-neutral manual/sample card and time-formatting code remains available without an automatic model-prediction source.

The obsolete integration script was replaced with regressions covering legacy-key isolation and time formatting. The unused credential entry was removed from `.env.example` and test-server instructions. Private environment files were not modified; any obsolete prediction key in a deployment can be deleted, and any genuine key previously exposed in a tracked example should be revoked with its issuer.


## All-sports endpoint / HTTP 404 audit

See [ESPN_ENDPOINT_AUDIT.md](ESPN_ENDPOINT_AUDIT.md) for the complete 38-route inventory, corrected Premiership/Super Rugby IDs, exact upstream URL/status diagnostics, and the distinction between a missing app route and an upstream ESPN 404. `npm run check:espn -- --sport rugby` filters checks by sport; `npm run --silent check:espn -- --json` produces a machine-readable all-sport report. Null HTTP status means no HTTP response, not 404.


## HTTP 403 access denials

See [ESPN_ACCESS_DENIED.md](ESPN_ACCESS_DENIED.md). The user reports HTTP 403 in both preview and deployment; origin/cause is not proven by status alone. Source reports now include bounded, allowlisted `responseMetadata` on HTTP errors, and the diagnostic counts 403 separately. No headers are spoofed, no access restriction is bypassed, and no successful live-data fix is claimed.
