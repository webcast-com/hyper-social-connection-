# ESPN match details — PR36

## Public experience

Real, numeric-ID ESPN score cards, homepage feed cards and odds cards expose **View match details**. Compact homepage score rows open the same detail route. Guests can view the page, its sections, the public header and navigation without signing in. Sample fixtures and motorsport never acquire a two-team detail link; race-specific presentation remains unchanged.

`/sports/matches/[league]/[eventId]` shows:

- Reported status, kickoff in EAT, venue and available scores.
- Team statistics aligned by team ID, including actual reported zeros.
- Lineups/rosters with reported formation, starters, non-starters and players whose starting status is unknown. A player boxscore may supply the listed roster when a dedicated roster is absent; no starting status or formation is inferred.
- Player-stat tables with the provider's column labels and keyboard-focusable internal horizontal scrolling.
- Key events, play-by-play, scoring plays or commentary, depending on the first available provider feed. Updates retain provider order, deduplicate IDs, include reported clocks/periods/teams/participants and are bounded at 200. These are not guaranteed to include every play.

Missing values display `—`, not zero. Missing sections and missing team rosters are explicitly labeled. There is no sample fallback, invented lineup, inferred event or generated statistic. Data availability varies by competition and match status.

## Fetching and safety

- Public GET `/api/sports/matches/[league]/[eventId]`; `?refresh=1` requests a fresh summary.
- SSR loads only the opened match, using the catalog's fixed Site v2 summary URL: `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/summary?event={id}`.
- Competition allowlist and positive decimal IDs (up to 20 digits) are validated before any request. Unknown competitions and motorsport receive 404; malformed API IDs receive 400. Invalid page references and upstream HTTP 404 render the normal not-found page.
- Summary header IDs and two named, distinct teams must match the requested event. Core `$ref` URLs are never followed. Roster/boxscore arrays are bounded, and malformed payloads are not confused with valid empty sections.
- Uses the user-confirmed minimal header configuration: app-supplied `Accept: application/json` only. No custom User-Agent, cookies, browser spoofing, proxy, alternate hostname or TLS changes.
- Eight-second deadline, no retries (including 403); at most eight distinct in-flight summaries per process, coalesced same-match requests and a 100-entry in-memory cache. Successful summaries cache for 30 seconds; failures for 10 seconds. Cache/concurrency limits are per instance, not a distributed rate limiter.
- Cards disable prefetch; rendering a scoreboard does not fan out into summary requests for every fixture. Manual refresh only, no match-details background polling.
- Refresh disables duplicate clicks, aborts on unmount and retains previously loaded details after transport, malformed-response or upstream failures. A keyed client view resets state when navigating between matches.
- JSON API responses use `Cache-Control: no-store`. Valid upstream outages return a typed unavailable board; unexpected/busy requests return 503. Source diagnostics preserve real HTTP/no-HTTP distinctions and only the existing safe header allowlist; neither cookies nor provider body snippets are exposed.

## Verification

- `npm run typecheck` — passed.
- `npm run test:sports` — **89 passed**, including parser, input/URL validation, anonymous API, minimal-header, cache/coalescing, timeout, eight-request bound, no-retry, metadata privacy, malformed-body privacy and real-link regressions.
- `npm run test:sports-layout` — **56 passed** in Chromium, including actual async match-page composition with mocked provider/viewer boundaries. Match sections fit at 320, 768 and 1440 pixels; dark/empty states, basketball play-by-play, reported formation/unknown starting status, partial rosters, refresh/loading/error retention, guest navigation and score/feed/odds links are covered. Existing sports/homepage tests still pass.
- `npm run build` — passed, including both dynamic match routes.
- Changed-file ESLint and whitespace checks — passed, with existing image-optimization warnings only.

All automated ESPN responses are controlled fixtures, not a live provider audit. The user confirmed the preceding header change restored ESPN responses in their tested environment; live summary coverage still needs deployment verification because this sandbox cannot reach ESPN. After the PR preview deploys, open one real match from scores or odds, check the available sections and refresh once. Missing ESPN sections should remain explicit empty states.

PR36 remains open pending review; adding this feature does not authorize a merge.
