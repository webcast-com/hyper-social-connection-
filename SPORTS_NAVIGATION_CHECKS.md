# Sports navigation and layout refresh

## Experience

- Keep the existing seven-sport / 38-competition ESPN catalog. Country/area metadata categorizes configured competitions only; it does not add a provider, advertise unsupported leagues or infer a fixture's location from a venue/team.
- Combine sport, region, country/area, competition, status, team/league/country search and loaded date filters. Sport/region changes preserve compatible country/competition choices and clear incompatible ones; Reset filters clears filters while retaining the chosen list/card layout.
- Browse country → competition in a desktop sidebar, or an expandable mobile browser. Provider-supplied fixture counts are labeled as **loaded** counts, not today's full schedule. Cross-border leagues retain multi-country labels; international tournaments are not assigned to one nation.
- Default to a denser vertical match list with full team names and real/missing scores. Switch to the existing cards without losing filters, match links, sharing controls, venue information, or race-specific presentation.
- Quick All matches / Live / Upcoming / Results controls share state with the existing status select. Mobile keeps country/competition/search prominent and places region/status/date controls under More filters. Active advanced selections are indicated when collapsed.
- First match stays above 700px in the 320px-wide browser fixture, without hiding the public header/navigation in the actual app. The tests check visible input bounds and still verify the original first-screen limit, 44px sport buttons, full three-digit scores, dark mode and no horizontal page overflow.
- Dates use Africa/Nairobi (EAT) and filter only fixtures already supplied by the scoreboard. No historical requests, invented schedules or unreported countries are added.
- Match details include a competition breadcrumb linking to `/sports?league=<slug>`, which SSR initializes validated URL-backed filter state. Unknown/malformed filter values fall back to supported defaults; no input is used to build an upstream URL.
- Match sections retain statistics, lineups, player tables, event updates, manual refresh and honest missing-data states. Larger scores and sticky section controls make navigation clearer. Comparison bars render only for two reported non-negative scalar values with matching units and a positive total; no missing/zero-total/ratio statistics are fabricated or compared. Labels explain which team each color represents.

## Contracts preserved

No changes to ESPN endpoint identifiers, Accept-only request headers, transport cache/concurrency/retry budgets, odds filters/prices/premium flags, API authentication, Google verification, SEO canonicals, public header/tabs, or About/Privacy pages. Scores still poll every 45 seconds when visible, manual refresh uses its existing API contract, failed refreshes retain data, and detail links disable prefetch. Motorsport retains its race/driver view, never a fictitious two-team match.

## Verification

- `npm run test:sports`: **102 passed**, including all existing API/transport/odds tests plus country coverage, international areas, combined filters, EAT midnight and safe stat comparison cases.
- `npm run test:seo`: **16 passed**.
- `npm run test:sports-layout`: **75 passed** in Chromium. All previous 62 regressions pass; new cases cover dependent country choices, desktop/mobile competition browsers, status/list/card controls, direct league initialization and match breadcrumb/missing-stat bars.
- `npm run typecheck`, changed-file ESLint and `git diff --check`: passed; one existing team-logo image optimization warning.
- `npm run build`: passed, including the query-initialized sports page and match routes.

These automated checks use controlled fixtures. Live ESPN coverage, production hosting behavior, parity with commercial providers, rankings and historical completeness are not asserted. This sandbox cannot independently validate ESPN access because outbound access is restricted. Review the deployment with real data before merging this layout follow-up.


## Priorities 1–3: persistent context and clickable rows

- Sport, region, country, competition, status, EAT date, search and list/card layout round-trip through validated URL parameters. SSR and browser parsing use the same normalization, including the first-value rule for repeated parameters.
- Native History API updates and a subscribed URL store avoid route/feed requests on filter changes. Discrete choices push history; search typing replaces the current entry instead of creating an entry per keystroke. Back/forward and copied/reloaded URLs restore controls, results and layout. No browser storage, account or database migration is required.
- Removable active-filter chips clear only their own filter (plus genuinely incompatible dependants). On mobile, chips scroll horizontally within the page width to keep fixtures accessible. Long search text is bounded to 160 characters; control characters are stripped and displayed text remains React-escaped.
- Main team/score areas are keyboard-focusable links in both list and card modes. Score columns align consistently and accessible labels announce reported/missing scores. Existing explicit detail links, status information, venue and sharing controls are retained. Buttons are not nested inside links; sample and motorsport rows never acquire two-team match navigation.
- Match links carry the current scoreboard filters/layout as a return context. The detail page validates this context before passing it to the client back link. Only `/sports` and recognized normalized filter parameters are allowed; external URLs, other routes, control characters, oversized input and arbitrary parameters/fragments cannot become a redirect.
- Coverage, provider URLs, request headers/budgets, score polling, manual refresh, failed-refresh data retention, independent odds, anonymous navigation, SEO and race presentation remain unchanged. Date selection is still a filter over loaded fixtures, not historical fetching.
- New tests cover complete URL round-trips, compatible selections, independent chip removal, invalid dates/input bounds, encoded search text, repeated parameters and unsafe return paths. Browser coverage includes native history without API traffic, reload/shared links, keyboard navigation into both match layouts and back through the actual client back link, actual async detail-page return validation, nested-interaction checks, and 320px long chips.
- Current checks: **102 sports unit/API tests + 16 SEO tests + 75 browser tests**; TypeScript, changed-file lint and production build pass. Fixtures verify interaction contracts rather than live provider availability.

- Production-build browser smoke (real Next.js router, offline database mode): shared URL restored filters/layout; changing Football → Rugby retained England and cleared the incompatible league; native Back restored the previous selection with zero score API/RSC route requests; the actual match-page back link returned to all filters/layout. No browser runtime or hydration errors occurred. This validates real routing, not live ESPN completeness.
