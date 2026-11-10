/**
 * Search metadata for the standalone Basketball & NFL dashboard.
 *
 * The dashboard is a client-rendered SPA, so every route serves the same
 * document. These definitions let the route handlers under
 * `src/app/nfl-basketball/**` inject a distinct title, description, canonical,
 * keyword set and structured data per competition, team, player and match, so
 * each dashboard URL is a real, indexable page rather than a duplicate shell.
 *
 * Keywords are derived from the dashboard's own competition, team and player
 * data, which is the same data the pages render.
 */
import { getSiteUrl } from './site-url';
import { slugify } from '../../vendor/nfl-nba/src/utils/entities';
import {
  basketballCompetitions,
  nflCompetitions,
  basketballGames,
  nflGames,
  ncaaBasketballStandings,
  ncaaWomenStandings,
  nflStandings,
  collegeFootballStandings,
  basketballLeaders,
  nflLeaders,
} from '../../vendor/nfl-nba/src/data/sportsData';

export const DASHBOARD_ROOT = '/nfl-basketball';
export const DASHBOARD_BASKETBALL = `${DASHBOARD_ROOT}/basketball`;
export const DASHBOARD_NFL = `${DASHBOARD_ROOT}/nfl`;

type Row = { team?: string; name?: string };

/** Every competition the dashboard can show, basketball first. */
export const DASHBOARD_COMPETITIONS: string[] = [
  ...(basketballCompetitions as { name: string }[]).map((entry) => entry.name),
  ...(nflCompetitions as { name: string }[]).map((entry) => entry.name),
  'NBA', 'WNBA', 'NBA G League', 'EuroLeague', 'NCAA Men’s Basketball', 'NCAA Women’s Basketball',
];

const standingsTeams = (tables: unknown[]) => tables
  .flatMap((group) => ((group as { rows?: Row[] }).rows ?? (group as { teams?: Row[] }).teams ?? []))
  .map((row) => row.team ?? row.name)
  .filter((name): name is string => Boolean(name));

const fixtureTeams = (games: unknown[]) => games
  .flatMap((game) => [(game as { home?: string; homeTeam?: string }).home ?? (game as { homeTeam?: string }).homeTeam, (game as { away?: string; awayTeam?: string }).away ?? (game as { awayTeam?: string }).awayTeam])
  .filter((name): name is string => Boolean(name));

/** Basketball teams the dashboard shows: NCAA standings and the fixture list. */
export const DASHBOARD_BASKETBALL_TEAMS: string[] = [...new Set([
  ...standingsTeams([...ncaaBasketballStandings, ...ncaaWomenStandings]),
  ...fixtureTeams(basketballGames as unknown[]),
])];

/** NFL teams the dashboard shows: NFL standings and the fixture list. */
export const DASHBOARD_NFL_TEAMS: string[] = [...new Set([
  ...standingsTeams([...nflStandings, ...collegeFootballStandings]),
  ...fixtureTeams(nflGames as unknown[]),
])];

/** Every team across both sports, used for the shared keyword lists. */
export const DASHBOARD_TEAMS: string[] = [...new Set([...DASHBOARD_BASKETBALL_TEAMS, ...DASHBOARD_NFL_TEAMS])];

/**
 * Player names taken from the dashboard's leaderboards. The data exposes the
 * rows either directly or wrapped in a `leaders` group, so both shapes are read.
 */
const leaderNames = (entries: unknown[]): string[] => entries.flatMap((entry) => {
  const rows = Array.isArray(entry) ? entry : ((entry as { leaders?: unknown[] }).leaders ?? [entry as unknown]);
  return (rows as { player?: string; playerName?: string; name?: string }[]).map(
    (row) => row.player ?? row.playerName ?? row.name,
  ) as string[];
}).filter((name): name is string => Boolean(name));

/** Players the dashboard shows, per sport. */
export const DASHBOARD_BASKETBALL_PLAYERS: string[] = leaderNames(basketballLeaders as unknown[]);
export const DASHBOARD_NFL_PLAYERS: string[] = leaderNames(nflLeaders as unknown[]);

export const DASHBOARD_PLAYERS: string[] = [...new Set([...DASHBOARD_BASKETBALL_PLAYERS, ...DASHBOARD_NFL_PLAYERS])];

const GENERIC_KEYWORDS = [
  'live sports scores', 'sports scores today', 'fixtures', 'results', 'standings',
  'basketball scores', 'NBA scores', 'WNBA scores', 'NCAA basketball scores', 'college basketball',
  'NFL scores', 'American football scores', 'box score', 'top scorers', 'sports news',
  'ESPN scores', 'Hyper sports',
];

/** The full keyword set shared by the dashboard's hub pages. */
export const DASHBOARD_KEYWORDS: string[] = [...new Set([
  ...GENERIC_KEYWORDS, ...DASHBOARD_COMPETITIONS, ...DASHBOARD_TEAMS, ...DASHBOARD_PLAYERS,
])];

const bySlug = (values: string[]) => new Map(values.map((value) => [slugify(value), value]));
const TEAM_BY_KEY: Record<'basketball' | 'football', Map<string, string>> = {
  basketball: bySlug(DASHBOARD_BASKETBALL_TEAMS),
  football: bySlug(DASHBOARD_NFL_TEAMS),
};
const PLAYER_BY_KEY: Record<'basketball' | 'football', Map<string, string>> = {
  basketball: bySlug(DASHBOARD_BASKETBALL_PLAYERS),
  football: bySlug(DASHBOARD_NFL_PLAYERS),
};
const COMPETITION_BY_KEY = bySlug(DASHBOARD_COMPETITIONS);

export type DashboardSeo = {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  index: boolean;
  jsonLd: unknown[];
};

const origin = () => getSiteUrl();
const absolute = (path: string) => new URL(path, origin()).toString();

const breadcrumb = (trail: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((entry, index) => ({
    '@type': 'ListItem', position: index + 1, name: entry.name, item: absolute(entry.path),
  })),
});

const webPage = (path: string, name: string, description: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name,
  description,
  url: absolute(path),
  isPartOf: { '@type': 'WebSite', name: 'Hyper', url: origin() },
});

const hubSeo = (
  path: string,
  name: string,
  description: string,
  extraKeywords: string[],
): DashboardSeo => ({
  title: name,
  description,
  keywords: [...new Set([...extraKeywords, ...DASHBOARD_KEYWORDS])].join(', '),
  canonical: absolute(path),
  index: true,
  jsonLd: [
    webPage(path, name, description),
    breadcrumb([{ name: 'Hyper', path: '/' }, { name, path }]),
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${name} competitions`,
      itemListElement: extraKeywords.slice(0, 20).map((entry, index) => ({ '@type': 'ListItem', position: index + 1, name: entry })),
    },
  ],
});

const BASKETBALL_HUB = hubSeo(
  DASHBOARD_BASKETBALL,
  'Basketball Scores — NBA, WNBA, EuroLeague & NCAA Live Scores',
  'Live basketball scores, fixtures, standings and top scorers for the NBA, WNBA, EuroLeague, NBL and NCAA Division I men’s and women’s college basketball, powered by ESPN.',
  DASHBOARD_COMPETITIONS.filter((name) => !/NFL|football/i.test(name)),
);

const NFL_HUB = hubSeo(
  DASHBOARD_NFL,
  'NFL Scores — Live American Football Scores, Standings & Fixtures',
  'Live NFL scores, fixtures, conference standings and top scorers for every NFL team and college football programme, powered by ESPN.',
  [...DASHBOARD_COMPETITIONS.filter((name) => /NFL|football/i.test(name)), ...DASHBOARD_TEAMS.filter((team) => /Chiefs|Eagles|49ers|Cowboys|Bills|Ravens|Lions|Packers/i.test(team))],
);

const SUB_PAGES: Record<string, { label: string; kind: string }> = {
  upcoming: { label: 'Upcoming fixtures', kind: 'fixtures' },
  'top-scorers': { label: 'Top scorers', kind: 'leaders' },
  news: { label: 'News', kind: 'news' },
};

const subPageSeo = (path: string, hub: DashboardSeo, sport: 'basketball' | 'football', page: string) => {
  const info = SUB_PAGES[page];
  const sportLabel = sport === 'basketball' ? 'Basketball' : 'NFL';
  const name = `${sportLabel} ${info.label} — Hyper Sports`;
  const description = sport === 'basketball'
    ? `${info.label} for NBA, WNBA, EuroLeague, NBL and NCAA Division I basketball, with tip-off times, live scores and player stats from ESPN.`
    : `${info.label} for the NFL and college football, with kick-off times, live scores and player stats from ESPN.`;
  return {
    ...hub,
    title: name,
    description,
    canonical: absolute(path),
    jsonLd: [webPage(path, name, description), breadcrumb([{ name: 'Hyper', path: '/' }, { name: sport === 'basketball' ? 'Basketball' : 'NFL', path: hub.canonical.replace(origin(), '') }, { name: info.label, path }])],
  };
};

const teamSeo = (path: string, key: string, sport: 'basketball' | 'football', hub: DashboardSeo): DashboardSeo => {
  const team = TEAM_BY_KEY[sport].get(key);
  // A team that does not belong to this sport has no page here: the SPA falls
  // back to its hub, so the SEO does too instead of inventing a thin page.
  if (!team) return hub;
  const name = `${team} — Scores, Roster, Stats & Fixtures`;
  const sportLabel = sport === 'basketball' ? 'basketball' : 'NFL football';
  const description = `${team} ${sportLabel} scores, latest results, upcoming fixtures, roster, reported player statistics and standings on Hyper Sports.`;
  return {
    title: name,
    description,
    keywords: [...new Set([team, ...DASHBOARD_KEYWORDS])].join(', '),
    canonical: absolute(path),
    index: true,
    jsonLd: [
      webPage(path, name, description),
      breadcrumb([{ name: 'Hyper', path: '/' }, { name: sport === 'basketball' ? 'Basketball' : 'NFL', path: sport === 'basketball' ? DASHBOARD_BASKETBALL : DASHBOARD_NFL }, { name: team, path }]),
      { '@context': 'https://schema.org', '@type': 'SportsTeam', name: team, sport: sport === 'basketball' ? 'Basketball' : 'American football', url: absolute(path) },
    ],
  };
};

const playerSeo = (path: string, key: string, sport: 'basketball' | 'football', hub: DashboardSeo): DashboardSeo => {
  const player = PLAYER_BY_KEY[sport].get(key);
  if (!player) return hub;
  const name = `${player} — Player Stats, News & Fixtures`;
  const sportLabel = sport === 'basketball' ? 'basketball' : 'NFL';
  const description = `${player} ${sportLabel} player profile: season statistics, recent performances, team fixtures and news on Hyper Sports.`;
  return {
    title: name,
    description,
    keywords: [...new Set([player, ...DASHBOARD_KEYWORDS])].join(', '),
    canonical: absolute(path),
    index: true,
    jsonLd: [
      webPage(path, name, description),
      { '@context': 'https://schema.org', '@type': 'Athlete', name: player, sport: sport === 'basketball' ? 'Basketball' : 'American football', url: absolute(path) },
    ],
  };
};

const matchSeo = (path: string, matchId: string, sport: 'basketball' | 'football'): DashboardSeo => {
  const sportLabel = sport === 'basketball' ? 'Basketball' : 'NFL';
  const name = `${sportLabel} Match ${matchId} — Live Score, Box Score & Play-by-Play`;
  const description = `Live score, period-by-period scoring, box score, team statistics and play-by-play commentary for ${sportLabel.toLowerCase()} match ${matchId} on Hyper Sports.`;
  return {
    title: name,
    description,
    keywords: [...new Set([`${sportLabel} match ${matchId}`, 'live score', 'box score', 'play-by-play', ...DASHBOARD_KEYWORDS])].join(', '),
    canonical: absolute(path),
    index: true,
    jsonLd: [
      webPage(path, name, description),
      { '@context': 'https://schema.org', '@type': 'SportsEvent', name, url: absolute(path), sport: sport === 'basketball' ? 'Basketball' : 'American football' },
    ],
  };
};

/** Fallback for routes the dashboard does not define (it redirects to a hub). */
const HOMEPAGE_DESCRIPTION = 'Live basketball and NFL scores, fixtures, standings, top scorers and news from ESPN on Hyper.';
const HOMEPAGE: DashboardSeo = {
  title: 'Basketball & NFL Scores — Hyper Sports Dashboard',
  description: HOMEPAGE_DESCRIPTION,
  keywords: DASHBOARD_KEYWORDS.join(', '),
  canonical: absolute(DASHBOARD_BASKETBALL),
  index: true,
  jsonLd: [webPage(DASHBOARD_ROOT, 'Basketball & NFL Scores — Hyper Sports Dashboard', HOMEPAGE_DESCRIPTION)],
};

/** Resolve the SEO for any dashboard URL. Unknown routes canonicalise to a hub. */
export function dashboardSeoFor(pathname: string): DashboardSeo {
  const path = pathname.replace(/\/+$/, '') || DASHBOARD_ROOT;
  if (path === DASHBOARD_ROOT) return { ...HOMEPAGE, jsonLd: [webPage(DASHBOARD_ROOT, HOMEPAGE.title, HOMEPAGE.description), breadcrumb([{ name: 'Hyper', path: '/' }, { name: 'Basketball & NFL', path: DASHBOARD_ROOT }])] };
  const match = path.match(/^\/nfl-basketball\/(basketball|nfl)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (!match) return HOMEPAGE;
  const [, routeSport, first, second] = match;
  // The dashboard's football routes are named /nfl, the data calls them football.
  const sport: 'basketball' | 'football' = routeSport === 'nfl' ? 'football' : 'basketball';
  const hub = sport === 'basketball' ? BASKETBALL_HUB : NFL_HUB;
  if (!first) return hub;
  if (SUB_PAGES[first]) return subPageSeo(path, hub, sport, first);
  if (first === 'team' && second) return teamSeo(path, second, sport, hub);
  if (first === 'player' && second) return playerSeo(path, second, sport, hub);
  if (first === 'match' && second) return matchSeo(path, second, sport);
  return HOMEPAGE;
}

/** Dashboard URLs worth listing in sitemap.xml. */
export function dashboardSitemapRoutes(): { path: string; changeFrequency: 'hourly' | 'daily'; priority: number }[] {
  const routes: { path: string; changeFrequency: 'hourly' | 'daily'; priority: number }[] = [
    { path: DASHBOARD_BASKETBALL, changeFrequency: 'hourly', priority: 0.8 },
    { path: DASHBOARD_NFL, changeFrequency: 'hourly', priority: 0.8 },
  ];
  for (const sport of ['basketball', 'nfl']) {
    for (const page of Object.keys(SUB_PAGES)) {
      routes.push({ path: `${DASHBOARD_ROOT}/${sport}/${page}`, changeFrequency: 'hourly', priority: 0.6 });
    }
  }
  for (const team of DASHBOARD_BASKETBALL_TEAMS) {
    routes.push({ path: `${DASHBOARD_BASKETBALL}/team/${slugify(team)}`, changeFrequency: 'daily', priority: 0.5 });
  }
  for (const team of DASHBOARD_NFL_TEAMS) {
    routes.push({ path: `${DASHBOARD_NFL}/team/${slugify(team)}`, changeFrequency: 'daily', priority: 0.5 });
  }
  for (const player of DASHBOARD_BASKETBALL_PLAYERS) {
    routes.push({ path: `${DASHBOARD_BASKETBALL}/player/${slugify(player)}`, changeFrequency: 'daily', priority: 0.5 });
  }
  for (const player of DASHBOARD_NFL_PLAYERS) {
    routes.push({ path: `${DASHBOARD_NFL}/player/${slugify(player)}`, changeFrequency: 'daily', priority: 0.5 });
  }
  return routes;
}
