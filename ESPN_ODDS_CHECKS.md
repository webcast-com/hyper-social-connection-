# ESPN upcoming-match odds integration

`/sports/predictions` renders upcoming ESPN fixtures with reported bookmaker odds. It is not a model-prediction service. The removed RapidAPI integration has not been restored, and these ESPN requests require no API key.

## Adaptation of the supplied handler

The supplied `shared/espnOdds.ts` was not included in the repository. Its catalog, `dayStamp` and `mapOdds` helpers are implemented in `src/lib/espn-odds.ts`, using the existing trusted ESPN competition paths. Server-only fetching/cache logic lives in `src/lib/espn-odds-feed.ts`. The async page fetches the initial board server-side and gets the current viewer using the existing viewer/authentication boundary.

- Default: the ten primary leagues (major European football/UCL, NBA, NFL, MLB, NHL).
- Explicit sport filters include secondary competitions: `football` (soccer), `basketball`, `american-football`, `baseball`, `ice-hockey`, `rugby`.
- The configured head-to-head odds catalog has 37 leagues. F1 remains on the scores page, not in a two-team odds UI. Configuration does not imply ESPN offers betting markets for every league.
- At most 20 simultaneous requests per query, ten seconds per request, 25 seconds total search budget. Failed leagues are isolated with `Promise.allSettled`. Incomplete searches carry `truncated: true` and do not claim complete coverage.
- Today uses the provider-default scoreboard URL without a date query. Later offsets use `?dates=YYYYMMDD&limit=100` (UTC date stamps). `days` controls how many date queries to attempt, not a strict cutoff on a provider's default schedule, which can cover a week or other period.
- Only valid future kickoffs, pre-game/noncompleted events, named home/away teams, and at least a home/away money-line price or positive total qualify. Event IDs are deduplicated globally across leagues and days. Per-league counts span all queried days and stop further requests once satisfied.
- Results are sorted by kickoff and capped at 48. First six have `is_premium: false`; later matches have `true`. **These are metadata only:** all returned matches are visible, with no payment or subscription gate implemented.
- American money-line prices are converted to decimal; explicit decimal fields and nested close/open odds are supported. Legacy draw odds are supported. A card uses one usable bookmaker row, never blends prices from different providers, and omits missing markets rather than inventing them. Spreads are not attributed to an unsupported home/away favorite.
- A 45-second in-process cache stores up to 32 normalized queries. Identical in-flight requests share work, including refreshes; at most eight distinct queries can run per process. Cache scope is per process, not a distributed rate limiter.

## API

`GET /api/sports/predictions` uses defaults. `POST` accepts filters:

```json
{ "sports": ["football"], "perLeague": 2, "days": 3 }
```

`perLeague` defaults to zero (no per-league cap); positive values are floored and capped at 12. `days` defaults to one and is clamped to 1–10 only when a positive per-league cap is set; otherwise only the default scoreboard is requested. Empty `sports` selects primary leagues. Unsupported sports/non-array filters/nonfinite numeric parameters and malformed JSON return 400. Unexpected errors/busy queries return a generic 503. The API always uses `Cache-Control: no-store`; add `?refresh=1` to bypass the in-process result cache.

A successful response has `matches`, `sources`, `fetchedAt`, `truncated`, and `status`:

- `ready`: qualifying matches, all attempted feeds responded successfully.
- `empty`: every attempted feed returned a valid scoreboard, no qualifying odds matches.
- `partial`: at least one valid feed, plus failures or an incomplete search.
- `unavailable`: no attempted feed succeeded. No sample fixtures or prices are substituted.

Match fields include `id`, normalized `sport`, `league`, ESPN `path`, team names/HTTPS logos, ISO `kickoff`, optional `venue`, decimal `odds.home/away/draw`, numeric `odds.over_under/spread`, optional `odds.provider`, and `is_premium`.

## UI and authentication

The sport, per-league and date-query controls apply on **Refresh matches**, using a relative POST to the app API; the browser never fetches ESPN directly. Inputs/submit are disabled during loading; failures retain existing cards and show a retryable error. No background odds polling is added. Timestamps display in Nairobi time and prices are explicitly labeled decimal odds, not guaranteed outcomes. The last-check timestamp and expandable source details show freshness/coverage.

Anonymous users retain the site header, tabs, filters, matches and back-to-scores navigation, with login links for sharing/polls. Signed-in users can add commentary and use the existing authenticated `createPost` action. Football polls include Draw; other sports do not gain a fictional football Draw option. Shared text includes reported markets/provider and does not invent a recommended pick. Real post persistence/authentication still requires an online database.

## Validation and limitations

```sh
npm run typecheck
npm run test:sports
npm run test:sports-layout
```

Validated: **72 unit/API/transport tests + 46 sports/homepage browser fixture tests (118 total)**, changed-file ESLint (two standard unoptimized-logo `<img>` warnings, no errors), and whitespace checks. Browser fixtures exercise the actual async route/component with the server odds/viewer boundaries mocked, at 320/768/1440px, plus filtering, retry, guest access, free/premium flags and share/poll form data. They do not prove upstream schema availability, database persistence or deployment behavior.

A running Next server in database-offline mode returned HTTP 400 for invalid filters and HTTP 200 for the actual API/page. The API reported `unavailable`, zero matches and ten source failures (`ECONNRESET`), and the page rendered the honest outage message/header. The full Next browser hydration/refresh smoke was inconclusive; the independent browser-fixture refresh tests passed. The temporary server was stopped.

This sandbox does not allow outbound access to `site.api.espn.com`. No live bookmaker prices were verified here. Test from the deployment network, with normal TLS verification, before considering upstream access/current schema confirmed. A valid empty schedule is different from an outage. API source reports make that distinction; do not add sample prices to hide a failure.


## All-sports endpoint / HTTP 404 audit

See [ESPN_ENDPOINT_AUDIT.md](ESPN_ENDPOINT_AUDIT.md) for the complete 38-route inventory, corrected Premiership/Super Rugby IDs, exact upstream URL/status diagnostics, and the distinction between a missing app route and an upstream ESPN 404. `npm run check:espn -- --sport rugby` filters checks by sport; `npm run --silent check:espn -- --json` produces a machine-readable all-sport report. Null HTTP status means no HTTP response, not 404.


## HTTP 403 access denials

See [ESPN_ACCESS_DENIED.md](ESPN_ACCESS_DENIED.md). The user reports HTTP 403 in both preview and deployment; origin/cause is not proven by status alone. Source reports now include bounded, allowlisted `responseMetadata` on HTTP errors, and the diagnostic counts 403 separately. No headers are spoofed, no access restriction is bypassed, and no successful live-data fix is claimed.
