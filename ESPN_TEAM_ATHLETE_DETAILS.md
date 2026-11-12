# Native team and player detail pages (a separate stack)

Until now a reader could open a **match** from this site
(`/sports/matches/{league}/{eventId}`) but a *team* or a *player* only existed
inside the vendored NFL/NBA single-page app under `/nfl-basketball/…`, which is
basketball and American football only and speaks its own routing. The pasted
vendor layer (`normalizeTeamInfo`, `normalizeRoster`, `normalizeAthlete`,
`teamUrls`, `athleteUrls`) already knew how to ask ESPN for those two entities —
it just had no consumer here, and no route.

This stack builds those two pages natively, for **every competition in
`ESPN_LEAGUES`** (121 entries: soccer, basketball, American football, tennis,
rugby, cricket, hockey…), and makes existing cards **link into them**.

It was built apart on purpose, and stays apart:

| | Team page | Player page |
| --- | --- | --- |
| Parser | `src/lib/espn-team.ts` | `src/lib/espn-athlete.ts` (reuses `espn-team`'s id/URL/portrait helpers) |
| Feed | `src/lib/espn-team-feed.ts` | `src/lib/espn-athlete-feed.ts` |
| Endpoint | `GET /api/sports/teams/{league}/{teamId}` | `GET /api/sports/athletes/{league}/{athleteId}` |
| Route | `/sports/teams/{league}/{teamId}` | `/sports/athletes/{league}/{athleteId}` |
| Component | `SportsTeamDetails` | `SportsAthleteDetails` |
| Asks ESPN for | team info **+** `/schedule` **+** `/roster`, all three settled together | the site endpoint, then the common endpoint only if it must |
| Transport | browser-first, server for whatever the browser could not reach | the same |
| Statuses | `ready \| partial \| unavailable` | `ready \| unavailable` |
| When ESPN is unreachable | empty board, per-part reasons; **no sample squad or fixtures** | empty board; **no sample biography or statistics** |

Nothing in the existing match, standings, leaders, highlights or video-news
stacks reads these modules. The only edits outside the new files are the link
wiring below and two optional id fields on `SportsLeaderRow`.

## Six rules the vendor paste breaks, and what this stack does instead

1. **Headshots are synthesised for every sport.** The vendor does
   `sport === "football" ? "nfl" : "nba"` — a tennis player or a Premier League
   forward gets a CDN path that is not theirs. Here
   `athletePortrait`/`cdnPortraits` synthesise **only** through a frozen map
   (`basketball/nba → nba`, `football/nfl → nfl`); everywhere else the provider's
   own reported photo is used, and failing that initials. The board carries
   `portraitsFromCdn` so the page (and the reader) knows which happened.
2. **No id validation.** Here `validEntityId` (`/^[1-9]\d{0,19}$/`) gates every
   URL and every CDN path, and `parseTeamInfo`/`parseAthlete` **throw** unless
   the payload's own id matches the id that was asked for. A payload about
   Chelsea is never rendered as Arsenal.
3. **Unvalidated `src`/`href`.** Provider images go through the existing
   `safeProviderImage`; outbound links through `safeExternalUrl` (https only, no
   credentials, ≤2048 characters — over-long is *rejected*, not truncated), and
   are rendered `rel="noopener nofollow"` + `target="_blank"`.
4. **`position: … ?? "—"` invents data.** Every optional field is `null`, and
   the component renders its own `—`. Age is never computed from `born`; years
   of experience keep ESPN's own wording.
5. **"Demo data always wins."** Rejected. There is no sample team, no sample
   player, and no bundled fallback board. An `unavailable` board renders an
   honest empty state naming what refused and why.
6. **`throw new EspnRequestError` on total failure.** The feeds never throw for
   a provider failure: they return a board with `sources[]` describing each part
   (`ok`, `part`, `url`, `httpStatus`, `errorKind`, `error`). Only a bad request
   from *this* site throws, and that maps to a 404/400.

Kept from the vendor because it is right: bounded stat groups, tolerance for
`record.items[0] ?? record`, and settling the three team parts together so a
page is one round trip, not three.

## The team page

Three parts, one request each, settled together with `Promise.all` — a refusal
in one never hides the other two, and the board says which one is missing:

- **Identity** — name, crest, colours, record, standing, venue, status,
  external links. `unavailable` ⇒ `team === null`; the page shows "Team details
  unavailable" and the reason.
- **Fixtures & results** — up to 60, split **by the state ESPN reports**
  (`status.type.state`): `post` → Results, newest first; anything else
  (`pre`, `in`, or no reported state) → Upcoming, soonest first. The date is
  never compared with the clock, so a postponed match is not relabelled as a
  result and a fixture with no reported state is not guessed into the past.
  `"-"`, `"--"` and `"—"` are treated as "no score reported", not as zero. Each
  group lists 20 and says how many further reported fixtures it withheld; each
  fixture links to its own match page, and each side links to its own team page.
- **Squad** — read from `roster[]`, `athletes[]`, `team.athletes[]` or
  `team.roster[]`, deduplicated by id (or by name + jersey), capped at 60. Each
  player with a reported id links to their own page.

Sections are sticky pills (Overview / Fixtures & results / Squad) mirroring
`SportsMatchDetails`; Overview shows the next reported fixture and the last
reported result. A footer `<details>` lists every ESPN source URL with its
status, so a page is never mysterious about where its data came from.

## The player page

`https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/athletes/{id}`
first; if that refuses or answers about a different player,
`https://site.web.api.espn.com/apis/common/v3/sports/{sport}/{league}/athletes/{id}`
is tried — sequentially, never both. Some competitions publish a player only
through the common endpoint, so the fallback is part of the contract, not an
error path.

The biography shows only reported facts (position, jersey, age, born, height,
weight, college, nationality, experience, status) and the current team links to
that team's page. Statistics are grouped as ESPN groups them, capped at
`MAX_STAT_GROUPS = 3` × `MAX_STATS_PER_GROUP = 12`, and `statValue` drops values
that are really identifiers — the player's own name or id, or a bare ≥5-digit
number. A category ESPN did not report is absent rather than zero.

## How a page gets its data: browser-first, like a match page

The server feed owns the first paint, the cache and the in-flight guard. Once the
page mounts, `SportsTeamDetails` and `SportsAthleteDetails` load through
`browserTeamBoard` / `browserAthleteBoard` in `src/lib/espn-browser.ts` — the same
transport the scoreboard, match and league-table surfaces already use:

1. **The reader's own browser asks ESPN first.** A team page asks all three parts
   together; a player page asks the site endpoint and, only if it must, the common
   one. When everything answers, this site's endpoint is never called.
2. **Only what failed is asked of the server.** `/api/sports/teams/...` (or
   `/api/sports/athletes/...`) is called once, and only the parts the browser could
   not reach are taken from it. A part ESPN answered in the browser is never
   replaced by a second opinion, and for a part neither route reached the server's
   own explanation is kept when it has one.
3. **Every part records its route.** `transport: 'browser' | 'server'` on each
   source, printed in the diagnostics panel as "Asked by this browser" / "Asked by
   this site's server". The ESPN URL is identical either way, so without the label
   a reader could not tell who answered — and a page that says "not reported"
   should be able to say who was asked.
4. **A broken server route is not an ESPN outage.** A 404/500 from `/api/sports/...`
   itself with nothing from the browser throws `SportsApiError`, and the component
   keeps the data already on screen. With at least one part from the browser, the
   page keeps what ESPN answered and reports the rest as refused.

Both routes build their board through the same `teamBoardOf` / `athleteBoardOf`
assembler in the parser modules, so the browser and the server cannot disagree
about a page's shape or its status. `?refresh=1` is passed through to the server
fallback when the page's own Refresh button is used. See
[ESPN_BROWSER_TRANSPORT.md](ESPN_BROWSER_TRANSPORT.md).

## Bounds and caching

Both feeds: `READY_TTL` 300 s, `FAILURE_TTL` 15 s (so a refused page is not
hammered, but recovers quickly), an 8 s `AbortSignal.timeout` per request, at
most `MAX_PENDING = 8` in-flight boards and `MAX_CACHED = 100` boards (oldest
evicted first). Concurrent renders of the same entity share one in-flight
promise. `?refresh=1` bypasses the cache and is what the page's own Refresh
button sends; a refresh that fails **keeps the data already on screen** rather
than blanking it. Both endpoints answer `Cache-Control: no-store` and are
`force-dynamic`.

Statuses are exactly `ready|partial|unavailable` (team) and `ready|unavailable`
(player) — no fourth value, consistent with every other board in the repo.
Before a client replaces its state it re-checks the payload with
`validTeamBoard`/`validAthleteBoard`: status, `fetchedAt`, the reference ids,
`portraitsFromCdn`, source count, and `validEntityId` on every reported id. A
response that fails the guard is treated as a broken response, not as data.

## Linking: only where ESPN reported a numeric id

A name is never turned into an id. Three existing surfaces gained links, each
gated on an id that ESPN actually reported, each falling back to whatever it did
before:

- `SportsLeadersBoard` — a leader card's player name links to
  `/sports/athletes/{league}/{athleteId}` and its crest to
  `/sports/teams/{league}/{teamId}` when `SportsLeaderRow` carries those ids
  (two new optional fields, `null` for bundled/offline rows), otherwise it keeps
  the old `/nfl-basketball/…` hub routes.
- `SportsLeagueTable` — a standings row's team cell is a `Link` only when
  `validEntityId(row.teamId)`; otherwise it stays plain text.
- `SportsMatchDetails` — a lineup player's name, the lineup heading and the
  compact team name each become links only under the same condition (both
  `Lineup` and `LineupPlayer` now take `league`).

Because every one of these is conditional, a board built from bundled samples —
which report no ids — renders exactly as it did before this change.

## Verified

`npm run typecheck` 0 · `npm run test:sports` **344/344** (300 existing specs
unchanged in behaviour; 44 new across `team-detail`, `athlete-detail`,
`team-athlete-feed`, `team-athlete-browser` and `team-pages`, the last mounting
both components in the jsdom harness) · `npm run build` 0, both routes present as
dynamic · `npx eslint` on every touched file 0 errors (two pre-existing `<img>`
warnings) · live smoke on the dev server: `/api/sports/teams/epl/359` and
`/api/sports/athletes/nba/3945274` → 200 with an honest `unavailable` board and
per-part `network` sources, `/api/sports/teams/not-a-league/359` → 404,
`/api/sports/teams/epl/abc` and `/0359` → 400, both pages → 200, a bad id or
unknown competition → the 404 page, and `/sports`, `/sports/matches/epl/1` and
`/` unchanged at 200.

**Not verified here:** live ESPN team, roster, schedule and athlete payloads —
this sandbox has no egress to `site.api.espn.com`, `site.web.api.espn.com` or
`a.espncdn.com` (see `ESPN_ACCESS_DENIED.md`), so every parser assertion above
runs against fixtures, and which competitions actually publish rosters, common-
endpoint-only players or CDN headshots is unconfirmed. Playwright layout was not
run (no Chromium binary).

Because these pages are browser-first, that gap closes in a real browser: the
preview's own dev log shows the scoreboard transport reaching ESPN directly for
most catalog competitions and asking the server only for the few that failed, so
a reader whose browser can reach ESPN will see these pages filled from ESPN
rather than from the server fallback. What still needs a human eye is which
competitions publish a roster, which players exist only on the common endpoint,
and whether CDN headshots appear only for the NBA and the NFL.
