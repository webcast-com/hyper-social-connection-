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

## Match-detail league table (October 2026)

- Added a fifth **League table** section, available on the existing anonymous match page. The first open fetches `/api/sports/standings/[league]`; switching among previously opened sections preserves the table and group selection. Initial match SSR, scoreboard filtering/polling and summary refresh do not fetch standings.
- Standings use the catalog-only `https://site.api.espn.com/apis/v2/sports/{sport}/{league}/standings` endpoint. Both the football and basketball reference docs explicitly warn that `/apis/site/v2/` returns an empty/stub standings response. There is no alternate-host fallback or arbitrary reference traversal. Accept-only request headers remain unchanged.
- Match summaries now retain a supplied season year. Known seasons become a validated `season=YYYY` request; the returned season must match or the table remains unavailable. Unknown match seasons are explicitly labeled as the provider's current table, never a historical match table. Season standings are not a snapshot at kickoff or an in-match projection.
- Group/conference/division tables retain provider order, reported rank, labels, notes, percentages and streaks. Missing positions are not replaced with array indices, missing cells are `—`, and reported zeroes stay zero. Match team IDs determine highlighting; non-color “In this match” markers identify those rows. Multiple groups get a selector, initially choosing a group containing a match team where possible.
- Responsive, keyboard-focusable horizontal table scrolling and sticky team names preserve the page width at 320/768/1440px, in light and dark themes. An empty cup/knockout table is distinct from HTTP/network/timeout/schema failures. Independent table refresh retains the last successful table on failure, without removing match statistics, lineups, players or events.
- Independent transport limits: eight seconds upstream, no retries, coalescing, eight concurrent distinct jobs, 100 cached keys, five-minute success/empty cache and fifteen-second failure cache (per server process). Browser requests also have a twelve-second deadline and abort on unmount. Public responses are `no-store`, with validated catalog routes and season input; safe error metadata excludes cookies and response bodies. Parsing is bounded to 32 tables, 300 rows/table, 40 stat columns and five nested child levels.
- Checks: **117 sports unit/API tests + 16 SEO tests + 84 Chromium browser tests**, including the previous 75 browser regressions. TypeScript, changed-file ESLint and `git diff --check` pass; the production build passes (existing Next config file-tracing warning). Tests use controlled provider fixtures, not proof of live ESPN availability. Production standings access and competition-by-competition coverage still need deployment review.

### Match-detail review: recommended next additions, not included in this change

Existing details already provide score/status, EAT kickoff, venue, competition navigation, team-stat comparisons, lineups/rosters, player statistics, reported events, sharing from score cards, source diagnostics and safe return navigation. The highest-value remaining additions are:

1. **Recent form (last five completed games per team)** — useful pre-match context. Fetch actual dated team results on demand; clearly state competition scope and incomplete coverage. Never infer form from the loaded scoreboard or use results after a historical match's kickoff.
2. **Head-to-head** — recent meetings with dates, competition and final scores. Validate both team IDs, disclose limited history and avoid presenting a sampled list as an all-time record. Extra-time/penalty outcomes need explicit labels.
3. **Richer match information** — reported round/stage, referee and attendance are a low-request-cost enhancement when present in the existing summary. Keep missing fields absent/explicit; do not invent officials or attendance. A venue map requires a separately reviewed mapping source.
4. **Next fixtures for each team** — useful follow-on navigation, using separately bounded schedules and EAT kickoff labels. Distinguish “after this match” from “upcoming now” for historical pages.

Injuries, suspensions, formations on a pitch diagram, live text commentary beyond reported events, and qualification/relegation color zones should wait for reliable structured coverage. Do not invent players' pitch coordinates, complete injury lists, commentary, table rules or win probabilities. Existing lineups, statistics and events do not need duplicate tabs.
