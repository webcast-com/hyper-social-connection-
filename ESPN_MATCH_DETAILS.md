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

## Follow-up: the player page's colours (2026-11)

The match page now uses the same palette as the player page
(`/sports/athletes/<league>/<id>`): a near-black violet page, glass panels, and
fuchsia where it used the site's blue. Colour only: no element was added, moved
or resized, and nothing about what is asked of ESPN changed.

- **The page's own markup** (`SportsMatchDetails.tsx`, and the stored-highlights
  block in the route) says its colours in the same classes the player page uses:
  `text-fuchsia-300` links, `bg-white/[0.04]` tiles with a `border-white/[0.07]`
  hairline, a `bg-fuchsia-200` pill for the open section.
- **`src/app/sports/theme-player.css`**, imported by the route as `player.css`
  is, holds the rest: the page background (the player page's, under
  `body:has(.theme-player)`), the lit panel behind the heading
  (`.theme-player-hero`, the player card's gradients), and a palette for the
  parts shared with other pages. The league table, form and head-to-head, and
  predictions are written in blue and slate, so the Tailwind colour variables
  they read are remapped under `.theme-player`; the components themselves are
  not edited and stay blue everywhere else.
- **Statistic bars** are pink for the first team and violet for the second
  (they were blue and purple); the sentence above the table says so.
- **Not changed here:** the top bar (it stayed blue on the player page too). It was recoloured in the follow-up at the end of this file.

### Verification (this change)

`npm run test:sports` (695), `npm run test:seo` (123),
`tests/sports/layout.spec.ts` (51 pass; `:537` and `:551` fail as before).
Looked at in a browser at 1440 and 390 px against a local server with the
match, standings and player feeds answered from the test fixtures: every
section tab, and no blue left inside the page by computed colour. The test
builds that bundle the route (`tests/seo/metadata.test.ts`,
`tests/sports/home-layout.spec.ts`) now load a stylesheet as empty;
`home-layout.spec.ts` still cannot be built here for an older, unrelated reason.
Not verified here: real ESPN data and the live site.

## Follow-up: the team page and the single highlight page (2026-11)

The same palette now covers the team page (`/sports/teams/<league>/<id>`) and
the page of one highlight (`/sports/highlights/<title>-<id>`). Same method, and
colour only again:

- `SportsTeamDetails.tsx` and the highlight route's own markup use the player
  page's classes; the highlight's card is the lit panel (`.theme-player-hero`).
- Both routes import `src/app/sports/theme-player.css` (the match page's
  stylesheet, moved up a level and renamed from `match.css` so three routes can
  share it) and carry `.theme-player` on their root. The video player inside
  the highlight page (`LinkMediaPlayer`) is recoloured by the variable remap,
  not edited.
- The highlights list (`/sports/highlights`) keeps its own violet theme.

Checks: `npm run test:sports` (695), `npm run test:seo` (123),
`npm run test:theme` (2), `tests/sports/layout.spec.ts` (51 pass; `:537` and
`:551` fail as before). Looked at in a browser at 1440 and 390 px against a
local server: the team page with a fixture board (all three sections), the
highlight page with two scratch stored clips (removed afterwards), and no blue
left inside either page by computed colour. Not verified here: real ESPN data
and the live site.

## Follow-up: the top bar and the sports board (2026-11)

Colours only; no element was added, moved or resized, and nothing asked of ESPN
changed.

- **Top bar and phone bottom bar.** The colour remap in
  `src/app/sports/theme-player.css` moved from `.theme-player` to
  `body:has(.theme-player), body:has(.pl-card)`, so the bars, the profile menu
  and dialogs take the palette while a palette page is open: the player, match,
  team and single highlight pages and `/sports`. Every other page keeps the
  site's blue, and the palette drops when an in-app link leaves a palette page.
  `Navbar.tsx` and `ProfileMenu.tsx` are not edited. The filled buttons
  ("Sign up", back to top) run fuchsia to violet on those pages.
- **Sports board (`/sports`).** `SportsBoard.tsx` carries `theme-player` on its
  root and the route imports the stylesheet. The score hero
  (`SportsScoreHero.tsx`, `SportsHeroFeatured.tsx`) had its navy surfaces and
  green accents written as fixed colours, so those were remapped by hand to
  violet-black and fuchsia; red "live" marks are kept. The player route now
  imports the stylesheet too (after `player.css`).
- **Left as it was:** the "hyper" wordmark in the top bar (an image, still
  blue-violet); the highlights list `/sports/highlights` (plum theme); the
  `.score-hero*` rules in `globals.css`.
- A browser without `:has()` keeps the blue bars and the blue board.

Checks: `tsc` clean, `test:sports` 695, `test:seo` 123, `test:theme` 2,
`layout.spec.ts` 51 pass (`:537`, `:551` fail as before). Looked at in a browser
at 1440 and 390 px against a local server: `/sports` with sample fixtures and
with an intercepted live scoreboard (no blue left in the bar, the board or the
bottom bar by computed colour; page heights unchanged), and the player, match,
team and highlight pages signed in and signed out. `/discover` keeps blue, also
when reached by an in-app link from `/sports`. Not verified here: real ESPN
data and the live site; `test:mobile-navigation` was not re-run (the bar's
markup is untouched).
