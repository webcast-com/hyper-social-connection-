# ScoreHub integration

ScoreHub is served at `/scorehub` (redirecting to `/scorehub/index.htm`) and is linked from Sports. Its original HTML layout and CSS are unchanged, including its independent theme toggle. The original static markup is a snapshot of main at `d4ea5eefd7d0dd39ee41486af13ac8a8f16d547c`; `script.js` now connects that layout to Hyper's existing same-origin Sports API.

- Scores, fixtures, featured match and live ticker use `/api/sports`, which aggregates the same ESPN feeds as Hyper Sports. It refreshes approximately every 45 seconds when visible. Only ESPN events are displayed; Hyper's demo fallback is not presented as live scores. A partial or unavailable feed is labeled. Dates reflect the loaded scoreboard, not a complete schedule. NCAA Division II and III coverage is unverified.
- The existing EPL, La Liga and Serie A tabs use `/api/sports/standings/{league}`. The panel shows the first five rows from the first reported table; unreported values are dashes.
- Match cards use provider-supplied team crests, with initials if a crest is missing or fails. The existing possession, shots, shots-on-target and yellow-card indicators use `/api/sports/matches/{league}/{eventId}` when reported; dashes indicate missing data. Summary requests are shared, cached briefly, limited to four concurrent requests and loaded for visible cards.
- The match-details button selects that match in the existing statistics panel, including possession, shots, corners, fouls and cards when ESPN provides them. The panel’s full-stats link opens the existing Hyper Sports match page. Bar and donut proportions are based only on supplied values; unavailable statistics are not fabricated.
- Sport/status filters, popular league selection, search and session-only favorites apply to the loaded matches. Unsupported sports and empty feeds show no matches. Motorsport races are excluded from this match-oriented design.
- Top scorers and news come from ESPN through two same-origin routes (see "Top scorers and news" below); the design's sample players and headlines are removed when the script starts. The streaming button and other original demo controls remain placeholders. The number of users is not provided and appears as a dash.
- Responses retain `X-Robots-Tag: noindex, nofollow`. Live ESPN access depends on the hosting environment and ESPN availability.

Run `npm run test:scorehub` to test the unchanged layout assets, routing, and mocked feed interactions. Do not overwrite the customized script when refreshing the original snapshot.

## The head and hero on `/sports`

The Sports page (`/sports`) opens with this layout's head and hero, rebuilt as a React component (`src/components/SportsScoreHero.tsx`) and filled with that page's own data. The files in `scorehub/` and `public/scorehub/` are not changed and are not loaded by `/sports`. See "The sports page's head and hero" in `SPORTS_CHECKS.md` for what was carried over and what was not.

## Top scorers and news

Both panels keep the page's own markup: `script.js` clones one `.scorer` row and one `.news-card` from the document, clears the sample ones, and fills clones with text (`textContent` only, never markup).

| Panel | Route | ESPN address read by the server |
| --- | --- | --- |
| Top Scorers | `/api/sports/scorers/<league>` | `site.api.espn.com/apis/site/v2/sports/soccer/<league>/statistics` (the goals table only) |
| Latest News | `/api/sports/news?leagues=<a,b>` | `site.api.espn.com/apis/site/v2/sports/soccer/<league>/news` |

- `<league>` is a catalog slug (`epl`, `ucl`, `laliga`, …). The scorers route answers football competitions only (404 otherwise). The news route takes up to four slugs and uses `epl,ucl,laliga` when none is given.
- The page opens on the Premier League's scorers and the default news mix. Choosing a competition under "Popular Leagues" loads that competition's scorers and news.
- Five scorers and four news cards are shown; "View All" opens the rest (up to ten scorers, twelve articles) and becomes "Show fewer". The link is hidden when there is nothing more.
- A scorer's name links to the player page when ESPN's id has the expected shape. The photo is ESPN's headshot, else the club crest, else the initial. The figure is ESPN's goals count; a missing club is a dash.
- A headline opens the article on espn.com in a new tab. An article whose page is not `https` on `espn.com` (or a subdomain) is dropped, on the server and again in the browser. A missing picture or summary is left out, not replaced.
- When ESPN does not answer, the routes return `status: "unavailable"` with an empty list and `Cache-Control: no-store`, and the panels say "Top scorers unavailable." / "ESPN news unavailable.". There is no sample fallback.
- Caching on the server: news ten minutes, scorers fifteen, a failure thirty seconds; a failed refresh keeps the last good answer for up to an hour (news) or ninety minutes (scorers). The page asks for news again every ten minutes while it is in view.

**Not verified against ESPN.** The sandbox this was built in cannot reach ESPN. The news address is the one the video-news feed already uses in production. The statistics address and the shape of its goals table (`stats[]` with a `goalsLeaders` entry whose `leaders[]` carry `value`, `displayValue` and `athlete`) are written from ESPN's known public format and tested with stand-in responses only. If the Top Scorers panel says "No top scorers reported." on the live site, open `/api/sports/scorers/epl`: `source.ok: true` with an empty list means the response shape differs and `parseScorers` in `src/lib/espn-scorers.ts` needs adjusting.

## The featured card on `/sports`

The hero's featured match on `/sports` is now drawn as this layout's `.featured-match` card (`src/components/SportsHeroFeatured.tsx`): competition and red "LIVE" with ESPN's clock, a shield either side of the scoreline, the venue, a green bar, and dots with arrows that step through up to five matches in play. The sample card's goal scorers are not shown, because the scoreboard feed does not carry them; "Watch Live" is "Live match details" and opens the match page, since a stream is not known for a given match. League pages keep the board's own featured card.
