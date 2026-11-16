/**
 * What every dashboard URL is, in words: its title, description, canonical
 * path, heading, breadcrumb trail, the links that lead on from it, and whether
 * it is a page worth indexing at all.
 *
 * One definition, two readers. The app applies it to the document on every
 * navigation (`RouteMeta.jsx`), and the host that serves the built document
 * writes the same values into the HTML before it is sent, so the first byte a
 * crawler reads and the page a visitor ends up on agree with each other.
 *
 * Everything here is pure and free of image or CSS imports, so the host can
 * import it from a plain Node process.
 *
 * Paths are relative to the router base ("/basketball/team/duke-blue-devils"),
 * never to the site root.
 */
import {
  basketballGames,
  basketballLeaders,
  basketballStandings,
  collegeFootballStandings,
  ncaaBasketballStandings,
  ncaaWomenStandings,
  nflGames,
  nflLeaders,
  nflStandings,
} from "../data/sportsData";
import { buildPlayerIndex, buildTeamIndex, findPlayer, findTeam, slugify } from "../utils/entities";

/**
 * The same games, standings and leaders `data/detailConfig.js` hands the team,
 * player and match screens — so "this URL has a page" means exactly what the
 * app means by it. `detailConfig` itself imports portrait artwork, which a Node
 * process cannot load; a test holds the two lists together.
 */
const SPORTS = {
  basketball: {
    sport: "basketball",
    hub: "/basketball",
    label: "Basketball",
    noun: "basketball",
    flagship: "nba",
    schemaSport: "Basketball",
    games: basketballGames,
    standings: [...basketballStandings, ...ncaaBasketballStandings, ...ncaaWomenStandings],
    leaders: basketballLeaders,
    competitionId: "nba",
  },
  football: {
    sport: "football",
    hub: "/nfl",
    label: "NFL",
    noun: "NFL",
    flagship: "nfl",
    schemaSport: "American Football",
    games: nflGames,
    standings: [...nflStandings, ...collegeFootballStandings],
    leaders: nflLeaders,
    competitionId: "nfl",
  },
};

const SPORT_BY_SEGMENT = { basketball: "basketball", nfl: "football" };

/**
 * Competitions a match URL may name in `?competition=`, per sport. These are the
 * ids `LEAGUE_BY_COMPETITION` in `api/espn.js` can turn into an ESPN feed; a
 * test keeps the two in step. The first of each sport is its flagship, which a
 * match URL leaves unsaid.
 */
export const MATCH_COMPETITIONS = {
  basketball: {
    nba: "NBA",
    wnba: "WNBA",
    nbl: "NBL",
    euroleague: "EuroLeague",
    ncaam: "NCAA Men's Basketball",
    ncaaw: "NCAA Women's Basketball",
  },
  football: {
    nfl: "NFL",
    cfb: "College Football",
  },
};

/**
 * Names for the flagship league's own phases. The ESPN client files NFL games
 * under `preseason` and `playoffs` as well as `nfl`; all three read the NFL
 * feed, so a URL naming one is the same page as the URL naming none.
 */
const FLAGSHIP_PHASES = {
  basketball: {},
  football: { preseason: "NFL Preseason", playoffs: "NFL Playoffs" },
};

const feedsOf = (sport) => MATCH_COMPETITIONS[sport];
const otherSport = (sport) => (sport === "basketball" ? "football" : "basketball");

/** An ESPN event id. The bundled sample fixtures use one- and two-digit ids. */
const ESPN_EVENT_ID = /^[1-9]\d{5,14}$/;

const SECTIONS = {
  upcoming: {
    label: "Upcoming",
    basketball: {
      title: "Basketball Fixtures — Upcoming NBA, WNBA & NCAA Games",
      heading: "Upcoming basketball fixtures",
      description:
        "Upcoming basketball fixtures for the NBA, WNBA, EuroLeague, NBL and NCAA Division I, grouped by day with tip-off times in your own time zone.",
      keywords: ["basketball fixtures", "NBA schedule", "WNBA schedule", "NCAA basketball schedule", "tip-off times"],
    },
    football: {
      title: "NFL Schedule — Upcoming Games & Kick-off Times",
      heading: "Upcoming NFL games",
      description:
        "Upcoming NFL and college football games, grouped by day with kick-off times in your own time zone.",
      keywords: ["NFL schedule", "NFL fixtures", "college football schedule", "kick-off times"],
    },
  },
  "top-scorers": {
    label: "Top scorers",
    basketball: {
      title: "Basketball Top Scorers — NBA Stat Leaders by Category",
      heading: "Basketball top scorers",
      description:
        "Basketball stat leaders by category — points, rebounds, assists, blocks and more — with each player's team and headshot, from the ESPN leaders feed.",
      keywords: ["NBA top scorers", "NBA stat leaders", "points per game leaders", "basketball leaders"],
    },
    football: {
      title: "NFL Stat Leaders — Passing, Rushing & Receiving Leaders",
      heading: "NFL top scorers",
      description:
        "NFL stat leaders by category — passing, rushing and receiving yards, sacks and more — with each player's team and headshot, from the ESPN leaders feed.",
      keywords: ["NFL stat leaders", "NFL passing leaders", "NFL rushing leaders", "NFL receiving leaders"],
    },
  },
  news: {
    label: "News",
    basketball: {
      title: "Basketball News — NBA Headlines, Reports & Previews",
      heading: "Basketball news",
      description:
        "The latest basketball headlines, match reports and previews from across the NBA, from the ESPN news feed.",
      keywords: ["basketball news", "NBA news", "NBA headlines", "match reports"],
    },
    football: {
      title: "NFL News — Headlines, Match Reports & Previews",
      heading: "NFL news",
      description:
        "The latest NFL headlines, match reports and previews, from the ESPN news feed.",
      keywords: ["NFL news", "NFL headlines", "American football news", "match reports"],
    },
  },
};

const HUBS = {
  basketball: {
    title: "Basketball Scores — NBA, WNBA, EuroLeague & NCAA Live Scores",
    heading: "Basketball live scores, fixtures and standings",
    description:
      "Live basketball scores, fixtures, standings and top scorers for the NBA, WNBA, EuroLeague, NBL and NCAA Division I men's and women's college basketball, powered by ESPN.",
    keywords: [
      "basketball scores", "live basketball scores", "NBA scores", "WNBA scores", "EuroLeague scores",
      "NCAA basketball scores", "college basketball scores", "NBA standings", "basketball fixtures",
    ],
  },
  football: {
    title: "NFL Scores — Live American Football Scores, Standings & Fixtures",
    heading: "NFL live scores, fixtures and standings",
    description:
      "Live NFL scores, fixtures, conference standings and top scorers for every NFL team and college football programme, powered by ESPN.",
    keywords: [
      "NFL scores", "live NFL scores", "American football scores", "NFL standings", "NFL fixtures",
      "college football scores", "AFC standings", "NFC standings",
    ],
  },
};

const COMING_SOON = { cricket: "Cricket", badminton: "Badminton", hockey: "Hockey" };

const indexes = new Map();

/** Teams and players a sport's detail screens can open, keyed as the app keys them. */
export function sportIndex(sport) {
  if (!indexes.has(sport)) {
    const config = SPORTS[sport];
    indexes.set(sport, {
      teams: buildTeamIndex(config),
      players: buildPlayerIndex(config.leaders),
    });
  }
  return indexes.get(sport);
}

const byName = (left, right) => left.name.localeCompare(right.name);

function sectionLinks(config, except) {
  return Object.entries(SECTIONS)
    .filter(([key]) => key !== except)
    .map(([key, section]) => ({ name: `${config.label} ${section.label.toLowerCase()}`, path: `${config.hub}/${key}` }));
}

function otherHub(config) {
  const other = config.sport === "basketball" ? SPORTS.football : SPORTS.basketball;
  return { name: `${other.label} scores`, path: other.hub };
}

function teamLinks(config) {
  return [...sportIndex(config.sport).teams.values()]
    .map((team) => ({ name: team.name, path: `${config.hub}/team/${team.key}` }))
    .sort(byName);
}

function playerLinks(config, except) {
  return [...sportIndex(config.sport).players.values()]
    .filter((player) => player.key !== except)
    .map((player) => ({ name: player.name, path: `${config.hub}/player/${player.key}` }));
}

const hubCrumb = (config) => ({ name: config.label, path: config.hub });

function notFound(config, what) {
  const hub = config ?? SPORTS.basketball;
  return {
    kind: "not-found",
    sport: config?.sport ?? null,
    path: hub.hub,
    title: `${what} not found — ${hub.label} on Hyper`,
    heading: `${what} not found`,
    description: `This ${what.toLowerCase()} is not on the ${hub.noun} board. Browse live ${hub.noun} scores, fixtures and standings instead.`,
    keywords: [],
    index: false,
    status: 404,
    crumbs: [hubCrumb(hub)],
    links: [{ name: `${hub.label} scores`, path: hub.hub }, otherHub(hub)],
    entity: null,
  };
}

function hubMeta(config) {
  const copy = HUBS[config.sport];
  return {
    kind: "hub",
    sport: config.sport,
    path: config.hub,
    ...copy,
    index: true,
    status: 200,
    crumbs: [hubCrumb(config)],
    links: [...sectionLinks(config), otherHub(config), ...teamLinks(config), ...playerLinks(config)],
    entity: null,
  };
}

function sectionMeta(config, key) {
  const copy = SECTIONS[key][config.sport];
  const path = `${config.hub}/${key}`;
  return {
    kind: "section",
    sport: config.sport,
    path,
    ...copy,
    index: true,
    status: 200,
    crumbs: [hubCrumb(config), { name: SECTIONS[key].label, path }],
    links: [{ name: `${config.label} scores`, path: config.hub }, ...sectionLinks(config, key), otherHub(config)],
    entity: null,
  };
}

/**
 * Can this team's page show the team's real schedule and squad?
 *
 * The team screen asks ESPN for them through the team's competition. A team
 * from a competition with no ESPN feed (the Basketball Africa League, Liga ACB…)
 * can only ever show the bundled sample fixtures, and a page of sample scores is
 * not one to offer a search engine.
 */
export function teamHasFeed(sport, team) {
  if (!team) return false;
  if (team.league) return true;
  const competitionId = team.competitionId ?? "";
  return Object.hasOwn(feedsOf(sport), competitionId) || Object.hasOwn(FLAGSHIP_PHASES[sport], competitionId);
}

/** The same question for a player: the profile loads by ESPN athlete id. */
export function playerHasFeed(player) {
  return Boolean(player?.espnId);
}

function teamMeta(config, key, live) {
  const team = findTeam(sportIndex(config.sport).teams, key);
  if (!team) return notFound(config, "Team");
  // A team answers to its code and its ESPN id as well as its name; one URL is
  // the page, the others point at it.
  const path = `${config.hub}/team/${team.key}`;
  const name = live?.name || team.name;
  const game = config.sport === "basketball" ? "basketball" : "football";
  const competition = feedsOf(config.sport)[team.competitionId]
    ?? (Object.hasOwn(FLAGSHIP_PHASES[config.sport], team.competitionId ?? "") ? config.label : null)
    ?? team.competition
    ?? (team.group ? String(team.group).split(" · ")[0] : null);
  return {
    kind: "team",
    sport: config.sport,
    path,
    title: `${name} — Scores, Fixtures, Squad & Standings`,
    heading: name,
    description: `${name} ${game} scores, latest results, upcoming fixtures, squad and league standing${competition ? ` in the ${competition}` : ""}, on Hyper Sports.`,
    keywords: [name, `${name} scores`, `${name} fixtures`, `${name} squad`, `${name} standings`, ...(competition ? [competition] : []), `${config.label} scores`],
    index: teamHasFeed(config.sport, team),
    status: 200,
    crumbs: [hubCrumb(config), { name, path }],
    links: [
      { name: `${config.label} scores`, path: config.hub },
      ...sectionLinks(config),
      ...[...sportIndex(config.sport).players.values()]
        .filter((player) => player.team === team.name)
        .map((player) => ({ name: player.name, path: `${config.hub}/player/${player.key}` })),
    ],
    entity: { type: "team", name, competition },
  };
}

function playerMeta(config, key, live) {
  const { players, teams } = sportIndex(config.sport);
  const player = findPlayer(players, key);
  if (!player) return notFound(config, "Player");
  const path = `${config.hub}/player/${player.key}`;
  const name = live?.name || player.name;
  const team = player.team ? findTeam(teams, slugify(player.team)) : null;
  const teamPath = team ? `${config.hub}/team/${team.key}` : null;
  return {
    kind: "player",
    sport: config.sport,
    path,
    title: `${name} — Season Stats & Player Profile`,
    heading: name,
    // The bundled leaders carry a team and a figure from a sample season, so
    // neither is repeated here as though it were current.
    description: `${name} ${config.noun} player profile: season statistics by category and the rest of the ${config.noun} leaders board, on Hyper Sports.`,
    keywords: [name, `${name} stats`, `${name} season stats`, `${config.label} stat leaders`],
    // Without an ESPN athlete id the profile cannot load, and the page shows
    // only the sample figure.
    index: playerHasFeed(player),
    status: 200,
    crumbs: [hubCrumb(config), ...(team ? [{ name: team.name, path: teamPath }] : []), { name, path }],
    links: [
      { name: `${config.label} scores`, path: config.hub },
      ...(team ? [{ name: team.name, path: teamPath }] : []),
      { name: `${config.label} top scorers`, path: `${config.hub}/top-scorers` },
      ...playerLinks(config, player.key),
    ],
    entity: { type: "player", name },
  };
}

function matchMeta(config, id, search, live) {
  const feeds = feedsOf(config.sport);
  const phases = FLAGSHIP_PHASES[config.sport];
  const requested = new URLSearchParams(search || "").get("competition") ?? "";
  const sample = config.games.find((game) => String(game.id) === String(id)) ?? null;
  if (!sample && !ESPN_EVENT_ID.test(String(id))) return notFound(config, "Match");

  // The match screen reads the feed its competition names and the flagship feed
  // for anything it does not recognise. So only a competition with a feed of its
  // own is part of the address; the flagship, its phases and an unknown value
  // are all the same page as the bare URL.
  const own = Object.hasOwn(feeds, requested);
  const competitionId = own && requested !== config.flagship ? requested : null;
  // The other sport's competition would load the other sport's game here.
  const foreign = !own && Object.hasOwn(feedsOf(otherSport(config.sport)), requested);
  const path = `${config.hub}/match/${id}${competitionId ? `?competition=${competitionId}` : ""}`;
  const competition = live?.competition
    || sample?.competition
    || phases[requested]
    || feeds[competitionId ?? config.flagship];

  const home = live?.home || sample?.home || null;
  const away = live?.away || sample?.away || null;
  const fixture = home && away ? `${home} vs ${away}` : null;
  const subject = fixture ?? `${competition} game ${id}`;
  // Indexable when it can be a real fixture: not one of the bundled sample
  // games, not another sport's competition, and not a game ESPN has already said
  // it does not know.
  const index = !sample && !foreign && !live?.notFound;
  return {
    kind: "match",
    sport: config.sport,
    path,
    title: `${fixture ?? `${competition} Game ${id}`} — Live Score & Play-by-Play`,
    heading: subject,
    description: `${subject}: live score, scoring by period, box score, team statistics and play-by-play commentary${fixture ? ` from the ${competition}` : ""}, on Hyper Sports.`,
    keywords: [...(fixture ? [fixture, home, away] : []), `${competition} live score`, "box score", "play-by-play", `${config.label} scores`],
    index,
    status: 200,
    crumbs: [hubCrumb(config), { name: subject, path }],
    links: [{ name: `${config.label} scores`, path: config.hub }, ...sectionLinks(config)],
    entity: { type: "match", name: fixture, home, away, competition, sample: Boolean(sample) },
  };
}

function comingSoonMeta(segment) {
  const sport = COMING_SOON[segment];
  return {
    kind: "coming-soon",
    sport: null,
    path: `/${segment}`,
    title: `${sport} Scores — Coming Soon to Hyper Sports`,
    heading: `${sport} coverage is coming soon`,
    description: `${sport} scores are not on Hyper Sports yet. Basketball and NFL live scores, fixtures and standings are available now.`,
    keywords: [],
    // A page that only says "not yet" is not worth a place in an index.
    index: false,
    status: 200,
    crumbs: [{ name: sport, path: `/${segment}` }],
    links: [{ name: "Basketball scores", path: SPORTS.basketball.hub }, { name: "NFL scores", path: SPORTS.football.hub }],
    entity: null,
  };
}

/**
 * Resolve one dashboard URL.
 *
 * @param {string} pathname  path relative to the router base
 * @param {string} [search]  the query string, with or without its "?"
 * @param {object|null} [live]  what the screen has learned since it opened:
 *   `{ name }` for a team or player, `{ home, away, competition }` for a match,
 *   `{ notFound: true }` when ESPN has no such game
 */
export function routeMeta(pathname, search = "", live = null) {
  const segments = String(pathname ?? "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  // The entry URL shows the basketball hub, so it is the basketball hub.
  if (!segments.length) return { ...hubMeta(SPORTS.basketball), kind: "redirect" };

  const [first, second, third, ...rest] = segments;
  if (COMING_SOON[first] && segments.length === 1) return comingSoonMeta(first);

  const config = SPORTS[SPORT_BY_SEGMENT[first]];
  if (!config) return notFound(null, "Page");
  if (!second) return hubMeta(config);
  if (rest.length) return notFound(config, "Page");
  if (SECTIONS[second] && !third) return sectionMeta(config, second);
  if (second === "team" && third) return teamMeta(config, third, live);
  if (second === "player" && third) return playerMeta(config, third, live);
  if (second === "match" && third) return matchMeta(config, third, search, live);
  return notFound(config, "Page");
}

/** Every URL that is a page in its own right, for a host's sitemap. */
export function indexableRoutes() {
  const routes = [];
  Object.values(SPORTS).forEach((config) => {
    routes.push({ kind: "hub", sport: config.sport, path: config.hub });
    Object.keys(SECTIONS).forEach((key) => routes.push({ kind: "section", sport: config.sport, path: `${config.hub}/${key}` }));
    const { teams, players } = sportIndex(config.sport);
    teams.forEach((team) => {
      if (teamHasFeed(config.sport, team)) routes.push({ kind: "team", sport: config.sport, path: `${config.hub}/team/${team.key}` });
    });
    players.forEach((player) => {
      if (playerHasFeed(player)) routes.push({ kind: "player", sport: config.sport, path: `${config.hub}/player/${player.key}` });
    });
  });
  return routes;
}

/** The browser-tab and search-result title: the page's own, then the site's name. */
export function documentTitle(meta) {
  return /\bHyper\b/.test(meta.title) ? meta.title : `${meta.title} | Hyper`;
}

export const SPORT_LABELS = Object.fromEntries(
  Object.values(SPORTS).map((config) => [config.sport, { label: config.label, hub: config.hub, schemaSport: config.schemaSport }])
);
