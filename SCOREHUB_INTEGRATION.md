# ScoreHub integration

ScoreHub is served at `/scorehub` (redirecting to `/scorehub/index.htm`) and is linked from Sports. Its original HTML layout and CSS are unchanged, including its independent theme toggle. The original static markup is a snapshot of main at `d4ea5eefd7d0dd39ee41486af13ac8a8f16d547c`; `script.js` now connects that layout to Hyper's existing same-origin Sports API.

- Scores, fixtures, featured match and live ticker use `/api/sports`, which aggregates the same ESPN feeds as Hyper Sports. It refreshes approximately every 45 seconds when visible. Only ESPN events are displayed; Hyper's demo fallback is not presented as live scores. A partial or unavailable feed is labeled. Dates reflect the loaded scoreboard, not a complete schedule. NCAA Division II and III coverage is unverified.
- The existing EPL, La Liga and Serie A tabs use `/api/sports/standings/{league}`. The panel shows the first five rows from the first reported table; unreported values are dashes.
- The featured match statistics use `/api/sports/matches/{league}/{eventId}` when available, and match details open the existing Hyper Sports match page. Missing statistics are not fabricated.
- Sport/status filters, popular league selection, search and session-only favorites apply to the loaded matches. Unsupported sports and empty feeds show no matches. Motorsport races are excluded from this match-oriented design.
- Top scorers and news are still original sample content and explicitly marked as such; the streaming button and other original demo controls remain placeholders. The number of users is not provided and appears as a dash.
- Responses retain `X-Robots-Tag: noindex, nofollow`. Live ESPN access depends on the hosting environment and ESPN availability.

Run `npm run test:scorehub` to test the unchanged layout assets, routing, and mocked feed interactions. Do not overwrite the customized script when refreshing the original snapshot.
