# Hyper Sports browser-first ESPN transport

The Sports, NBA and NFL **Hyper** scoreboard pages start with a loading state instead of blocking the page on server-side ESPN requests. The browser queries the configured ESPN Site v2 scoreboards first, using the same catalog and parsers as the server (including the existing NCAA Division I parameters). Requests use no credentials or referrer, a per-request eight-second timeout and up to eight simultaneous requests. A successful empty scoreboard is not a failure. The NBA/NFL pages request only their league.

If browser access fails or returns invalid data, the existing `/api/sports` server feed is requested for the failed leagues, and only those leagues with successful server responses are merged. A league the browser could not reach keeps the server's own explanation (HTTP status and metadata) when it has one. ESPN successes from either route are retained; demo fixtures are not mixed into live scores. When both routes are unavailable the existing clearly marked sample fallback or an error is shown, and a refresh does not replace previously loaded ESPN games with samples. Diagnostics indicate browser/server transport when available. The server fallback deadline scales with the number of competitions it must cover, and a 404 from `/api/sports` itself is reported as a deployment problem rather than an ESPN outage. Scores refresh every 45 seconds when the page is visible.

On a Hyper match page the browser likewise tries the ESPN summary first, then `/api/sports/matches/...`; the League table tries ESPN standings first, then `/api/sports/standings/...`. Existing parsers, validation, cancellation, unknown-value handling and server routes remain in place. Match metadata is now generic and noindex because the server no longer fetches a match before the browser loads. History, odds/insights, the homepage sports widget and standalone ScoreHub still use their existing server-backed paths; this change does not alter the separate NFL–NBA dashboard or its endpoints. The native team and player detail pages are browser-first too, on the same rule and with the same fallbacks — see [Team and player detail pages](#team-and-player-detail-pages) below and [ESPN_TEAM_ATHLETE_DETAILS.md](ESPN_TEAM_ATHLETE_DETAILS.md).

Browser success depends on the user's network, ESPN availability and CORS; a successful mocked test or accessible browser in one location does not prove production availability for all visitors. A blocked browser and blocked server cannot be worked around by this fallback.

Run `npm run test:sports` and `npm run typecheck`. The browser transport unit tests mock direct and fallback responses, partial success, malformed data and cancellation. Live direct access must be checked in the user's browser after deployment.

## Football coverage

The Sports catalog includes additional country leagues, including Kenya, Uganda,
Nigeria and Ghana, and competitions such as AFCON, AFCON qualifying, UEFA
women's Champions League and Copa America. Country filters use the domestic
country; continental and international tournaments are grouped as
multi-country. Identifiers are drawn from ESPN's league pages (for example,
[Kenya](https://www.espn.com/soccer/league/_/name/ken.1) and
[Uganda](https://www.espn.com/soccer/league/_/name/uga.1)) and the
[community ESPN soccer endpoint catalog](https://github.com/0xShakhawat/ESPN-API/blob/main/docs/sports/soccer.md).
An identifier or ESPN web page does not guarantee that the Site API supplies
fixtures, summaries or standings for every season. Empty schedules and source
failures remain distinct; the configured list is not comprehensive.

Expanded competitions are available to Sports scoreboards and match/standings
routes but do not enlarge the existing odds feed. To keep a slow expanded
catalog from blocking initial scores for multiple timeout waves, the browser
publishes partial results as they arrive and uses an overall direct request
budget that scales with the catalog size. Unfinished leagues can still use the
server fallback, which is asked only for the competitions that are missing. The
selected sport, region, country and competition are requested first, while the
remaining competitions stay in the queue. Changing these selections restarts
the request, and successful partial results replace only the leagues that have
finished, retaining other prior scores until the refresh completes. The server
fallback keeps bounded concurrency; its browser deadline scales with the number
of catalog batches. External ESPN access and individual feeds must be verified
in the actual deployment/browser environment.

Further additions include Zambia, Zimbabwe, Switzerland, Cyprus, Costa Rica,
Guatemala, Honduras, El Salvador, Jamaica, Bolivia, Paraguay and Venezuela,
Canada's Northern Super League, national cups, women's competitions, and World
Cup qualifiers by confederation. ESPN league pages also identify
[Zambia](https://www.espn.com/soccer/league/_/name/zam.1),
[Zimbabwe](https://www.espn.com/soccer/league/_/name/zim.1), and
[Costa Rica](https://www.espn.com/soccer/league/_/name/crc.1).

## Unfiltered boards, filter behaviour and standings

With the default filters — every sport, every region, every country and every
status — the Sports board requests the whole catalog and shows live, upcoming and
final matches together. Nothing is hidden until the viewer changes a filter:
sport, region/country, competition, status, date or search narrow the same list,
and `Reset filters` returns to the complete board. Status filters apply to the
loaded fixtures only; they do not request a different schedule.

Two ordering rules keep the unfiltered board usable while the catalog is still
loading. When a filter is active, the matching competitions are requested first
and the rest of the catalog stays queued. When no filter is active, the
competitions that report fixtures most often (`SPORTS_CORE_LEAGUES`) are
requested first; the set of competitions is unchanged, so the unfiltered board
still covers every configured competition. Completed leagues render as they
arrive, so scores appear before the last feeds answer.

The overall direct budget scales with the requested catalog instead of a fixed
15 seconds. Once the budget is reached, requests already in flight are allowed to
finish and no new ones start; competitions that were never started are reported
as timeouts and re-requested from the server. The server fallback is asked only
for the missing competitions through `?leagues=slug,slug`, which keeps the
fallback bounded as the catalog grows. A transient ESPN response (429 or 5xx) is
retried once inside the same per-request deadline; an unreachable ESPN fails over
to the server immediately instead of waiting.

League standings stay on the match page and always follow the competition of the
match that was opened from the filtered board, together with the season ESPN
reported for that match. No fixed league table is substituted, and the section
states which competition's table is shown.

## Team and player detail pages

`/sports/teams/{league}/{teamId}` and `/sports/athletes/{league}/{athleteId}` follow
the same rule as a match page, through `browserTeamBoard` and `browserAthleteBoard`
in `espn-browser.ts`:

- **A team page** asks ESPN for its three parts together — team info, `/schedule`
  and `/roster` — with the shared per-request deadline, retry-on-transient and
  cancellation behaviour. When all three answer, this site's endpoint is never
  called. When any part fails, `/api/sports/teams/{league}/{teamId}` is asked once
  and only the failed parts are taken from it: a part ESPN answered in the browser
  is never replaced by a second opinion. For a part neither route reached, the
  server's own explanation is kept when it has one, exactly as the scoreboard
  transport keeps the server's explanation per competition.
- **A player page** asks the site endpoint first and the common v3 endpoint only if
  it must, then `/api/sports/athletes/{league}/{athleteId}` when neither answered.
  A server board is accepted only if it passes `validAthleteBoard` for the same
  reference, so a payload about another player is dropped rather than rendered.
- `?refresh=1` is passed through to the server fallback when the page's own Refresh
  button is used, so a manual refresh still bypasses the server cache.
- Every part carries `transport: 'browser' | 'server'`, and both pages' diagnostics
  panel prints it ("Asked by this browser" / "Asked by this site's server"). The
  ESPN URL is identical for both routes, so without the label a reader could not
  tell which one answered, and a page that says "not reported" should be able to
  say who was asked.
- A broken server route (a 404/500 from `/api/sports/...` itself) with nothing from
  the browser is thrown as `SportsApiError` — a deployment problem, not an ESPN
  outage — and the component keeps the data already on screen. With at least one
  part from the browser, the same broken route is not thrown: the page keeps what
  ESPN answered and reports the rest as refused.
- Cancellation is never reported as an unavailable board, and an already-aborted
  request runs no server fallback at all.

The server feed (`espn-team-feed.ts`, `espn-athlete-feed.ts`) is unchanged and still
owns the cache, the in-flight guard and the server-rendered first paint; the browser
transport only changes what happens after the page mounts. Both routes build their
board through the same `teamBoardOf` / `athleteBoardOf` assembler in the parser
modules, so the two cannot disagree about a page's shape or its status.
