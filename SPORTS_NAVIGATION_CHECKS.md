# Sports navigation and layout refresh

## Experience

- Keep the existing seven-sport / 38-competition ESPN catalog. Country/area metadata categorizes configured competitions only; it does not add a provider, advertise unsupported leagues or infer a fixture's location from a venue/team.
- Combine sport, region, country/area, competition, status, team/league/country search and loaded date filters. Sport/region changes reset dependent competition/country choices to avoid stale incompatible options; Reset filters clears all selections.
- Browse country → competition in a desktop sidebar, or an expandable mobile browser. Provider-supplied fixture counts are labeled as **loaded** counts, not today's full schedule. Cross-border leagues retain multi-country labels; international tournaments are not assigned to one nation.
- Default to a denser vertical match list with full team names and real/missing scores. Switch to the existing cards without losing filters, match links, sharing controls, venue information, or race-specific presentation.
- Quick All matches / Live / Upcoming / Results controls share state with the existing status select. Mobile keeps country/competition/search prominent and places region/status/date controls under More filters. Active advanced selections are indicated when collapsed.
- First match stays above 700px in the 320px-wide browser fixture, without hiding the public header/navigation in the actual app. The tests check visible input bounds and still verify the original first-screen limit, 44px sport buttons, full three-digit scores, dark mode and no horizontal page overflow.
- Dates use Africa/Nairobi (EAT) and filter only fixtures already supplied by the scoreboard. No historical requests, invented schedules or unreported countries are added.
- Match details include a competition breadcrumb linking to `/sports?league=<slug>`, which SSR initializes to that competition. Unknown/malformed league choices fall back to the all-competition view; no input is used to build an upstream URL.
- Match sections retain statistics, lineups, player tables, event updates, manual refresh and honest missing-data states. Larger scores and sticky section controls make navigation clearer. Comparison bars render only for two reported non-negative scalar values with matching units and a positive total; no missing/zero-total/ratio statistics are fabricated or compared. Labels explain which team each color represents.

## Contracts preserved

No changes to ESPN endpoint identifiers, Accept-only request headers, transport cache/concurrency/retry budgets, odds filters/prices/premium flags, API authentication, Google verification, SEO canonicals, public header/tabs, or About/Privacy pages. Scores still poll every 45 seconds when visible, manual refresh uses its existing API contract, failed refreshes retain data, and detail links disable prefetch. Motorsport retains its race/driver view, never a fictitious two-team match.

## Verification

- `npm run test:sports`: **94 passed**, including all existing API/transport/odds tests plus country coverage, international areas, combined filters, EAT midnight and safe stat comparison cases.
- `npm run test:seo`: **16 passed**.
- `npm run test:sports-layout`: **67 passed** in Chromium. All previous 62 regressions pass; new cases cover dependent country choices, desktop/mobile competition browsers, status/list/card controls, direct league initialization and match breadcrumb/missing-stat bars.
- `npm run typecheck`, changed-file ESLint and `git diff --check`: passed; one existing team-logo image optimization warning.
- `npm run build`: passed, including the query-initialized sports page and match routes.

These automated checks use controlled fixtures. Live ESPN coverage, production hosting behavior, parity with commercial providers, rankings and historical completeness are not asserted. This sandbox cannot independently validate ESPN access because outbound access is restricted. Review the deployment with real data before merging this layout follow-up.
