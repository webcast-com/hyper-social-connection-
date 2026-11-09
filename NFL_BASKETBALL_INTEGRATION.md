# Basketball & NFL dashboard integration

The standalone React/Vite dashboard copied from `nfl-nba-main (1)/nfl-nba-main`
on main at `d4ea5eefd7d0dd39ee41486af13ac8a8f16d547c` is available through the
Sports page at `/nfl-basketball`. It has its own navigation and theme switch;
Hyper's existing `/sports/nba` and `/sports/nfl` pages remain unchanged. In the
copied source, the router uses Vite's base URL so nested routes work beneath the
prefix; routing tests were added. The dashboard shortcuts for overview, schedule, news, community and notifications are wired to existing pages, and a logo link returns to Hyper Sports. Shortcuts for features that do not exist are disabled.

Root `npm run dev` and `npm run build` first run
`scripts/build-nfl-basketball.mjs`, which installs the dashboard's locked
packages if needed and builds its static assets into the ignored
`public/nfl-basketball/` directory. Deployments must run the root build command
and allow the nested `npm ci` to access the npm registry. `npm run
build:nfl-basketball` can also rebuild it explicitly. The source snapshot in
`vendor/nfl-nba` does not automatically follow changes to main.

Next serves generated assets directly and rewrites dashboard deep links to its
SPA entry point. Browser requests initially go directly to ESPN as in the
original; narrowly scoped, fixed-host `/espn` and `/espn-web` GET endpoints
provide the original same-origin fallback for supported NBA/NFL dashboard
endpoints. They validate league, path and query, reject redirects, and bound
request time, response size and per-instance concurrency. These routes do not
accept a user-supplied host or forward credentials. The original dashboard
uses bundled sample content if data is unavailable; its pages carry a noindex
header to avoid indexing sample content. Live ESPN availability and CORS are
dependent on the deployment and cannot be verified in the restricted sandbox.

Tests: `npm run test:nfl-basketball` and `npm --prefix vendor/nfl-nba test`.
