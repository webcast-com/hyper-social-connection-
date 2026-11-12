# Hyper Sports browser-first ESPN transport

The Sports, NBA and NFL **Hyper** scoreboard pages start with a loading state instead of blocking the page on server-side ESPN requests. The browser queries the configured ESPN Site v2 scoreboards first, using the same catalog and parsers as the server (including the existing NCAA Division I parameters). Requests use no credentials or referrer, a per-request eight-second timeout and up to eight simultaneous requests. A successful empty scoreboard is not a failure. The NBA/NFL pages request only their league.

If browser access fails or returns invalid data, the existing `/api/sports` server feed is requested for the failed leagues, and only those leagues with successful server responses are merged. A league the browser could not reach keeps the server's own explanation (HTTP status and metadata) when it has one. ESPN successes from either route are retained; demo fixtures are not mixed into live scores. When both routes are unavailable the existing clearly marked sample fallback or an error is shown, and a refresh does not replace previously loaded ESPN games with samples. Diagnostics indicate browser/server transport when available. The server fallback deadline scales with the number of competitions it must cover, and a 404 from `/api/sports` itself is reported as a deployment problem rather than an ESPN outage. Scores refresh every 45 seconds when the page is visible.

On a Hyper match page the browser likewise tries the ESPN summary first, then `/api/sports/matches/...`; the League table tries ESPN standings first, then `/api/sports/standings/...`. Existing parsers, validation, cancellation, unknown-value handling and server routes remain in place. Match metadata is now generic and noindex because the server no longer fetches a match before the browser loads. History, odds/insights, the homepage sports widget and standalone ScoreHub still use their existing server-backed paths; this change does not alter the separate NFL–NBA dashboard or its endpoints. The native team and player detail pages are server-backed too — their browser components call only this site's own `/api/sports/teams/...` and `/api/sports/athletes/...` endpoints and never ESPN directly (see [ESPN_TEAM_ATHLETE_DETAILS.md](ESPN_TEAM_ATHLETE_DETAILS.md)).

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
