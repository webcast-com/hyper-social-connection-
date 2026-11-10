# ScoreHub · Basketball + NFL live dashboard

Dark, broadcast-style sports dashboard built with React + Vite. Scores, standings and player leaders come from ESPN's public (keyless) endpoints, with bundled demo data as an automatic offline fallback.

## Interface

- **Icon rail** on the far left with the app mark and section shortcuts.
- **Top bar** with sport tabs (Basketball, Football, Cricket, Badminton, Hockey), search, notifications, a working light/dark theme switch (persisted in `localStorage`) and the profile chip.
- **Section pill bar** under the top bar (Live / Upcoming / Top scorers / News) that opens the other screens of the current sport; every screen keeps the same sport in the URL.
- **League sidebar**: continent filter, the full competition list, gender filter and countries with flags. Rows narrow each other and filter the dashboard in place; the section chevrons expand a list that is taller than the panel.
- **Featured game hero** with the live matchup, venue, broadcast and clock.
- **Live Score panel**: season pill, viewer time-zone chip, day/week rail, status tabs (ALL / LIVE / UPCOMING / FINAL), search, match cards with real team logos, live clocks, scores and broadcasters.
- **Player Details rail** with photo (or team-coloured monogram) cards and a stats strip.
- **Standings** grouped into conference/division cards, plus competition snapshot tiles.
- Responsive down to phones: the rail hides, the header wraps onto two rows so all five sport tabs stay reachable, columns stack, and a phone-only section tab bar (Live / Standings / Filters / Players) jumps straight to the panels that would otherwise be buried below the scores.

Sports without a feed yet (Cricket, Badminton, Hockey) render a placeholder page inside the same shell instead of pretending to have data.

## Included

- `src/pages/BasketballPage.jsx` — global basketball dashboard: continent / competition / gender / country / season filters, date rail, status tabs and search.
- `src/pages/NFLPage.jsx` — NFL dashboard, season stage + week rail + conference filters.
- `src/pages/TeamPage.jsx` / `src/pages/PlayerPage.jsx` — team and player detail pages reached from the standings table, the player rail and the squad list.
- `src/pages/NewsPage.jsx` / `TopScorersPage.jsx` / `UpcomingPage.jsx` / `MatchPage.jsx` — the news, leaderboard, schedule and match-commentary screens, plus `src/components/SubNav.jsx`, the pill bar that switches between them.
- `src/pages/ComingSoonPage.jsx` — placeholder for sports that don't have a feed yet.
- `src/components/` — shell (rail/top bar), league sidebar, hero, score panel, match cards, player cards, standings, UI primitives, icon set.
- `src/api/espn.js` — ESPN client and normalisers.
- `src/hooks/useEspnFeed.js` — polling hook that swaps demo data for live data.
- `src/data/sportsData.js` — demo data (scores, standings, leaders, team logos, broadcasters) used for the first paint and offline mode.
- `src/data/newsData.js` / `scorersData.js` / `commentaryData.js` — offline newsroom stories, per-category leader boards and sample play-by-play.
- `src/assets/news/` and `src/assets/players/` — card photography and portrait art bundled with the app so both screens stay illustrated offline.
- `src/utils/` — date/week rails and dashboard helpers.

## Team and player pages

Every team name in a standings table and every card in the Player Details rail links to a dedicated page, so the hub is no longer a dead end:

| Route | Page |
| --- | --- |
| `/basketball/team/:teamKey` · `/nfl/team/:teamKey` | Team profile: record, PCT, streak, group, the team's results/fixtures, squad list and its conference table |
| `/basketball/player/:playerKey` · `/nfl/player/:playerKey` | Player profile: portrait, position, jersey, headline stat, ESPN season splits and the rest of the leaders board |

- Keys are readable slugs (`/basketball/team/boston-celtics`, `/basketball/player/luka-doncic`); codes and ESPN ids resolve too, so `bos` and ESPN's numeric id land on the same page.
- Everything renders from the bundled demo data first — records come from the standings table, fixtures from the games feed, profiles from the leaders rail — then ESPN enriches them when it answers: team info + `teams/{id}/schedule` + `teams/{id}/roster` for teams, `athletes/{id}` for players.
- The standings table and player cards render plain markup when no router is present, so the components stay usable standalone (see `MaybeLink` in `src/components/ui.jsx`).
- A player page always shows a portrait: the ESPN headshot when the feed answers, the bundled portrait art from `src/assets/players/` otherwise, and initials only if both images fail.

## Multipage screens

Each hub is a small site of its own. A pill bar under the top bar (`SubNav`) switches between the four screens, and every screen keeps the same sport in the URL:

| Screen | Route | What it shows |
| --- | --- | --- |
| Live | `/basketball` · `/nfl` | The full dashboard (hero, scores, standings, players) |
| Upcoming | `/basketball/upcoming` · `/nfl/upcoming` | Every fixture still to play, grouped by `In progress` / `Today` / `Tomorrow` / date, with tip-off times in the viewer's zone |
| Top scorers | `/basketball/top-scorers` · `/nfl/top-scorers` | Four leader boards (points, rebounds, assists, blocks for basketball; passing, rushing, receiving, sacks for the NFL) with player portraits and links |
| News | `/basketball/news` · `/nfl/news` | The newsroom grid of reports, previews and analysis, each card with its own image |
| Match commentary | `/basketball/match/:matchId` · `/nfl/match/:matchId` | Scoreline hero plus the play-by-play timeline, reached from any match card or Upcoming fixture |

- Everything renders from bundled demo content first (`newsData.js`, `scorersData.js`, `commentaryData.js`) and is replaced in place when ESPN answers: `…/news` for the newsroom, `…/leaders` for the boards, `/summary?event={id}` for real play-by-play. Offline, the match page labels its feed `Sample play-by-play` instead of pretending to be live.
- **News cards carry artwork.** Every demo story ships a photo from `src/assets/news/`, so the grid is illustrated before the first network call; ESPN stories use their own image and fall back to the bundled set. A photo that fails to load drops back to the story's accent gradient instead of a broken-image icon.
- **Top scorers carry portraits.** Each row is a 36px portrait chip: ESPN headshot → bundled portrait art from `src/assets/players/` (picked deterministically per player, so a name keeps the same face on every board) → initials. The page footnotes that portraits are ESPN headshots when the feed answers and sample artwork otherwise.
- Leader names link to their `/player/:playerKey` page whenever a profile exists, so the boards, the player rail and the standings all lead into the same detail pages.
- Match cards on both dashboards (and every fixture row) now link to the commentary screen; the commentary screen is the only place the app shows a play-by-play timeline.
- **Match links carry their competition.** Cards outside the board's flagship league append `?competition=` (`/basketball/match/401…?competition=ncaam`), so a college or EuroLeague game opens the commentary for that game's ESPN feed instead of the NBA one. Flagship links stay clean (`/nfl/match/401…`).
- **The commentary page works for real ESPN games, not just bundled ones.** Any game opened from the live rail renders its hero (both teams, crests, scores, venue) straight from `/summary`, and the status chip reads the game's actual state — green for live with its clock, grey `Final` once it is over, kick-off time while it is scheduled. A summary with a scoreline but no plays yet keeps the page (it says ESPN has not published play-by-play) instead of claiming the match is missing, an in-flight request shows a loading line rather than that error, and plays keep their clock, team badge and scoreline.
- The bundled photography is placeholder stock and the portraits are generated artwork, not the real players — they exist so the screens stay illustrated offline. Once ESPN answers, the real headshots and article images replace them.

## Mobile layout

Below 960px the icon rail is hidden and the three dashboard columns stack. To keep the desktop components reachable, both dashboards render a fixed bottom **section tab bar**:

| Tab | Jumps to | Desktop equivalent |
| --- | --- | --- |
| Live | Featured game | Centre column, top |
| Standings | League standings panel | Centre column, below the scores |
| Filters | Continent / competition / gender / country sidebar | Left sidebar |
| Players | Player Details rail | Right column |

- Each tab smooth-scrolls to its `#section-*` target, clears the sticky header (`scroll-margin-top`) and stays highlighted while that section is in view; the page reserves bottom padding so the bar never covers the last row.
- Tab taps scroll with an eased animation (`src/utils/scroll.js`) that works even where `scrollIntoView({ behavior: "smooth" })` is ignored, lands the panel just below the sticky header, is cancelled as soon as the visitor scrolls, and jumps instantly for `prefers-reduced-motion` visitors. `html { scroll-behavior: smooth }` covers the rest.
- The tabs are `display: none` above 960px, so the desktop layout is untouched, and they are plain buttons with `aria-current` — keyboard and screen-reader friendly.
- The top bar wraps to two rows below 960px (brand and actions, then the full-width sports switcher), fixing the clipped "Footb…" tab on narrow phones.

## Basketball coverage and filters

`src/data/sportsData.js` catalogues 40 competitions (id, name, short code, colour, country, continent, gender, optional ESPN slug). Seven regions are represented:

| Region | Competitions |
| --- | --- |
| Africa (7) | Basketball Africa League, Women's Basketball League Africa, Kenya NBL, Kenya Women's Basketball League, Nigeria NBPL, Egypt EBSL, Senegal N1 |
| Europe (13) | EuroLeague, EuroCup, Basketball Champions League, Liga ACB, BBL, LBA, LNB Élite, Greek Basket League, ABA League, EuroLeague Women, EuroCup Women, EuroBasket, EuroBasket Women |
| Asia (7) | Chinese CBA, Japan B.LEAGUE, Korea KBL, Philippines PBA, WJBL, WCBA, FIBA Asia Cup |
| North America (5) | NBA, WNBA, NBA G League, NCAA Men's Division I, NCAA Women's Division I |
| Oceania (2) | NBL, WNBL |
| South America (2) | Liga Nacional Argentina, Basketball Champions League Americas |
| International (6) | FIBA World Cup and Women's World Cup, FIBA Olympic qualifiers, Olympic Qualifying Tournaments, FIBA 3x3 men's and women's series |

Six of them are mapped to live ESPN scoreboards (`nba`, `wnba`, `euroleague`, `nbl`, plus college basketball's `mens-college-basketball` and `womens-college-basketball`); the rest are demo-only until ESPN exposes a slug, and the dashboard keeps rendering them from demo data.

Filters compose in a single pass — every one of them narrows the games, the hero, the standings label and the sidebar options at the same time:

- **Continent** (with *All continents*) picks the region.
- **Competition** (the sidebar list) is filtered by continent, gender, country and search; a selection that no longer matches falls back to *All competitions* instead of showing an empty page.
- **Gender** (Men / Women / All) uses each competition's `gender`, so the list shows M/W tags and the header counts update.
- **Country** (with flags) is derived from the remaining continent/gender selection.
- **Season** (a `<select>` on the Live Score panel) offers the current season and the two before it. Choosing one re-queries ESPN with ESPN's end-year convention (`season start + 1`) and moves the date rail to today (current season) or 1 February of the season's end year (historical seasons).

Status tabs (ALL / LIVE / UPCOMING / FINAL), team search, the day rail and competition selection are additive: a game must match all of them.

### NCAA / college

College is a first-class competition rather than a separate app:

| Sport | Competition | ESPN feed | Notes |
| --- | --- | --- | --- |
| Basketball | NCAA Men's Division I (`ncaam`) | `basketball/mens-college-basketball` | ACC / Big Ten / SEC / Big 12 sample table, demo fixture Duke–North Carolina |
| Basketball | NCAA Women's Division I (`ncaaw`) | `basketball/womens-college-basketball` | SEC / Big East / ACC / Big Ten sample table, demo fixture UConn–South Carolina |
| Football | College Football (`cfb`) | `football/college-football` | SEC / Big Ten / ACC / Big 12 sample table, demo fixture Alabama–Georgia |

- Both colleges sit in the North America continent and in the Men / Women gender filters, so the existing filters, search and status tabs apply unchanged.
- Both Division I college basketball boards ride along with the flagship leagues, so NCAA games are on the default *All competitions* view too. ESPN only returns its featured games for college basketball unless group 50 is requested, so those two boards are fetched with `groups=50&limit=500` — a full Division I day can be 100+ games. Selecting an NCAA competition keeps showing only its own games and switches the standings panel to its conference table.
- On the football board, *College Football* replaces the NFL week rail (college has no preseason/week stages) and shows conference tables instead of AFC/NFC divisions.
- Team pages resolve for college programmes too (`/basketball/team/duke-blue-devils`), and their ESPN lookups use the college league key rather than the NBA one. Rich detail still comes from the bundled data, since ESPN's college endpoints return a different shape.
- The news / top scorers / upcoming screens stay per sport on the flagship league (`nba`, `nfl`); selecting a college competition changes the hub, not those screens. The commentary screen is the exception — it follows the game you opened, so a college fixture loads its own conference feed.

## Add to a Vite React project

1. Copy the `src` folder into your project.
2. Import the page you want in your router:

```jsx
import BasketballPage from "./pages/BasketballPage";
import NFLPage from "./pages/NFLPage";

// <Route path="/basketball" element={<BasketballPage />} />
// <Route path="/nfl" element={<NFLPage />} />
```

3. Import the stylesheet once in your app entry point:

```jsx
import "./styles.css";
```

`src/App.jsx` shows the full shell (rail, top bar, routes, theme toggle).

## ESPN integration

| What | Endpoint |
| --- | --- |
| NBA / WNBA / NBL / EuroLeague scores | `site.api.espn.com/apis/site/v2/sports/basketball/{nba,wnba,nbl,euroleague}/scoreboard` |
| NBA standings | `site.api.espn.com/apis/v2/sports/basketball/nba/standings` |
| NFL scores (preseason / regular / postseason) | `site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` |
| NCAA basketball scores (men / women) | `site.api.espn.com/apis/site/v2/sports/basketball/{mens,womens}-college-basketball/scoreboard?limit=500&groups=50` |
| College football scores | `site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard` |
| NFL standings (AFC/NFC → divisions) | `site.api.espn.com/apis/v2/sports/football/nfl/standings` |
| Season leaders (best effort) | `site.web.api.espn.com/apis/common/v3/sports/{basketball/nba,football/nfl}/leaders` |
| Team page (info, schedule, roster) | `site.api.espn.com/apis/site/v2/sports/basketball/{nba,…}/teams/{id,abbr}/…` |
| Player page stats (best effort) | `site.web.api.espn.com/apis/common/v3/sports/{basketball/nba,football/nfl}/athletes/{id}` |
| Newsroom | `site.api.espn.com/apis/site/v2/sports/{basketball/nba,football/nfl}/news` |
| Match commentary | `site.api.espn.com/apis/site/v2/sports/{basketball/nba,football/nfl}/summary?event={id}` |

How it behaves:

- **No API key.** ESPN's public endpoints are keyless and send `Access-Control-Allow-Origin: *`, so the browser calls them directly. Each request also has a same-origin fallback (`/espn`, `/espn-web`) that the Vite dev/preview server proxies server-side (`vite.config.js`).
- **Graceful degradation.** The page paints the bundled demo data immediately. When ESPN answers, scores/standings/leaders/stat tiles are replaced in place; team logos, broadcasters and player headshots come with them. If ESPN is unreachable the demo data stays and the chip reads `OFFLINE · DEMO`; a refresh button and a 45s retry keep trying.
- **Filters still work.** ESPN statuses map to the existing tabs (`LIVE`, `UPCOMING`, `FINAL`), NFL season stages map to the existing competition ids (`nfl`, `preseason`, `playoffs`), and venue countries feed the country filter.
- **Navigation maps to real feeds.** The basketball date rail sends `dates=YYYYMMDD`; the NFL week rail sends `week` + `seasontype`.
- **Live games survive the local midnight.** ESPN files a game under the US day it starts, but a 19:30 ET tip-off is 05:00 in Nairobi and still running. The today view also asks for yesterday's board and keeps only the games that are still in progress (deduped, capped at 12), so the live rail is never empty in the morning just because the viewer's calendar already rolled over.
- **Live first.** Both boards sort `LIVE → UPCOMING → FINAL` (stable inside each group), so the games in progress sit at the top of the score panel and the hero always features one. A dead clock reads `Halftime` rather than a bare `Q2`.
- **Kick-offs follow the viewer's clock.** Every upcoming game is rendered from its ISO `startTime` with `Intl.DateTimeFormat` in the device time zone, so the day label and time move with the viewer — a tip-off in Kigali reads `Today · 20:00` for a Nairobi viewer (GMT+3) and `17:00` for a London one. The Live Score header carries a `GMT+3`-style chip naming the active zone (`title`/`aria-label` give the IANA zone). Demo fixtures generate their tip-offs relative to the current clock instead of hard-coding times.

### Configuration

All optional, see `.env.example`:

```bash
VITE_ESPN_SITE_BASE_URL=https://site.api.espn.com   # or /espn to force the proxy
VITE_ESPN_WEB_BASE_URL=https://site.web.api.espn.com
VITE_ESPN_DISABLE=1                                  # demo data only
```

When deploying the static build without a proxy, keep the default ESPN origins (browser-direct requests). If you prefer routing ESPN traffic through your own server, set `VITE_ESPN_SITE_BASE_URL=/espn` and mirror the `vite.config.js` proxy in your host config.

### Deployment

`vercel.json` rewrites every path to `index.html`, so the client-side routes (`/nfl`, `/cricket`, `/badminton`, `/hockey`) survive a refresh or a shared link instead of hitting the host's 404 page — previously only `/` loaded and the rest 404'd on the Vercel deployments. On other static hosts, mirror that rewrite (`/* → /index.html`); `vite dev` and `vite preview` already do it.

Unit tests disable ESPN automatically (`import.meta.env.MODE === "test"`), so component tests assert against the demo dataset. `src/api/espn.test.js` covers the normalisers and the request fallback/cache behaviour; `src/hooks/useEspnFeed.test.jsx` covers the loading → live, offline and refresh states.

## Props

Both dashboards accept optional props. Anything you pass wins over ESPN and disables polling for that page, so the components remain pure/controllable:

- `games`
- `competitions`
- `countries`
- `standings`
- `leaders`
- `stats`
- `lastUpdated`
- `live` — set `false` to skip all ESPN requests and stay on demo data

See `src/data/sportsData.js` for the expected shapes, and `src/api/espn.js` for how ESPN payloads are mapped onto them.
