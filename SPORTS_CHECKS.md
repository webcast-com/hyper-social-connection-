# ESPN sports coverage

Scores and fixtures now use **ESPN only**, with **38 configured competitions across seven sports**. Provider IDs and regions live in `src/lib/sports-catalog.ts`. TheSportsDB requests, parsing, provider types and competition catalog have been removed.

## Configured coverage

- **Europe:** major football leagues, EFL Championship, Eredivisie, Primeira Liga, Scottish Premiership, Turkish Super Lig, UEFA competitions, Women's Super League and Premiership Rugby.
- **Africa:** CAF Champions League, CAF Confederation Cup, South African Premiership and African World Cup Qualifying.
- **Americas:** MLS, Liga MX, Brazilian Serie A, Argentine Primera Division, Copa Libertadores, NWSL, NBA, WNBA, men's/women's NCAA basketball, NFL, MLB and NHL.
- **Asia:** J1 League, Saudi Pro League and AFC Champions League Elite.
- **Oceania:** A-League Men and Super Rugby Pacific.
- **International:** Formula 1.

Coverage means a configured request, not guaranteed fixtures today or independently verified current endpoint availability. Regions describe competition home regions, not necessarily event venues. IPL/cricket was supplied only by the removed provider and is no longer advertised; no unverified replacement endpoint has been added. The predictions page remains available, but no prediction provider is connected.

## Request path and reliability

- Pages, homepage widgets and `/api/sports` share `getSportsBoard`, which fetches ESPN scoreboards through `src/lib/espn-client.ts`. Browser requests use the relative app API; ESPN requests are server-side, avoiding browser CORS.
- Scoreboard requests use HTTPS/JSON headers and no-store fetches. Fan-out is capped at 12 simultaneous jobs. The 45-second in-process cache and shared in-flight requests remain.
- Temporary HTTP 429/500/502/503/504 responses and connection failures get at most one retry. Both attempts share one four-second deadline. Retry-After is respected; a wait beyond the deadline fails instead of retrying early. Unsupported/unauthorized feeds and malformed JSON/schema responses are not retried.
- ESPN event IDs preserve distinct same-day doubleheaders and race sessions; cross-provider priority/merge rules are no longer needed. Failures are isolated per competition. Source reports identify the ESPN competition and request error. A successful empty scoreboard stays empty; it is not replaced with fabricated events. If every ESPN scoreboard fails, the existing clearly labeled sample board remains. Sample events use only competitions in the ESPN catalog and never count as live. Predictions remain empty, including on sample boards.
- **Refresh scores** calls `/api/sports?refresh=1`, bypasses the board cache and receives `Cache-Control: no-store`. Normal API requests retain short response caching. Loading/duplicate-request protection and retryable HTTP/invalid-response errors are tested. Failed refresh responses retain the previous board; automatic 45-second polling and hidden-tab checks remain.

## Scoreboard normalization

`src/lib/espn.ts` normalizes home/away metadata, numeric/string/object scores, live/upcoming/completed states, event-level status, logo arrays and multiple competitions. Invalid dates/unnamed teams are skipped. Missing or invalid `events` arrays are source failures, not successful empty schedules. Unknown scores remain unknown in cards and shares.

F1 uses race titles and reported athlete positions rather than invented Home/Away teams. Same-day sessions have separate IDs and survive aggregation. Race titles and every reported driver are searchable; competition cards, homepage summaries, shares and polls are race-aware. Upcoming races without a line-up remain visible without invented drivers.

## Responsive presentation

- Sport, status, region, competition and team/league search filters combine. Changing sport/region resets incompatible competition selections. All configured competitions remain discoverable, including those without fixtures.
- Phone sport chips scroll horizontally; filters use two columns. On the prior 320px running-page review, this moved the first sample competition card from approximately 988px down to 700px. The browser fixture asserts that cards begin within the first 700px of a 900px viewport.
- Mobile homepage summaries show two distinct competitions near the top, sharing presentation/data with the desktop rail's three-competition summary.
- Team names get their own row below logos and the central score. Three-digit basketball scores, long names/status labels and poll inputs fit narrow cards. Comment/Poll/Share controls have at least 44px height.
- Sample fixtures are labeled consistently across summaries and event cards. Unrelated predictions are not attached by array index.
- Shared header/navigation and safe-area-aware page padding remain available to signed-in and signed-out visitors.

## Verification

```sh
npm ci
npm run test:sports
npm run test:sports-layout
npm run typecheck
```

Install compatible Playwright Chromium first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed browser.

- **35 data/API/transport tests:** ESPN-only catalog/request coverage, bounded concurrency, caching/coalescing, outages, empty schedules, three-digit ESPN scores, samples, normalization, F1 sessions, retries, Retry-After, shared deadlines and API cache headers. Request assertions reject non-ESPN score hosts and assert exactly one request per configured scoreboard on success even when a legacy prediction credential is configured. Prediction arrays stay empty on both real and sample boards; kickoff formatting remains provider-independent.
- **34 browser tests:** filters, provider labels, removed competition controls, empty/sample/partial states, dark mode, competition/homepage sizing at 320/375/768/1024/1440px, race positions/polls, unknown scores, manual refresh/retry/loading and automatic score polling. The preserved predictions route is checked at 320/768/1440px for its empty state and for the absence of prediction-provider polling.
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

Latest ESPN-only verification: **35 data/API/transport + 34 sports/homepage browser tests passed (69 total)**. TypeScript and diff whitespace checks passed. Screenshots/traces live under ignored `test-results/`, not in Git.


## Predictions page without an external integration

`/sports/predictions` and the sports-page link to it are retained. The route no longer fetches the sports board on render or polls `/api/sports`; it renders a provider-independent empty state with a back-to-scores link. No live picks or odds are claimed and no sample predictions are injected into API/homepage fallback data.

The external prediction endpoint, authentication headers, response parser, credential lookup, prediction fetch jobs, source reports, branding and setup instructions have been removed. Consequently, a prediction-service error cannot mark healthy ESPN feeds as partial. Existing provider-neutral card/time-formatting code remains available for explicitly supplied data, without an automatic data source.

The obsolete provider integration script was replaced with regressions covering legacy-key isolation and time formatting. The unused credential entry was removed from `.env.example` and test-server instructions. Private environment files were not modified; any obsolete prediction key in a deployment can be deleted, and any genuine key previously exposed in a tracked example should be revoked with its issuer.
