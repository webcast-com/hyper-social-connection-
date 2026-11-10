# ESPN match details — PR36

## Public experience

Real, numeric-ID ESPN score cards, homepage feed cards and odds cards expose **View match details**. Compact homepage score rows open the same detail route. Guests can view the page, its sections, the public header and navigation without signing in. Sample fixtures and motorsport never acquire a two-team detail link; race-specific presentation remains unchanged.

`/sports/matches/[league]/[eventId]` shows:

- Reported status, kickoff in EAT, venue and available scores.
- Team statistics aligned by team ID, including actual reported zeros.
- Lineups/rosters with reported formation, starters, non-starters and players whose starting status is unknown, each with a reported player photo when ESPN supplies one. A player boxscore may supply the listed roster when a dedicated roster is absent; no starting status, formation or photo is inferred.
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

## Follow-up: lineup player photos (2026-11-10)

`Lineups & rosters` now shows a photo beside each listed player. Nothing else about the section changed: same reported formation, same starter/non-starters/unknown grouping, same `—` for unreported values.

**Where a photo comes from**

1. The provider's own `athlete.headshot.href` (or a roster entry's `headshot.href`), validated by `safeProviderImage` in `src/lib/espn-image.ts` — the rule the standings crest check already used, now shared instead of duplicated: absolute https, at most 2048 characters, no embedded credentials. `javascript:`, `data:`, protocol-relative and credential-bearing values are discarded.
2. Otherwise, for **NBA and NFL only**, `https://a.espncdn.com/i/headshots/{nba|nfl}/players/full/{id}.png` from a numeric athlete ID — the same two boards and the same CDN layout the homepage leaders board (`espn-leaders.ts`) and Discover top scorers (`sports-top-scorers.ts`) already use.
3. Otherwise no photo.

No other competition gets a synthesized URL. The CDN folder is not derivable from the sport, and ESPN athlete IDs are global across sports, so a guessed folder can render **a different athlete's face** rather than a 404. Soccer, MLB, NHL, WNBA, NCAA, rugby and the rest therefore show the provider's href or initials. A missing athlete ID is never used as a path segment either: `MatchPlayer.id` falls back to the player's name when ESPN omits it, and a name is not a CDN file.

**Rendering** keeps the portrait ladder used elsewhere in the app: photo, then initials. A file ESPN does not serve (rookies, off-season, most soccer squads) removes the image and shows initials in the same fixed 32px slot, so rows stay aligned and no player is hidden. The image is decorative (`alt=""`) because the player's name is the adjacent text. Player-stat tables are unchanged and remain text-only.

### Verification (this change)

- `npm run typecheck` — passed.
- `npm run test:sports` — **262 passed** (13 in `match.test.ts`). Three new cases: the reported href passing through with the NBA CDN fallback for a numeric ID; unsafe, ID-less and out-of-scope photo sources staying `null`; and the NFL summary building NFL URLs while **every** other catalog competition builds none.
- `npm run build` — passed, including the standalone dashboard build and both dynamic match routes.
- Changed-file ESLint — passed, with the repository's existing `@next/next/no-img-element` warning only. `next/image` is deliberately not used for provider images: `next.config.ts` declares no `images.remotePatterns`, so the optimizer would reject ESPN hosts, and it would add a proxy hop for files ESPN already serves.
- **Not run here:** `npm run test:sports-layout`. Chromium is not installed in this sandbox and `cdn.playwright.dev` is outside its egress allowlist. The existing 320/768/1440px lineup layout tests do render the new markup, so they should be run before merge; the review fixture's football starter now carries one external photo, which degrades to initials where the CDN is unreachable without changing the row's size.
- **Not verifiable here:** live ESPN responses. This sandbox has no ESPN egress (`curl https://a.espncdn.com/…` and `site.api.espn.com` both fail with `SSL_ERROR_SYSCALL`), so whether a given competition's summary actually carries `athlete.headshot.href`, and whether a synthesized NBA/NFL file exists for a particular ID, still needs a deployment check. Every assertion above uses controlled fixtures, not a live provider audit.

After deploying, open one real NBA or NFL match and one soccer match, expand **Lineups & rosters**, and confirm photos appear where ESPN reports them and initials appear elsewhere — with no missing-player rows and no horizontal overflow at 320px.
