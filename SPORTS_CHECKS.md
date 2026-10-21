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
- Eight browser tests exercise filters, empty/sample/partial states, dark mode, and controls at 320, 375, 768, and 1440 pixels.
- Tests use deterministic provider payloads and real components; they do **not** verify current upstream schedules or endpoint availability. This sandbox cannot reach the live ESPN/TheSportsDB hosts. Verify provider responses from the deployment environment, including off-season empty feeds and any provider access/rate limits.
