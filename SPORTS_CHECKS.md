# Worldwide sports coverage

The sports board now configures **39 distinct competitions across eight sports**, up from 10 competitions across four sports. Provider IDs and regional metadata live in `src/lib/sports-catalog.ts`.

## Configured coverage

- **Europe:** major football leagues plus the EFL Championship, Eredivisie, Primeira Liga, Scottish Premiership, Turkish Super Lig, Europa League, Conference League, Women's Super League, and Premiership Rugby.
- **Africa:** CAF Champions League, CAF Confederation Cup, South African Premiership, and African World Cup Qualifying.
- **Americas:** MLS, Liga MX, Brazilian Serie A, Argentine Primera Division, Copa Libertadores, NWSL, NBA, WNBA, men's and women's NCAA basketball, NFL, MLB, and NHL.
- **Asia:** J1 League, Saudi Pro League, AFC Champions League Elite, and Indian Premier League cricket.
- **Oceania:** A-League Men and Super Rugby Pacific.
- **International:** Formula 1.

Coverage means a configured provider request, not guaranteed fixtures today. Regional filters describe a competition's home region, not necessarily each event's venue. TheSportsDB supplies IPL fixtures/results; the board preserves its result text alongside numeric scores.

## Browsing and reliability

- Sport, status, region, competition, and team/league search filters combine. Changing sport or region resets an incompatible competition selection. Reset filters clears everything.
- All configured competitions remain discoverable in the selector, including those without reported fixtures.
- The 45-second in-process cache remains. Concurrent page, widget, and refresh requests share in-progress work. Provider fan-out is capped at 12 simultaneous jobs, each scoreboard request times out after four seconds, and failures remain isolated per source.
- Successful empty scoreboards are shown as empty, not replaced by sample events. Total provider failure uses a clearly labeled sample board. Sample cards are labeled individually and are excluded from the page's live count.

## Verification

```sh
npm run test:sports
npm run test:sports-layout
npm run typecheck
```

Install Playwright Chromium with `npx playwright install chromium` before running the browser suite, or use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for an existing compatible browser.

- Thirty-two data/API/transport tests cover catalog integrity, combined filters, request coverage, concurrency bounds, in-flight coalescing, caching, partial outages, empty scoreboards, cricket results, total failure, ESPN parsing, and F1 sessions.
- Twenty-nine browser tests exercise filters, empty/sample/partial states, dark mode, competition card sizes, the actual homepage composition at 320/375/768/1024/1440px, F1 driver positions/polls, and unknown scores.
- Tests use deterministic provider payloads and real components; they do **not** verify current upstream schedules or endpoint availability. This sandbox cannot reach the live ESPN/TheSportsDB hosts. Verify provider responses from the deployment environment, including off-season empty feeds and any provider access/rate limits.


## PR layout review: competitions and mobile homepage

Reviewed the running Next.js homepage in offline/guest mode, not just isolated sports cards. Also added a browser fixture that runs the real `Home` component, Navbar, FeedTabs, Stories, CreatePost, prediction cards and match cards with controlled server data, actions and router boundaries. This exercises the signed-in layout without bypassing real authentication in the app; login, RSC serialization and database mutations are outside this fixture's scope.

### Findings and fixes

- At 320px, vertically wrapped sport chips and four stacked filter controls put the first sample competition card about **988px** down the sports page. Sport chips now scroll horizontally on phones, and the filter controls use two columns. The same running-page sample card starts at about **700px**, inside a 900px-high viewport. Wider screens retain wrapped chips and four filter columns.
- The homepage sports widget previously existed only in the desktop rail. A shared presentation component now also shows **two distinct competitions** near the top of the mobile quick-access panel (up to three in the desktop rail), without another provider fetch.
- Competition cards now give names their own two-column row below the logos/central score, so names and three-digit cricket/basketball scores do not compete for the same narrow horizontal space. Long status text wraps rather than consuming the team-name area.
- Homepage match cards use stacked team badges on phones, wrap long league/status text, preserve logo dimensions, and use at least 44px-high Comment/Poll/Share buttons. Poll inputs and the homepage feed columns can shrink within the available width. The feed-tab labels stay on one line at 320px.
- Fixed sample/live labeling in homepage score summaries, match cards, and prediction cards. Removed the unrelated-prediction-by-array-index fallback on homepage matches.
- Kept mobile people/group tiles at explicit widths rather than letting long names expand them.

### Measured sizes

Running-page measurements with the existing outer page padding (CSS pixels):

| Viewport | Homepage feed container | Sports competition cards |
| --- | ---: | --- |
| 320 | 296 | One column, 296px cards |
| 375 | 351 | One column, 351px cards |
| 768 | 672 | Two columns, approximately 362px cards |
| 1024 | 488 | Two columns, approximately 490px cards |
| 1440 | 616 | Two columns, approximately 490px cards |

No document-level horizontal overflow was found at these widths. Horizontal sports-chip and discovery rails scroll within their own containers. The mobile navigation remains fixed and the shared guest/member page retains its bottom padding.

## ESPN functionality review

- Extracted scoreboard normalization into `src/lib/espn.ts` for direct fixture testing. Home/away ordering, numeric/string/object scores, live/upcoming/completed states, event-level status, logo arrays, invalid dates/teams, and multiple competitions are covered.
- Missing or invalid `events` arrays count as failed sources rather than successful empty schedules. A valid `events: []` remains empty, never fabricated. Unknown scores stay unknown, including on homepage feed cards.
- F1 is a race with a title and reported athlete positions, not two invented Home/Away teams. Multiple same-day sessions survive aggregation; search includes race titles and all reported drivers. Race-aware competition cards, summaries, shares and polls avoid fake match scores and Draw options. Upcoming races without a line-up remain visible without invented drivers.
- Tests use synthetic provider fixtures; these validate application behavior, not the current ESPN response schema or schedules.

### Live deployment diagnostic

```sh
# All configured ESPN scoreboards:
npm run check:espn
# Or selected competitions:
npm run check:espn -- epl nba f1
```

The diagnostic uses the same parser as the app, prints exact endpoint URLs, per-feed request/parse status, network error codes and normalized event/live counts, limits concurrency to eight, and uses the app’s ESPN transport with a four-second shared deadline across at most two attempts, and exits nonzero if any selected feed fails. Zero events with `ok: true` means a valid empty schedule, not necessarily an outage. It needs no API key.

In this sandbox, `npm run check:espn -- epl nba f1` reported **fetch failed for all three**; an independent ESPN HTTPS request also failed its TLS connection. Live availability could not be verified. Run the diagnostic from the deployment network before considering live ESPN functionality confirmed.

## ESPN reconnection and refresh

- Added `src/lib/espn-client.ts`, shared by the aggregator and deployment diagnostic. Requests stay server-side, use HTTPS/JSON headers and disable fetch caching; the browser calls the relative `/api/sports` route, not ESPN directly.
- Temporary HTTP 429/500/502/503/504 responses and connection failures get at most one retry. Both attempts share a four-second abort deadline. Retry-After is respected; a wait beyond the deadline fails rather than retrying early. Unsupported/unauthorized feeds and malformed JSON/schema responses are not retried.
- Network causes such as ECONNRESET and timeout messages now reach source reports, rather than an unhelpful generic fetch failure.
- Added a **Refresh scores** button with loading/duplicate-request protection, error/retry messaging and response-shape validation. Failed HTTP/invalid refresh responses retain the previous board. Automatic 45-second polling and hidden-tab checks remain.
- Manual requests use `/api/sports?refresh=1` and receive `Cache-Control: no-store`, bypassing the in-process board cache and intermediary response caching. Normal requests retain the existing short cache.
- New tests cover successful requests, transient recovery, non-retryable errors, malformed payloads, Retry-After, shared abort deadlines, API cache behavior, manual refresh/retry/loading, and automatic polling.

### Running-app / upstream verification

The unmocked local Next API returned **HTTP 200 / Cache-Control: no-store** for `/api/sports?refresh=1`. Its 38 ESPN source reports were all unsuccessful; the Premier League source reported `fetch failed: ECONNRESET`, and the board remained explicitly sample/demo. Independent shared-transport CLI checks for EPL/NBA/F1 likewise failed with ECONNRESET. No successful live ESPN integration is claimed. Browser refresh behavior is verified in real-component fixtures with mocked HTTP, not a deployed end-to-end session.

Latest regression run: **29 sports/homepage layout + 32 sports-data/API/transport + 22 navigation + 30 upload tests passed (113 total)**. TypeScript and `git diff --check` passed; changed-file ESLint has no errors. Browser screenshots are under ignored `test-results/`, not committed.
