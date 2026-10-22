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

- Seven data tests cover catalog integrity, combined filters, request coverage, concurrency bounds, in-flight coalescing, caching, partial outages, empty scoreboards, cricket results, and total failure.
- Twenty-one browser tests exercise filters, empty/sample/partial states, dark mode, competition card sizes, and the actual homepage composition at 320, 375, 768, 1024, and 1440 pixels.
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

No document-level horizontal overflow was found at these widths. Horizontal sports-chip and discovery rails scroll within their own containers. The mobile navigation remains fixed and the signed-in page retains its bottom padding.

Final regression run: **21 sports/homepage layout tests + 7 sports-data tests + 30 upload tests passed**. TypeScript and `git diff --check` passed. Changed-file ESLint has no errors; seven existing image-optimization warnings remain. Browser screenshots are generated under ignored `test-results/`, not committed.
