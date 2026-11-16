/**
 * Search metadata for the standalone Basketball & NFL dashboard.
 *
 * The dashboard is a client-rendered SPA, so every route is served from one
 * built document. What each URL *is* — title, description, canonical address,
 * heading, breadcrumb, onward links and whether it deserves a place in an index
 * — is defined once, in the dashboard itself (`vendor/nfl-nba/src/seo/
 * routeMeta.js`), and the app applies the same definition on every client-side
 * navigation. This module turns that definition into what a server response
 * needs: absolute URLs on the public origin, structured data, sharing tags and
 * an HTTP status.
 *
 * Three rules decide indexing, and they are the dashboard's, not this file's:
 *
 * - A URL the app has no screen for (an unknown team, a malformed match id, a
 *   path it would bounce to a hub) is a 404, not a second copy of the hub.
 * - A page that can only ever show the bundled sample data — a sample fixture,
 *   a team from a competition with no ESPN feed, a player with no ESPN id — is
 *   served, and kept out of the index.
 * - Everything else is indexable and names itself as its own canonical, with
 *   alias addresses (a team's code, a match's redundant `?competition=`)
 *   pointing at the one address that is the page.
 */
import { getSiteUrl, isPreviewDeployment } from './site-url';
import { documentTitle, indexableRoutes, routeMeta, sportIndex, SPORT_LABELS, teamHasFeed, type RouteMeta } from '../../vendor/nfl-nba/src/seo/routeMeta';
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

/* ── Name lists ─────────────────────────────────────────────────────────────
 * Competition, team and player names from the dashboard's data. They feed the
 * keyword lists of the homepage, About and Sports pages (`sports-keywords.ts`),
 * which is why their contents and order are left exactly as they were. The
 * dashboard's own pages no longer carry them: see `keywords` below.
 */

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

/** Basketball team names: NCAA standings and the fixture list. */
export const DASHBOARD_BASKETBALL_TEAMS: string[] = [...new Set([
  ...standingsTeams([...ncaaBasketballStandings, ...ncaaWomenStandings]),
  ...fixtureTeams(basketballGames as unknown[]),
])];

/** NFL team names: NFL standings and the fixture list. */
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

/** The full keyword set, for the site pages that summarise all sports coverage. */
export const DASHBOARD_KEYWORDS: string[] = [...new Set([
  ...GENERIC_KEYWORDS, ...DASHBOARD_COMPETITIONS, ...DASHBOARD_TEAMS, ...DASHBOARD_PLAYERS,
])];

/* ── Per-route metadata ───────────────────────────────────────────────────── */

export type DashboardLink = { name: string; href: string };

export type DashboardSeo = {
  kind: RouteMeta['kind'];
  /** The document title, with the site's name. */
  title: string;
  description: string;
  /** A short, page-specific list. Empty for pages that are not indexed. */
  keywords: string;
  /**
   * The one address that is this page, on the public origin — or null when the
   * URL is no page at all, because a 404 that names a canonical contradicts
   * itself.
   */
  canonical: string | null;
  /** The same address as a site path, query included. */
  path: string;
  index: boolean;
  status: 200 | 404;
  /** The page's headline, for the content the document carries before the app starts. */
  heading: string;
  /** Breadcrumb trail from the site's homepage to this page. */
  crumbs: DashboardLink[];
  /** Where a reader, or a crawler, goes from here. */
  links: DashboardLink[];
  image: { url: string; width: number; height: number; alt: string };
  jsonLd: unknown[];
};

const origin = () => getSiteUrl();
const absolute = (path: string) => new URL(path, origin()).toString();
const sitePath = (dashboardPath: string) => `${DASHBOARD_ROOT}${dashboardPath}`;

/** Links a crawler is shown on one page. A hub lists every team; nothing lists more. */
const MAX_LINKS = 80;

const breadcrumbList = (crumbs: DashboardLink[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((entry, index) => ({
    '@type': 'ListItem', position: index + 1, name: entry.name, item: absolute(entry.href),
  })),
});

const webPage = (type: 'WebPage' | 'CollectionPage' | 'ProfilePage', url: string, name: string, description: string, image: string, mainEntity?: string) => ({
  '@context': 'https://schema.org',
  '@type': type,
  '@id': `${url}#webpage`,
  url,
  name,
  description,
  inLanguage: 'en',
  isPartOf: { '@type': 'WebSite', name: 'Hyper', url: `${origin()}/` },
  primaryImageOfPage: { '@type': 'ImageObject', url: image },
  ...(mainEntity ? { mainEntity: { '@id': mainEntity } } : {}),
});

/**
 * Structured data for a page that is indexed. Only what the server knows to be
 * true goes in: a team's name, sport and league; a hub's list of team pages. A
 * match is described as a page and a breadcrumb and nothing more — a
 * `SportsEvent` needs a start time and two competitors, and the server has
 * neither until the app has asked ESPN.
 */
function structuredData(meta: RouteMeta, url: string, crumbs: DashboardLink[], image: string): unknown[] {
  const sport = meta.sport ? SPORT_LABELS[meta.sport].schemaSport : null;
  const trail = breadcrumbList(crumbs);
  if ((meta.kind === 'hub' || meta.kind === 'redirect') && meta.sport) {
    const hubSport = meta.sport;
    const config = SPORT_LABELS[hubSport];
    const teams = [...sportIndex(hubSport).teams.values()].filter((team) => teamHasFeed(hubSport, team));
    return [
      webPage('CollectionPage', url, meta.heading, meta.description, image, `${url}#teams`),
      trail,
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        '@id': `${url}#teams`,
        name: `${meta.sport === 'basketball' ? 'Basketball' : 'NFL'} teams`,
        numberOfItems: teams.length,
        itemListElement: teams.map((team, index) => ({
          '@type': 'ListItem', position: index + 1, name: team.name, url: absolute(sitePath(`${config.hub}/team/${team.key}`)),
        })),
      },
    ];
  }
  if (meta.kind === 'team' && meta.entity) {
    return [
      webPage('WebPage', url, meta.heading, meta.description, image, `${url}#team`),
      trail,
      {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        '@id': `${url}#team`,
        name: meta.entity.name,
        sport,
        url,
        ...(meta.entity.competition ? { memberOf: { '@type': 'SportsOrganization', name: meta.entity.competition } } : {}),
      },
    ];
  }
  if (meta.kind === 'player' && meta.entity) {
    return [
      webPage('ProfilePage', url, meta.heading, meta.description, image, `${url}#player`),
      trail,
      { '@context': 'https://schema.org', '@type': 'Person', '@id': `${url}#player`, name: meta.entity.name, url },
    ];
  }
  return [webPage('WebPage', url, meta.heading, meta.description, image), trail];
}

/**
 * Resolve the SEO for any dashboard URL.
 *
 * @param pathname the request path, site-relative (`/nfl-basketball/…`)
 * @param search   the request's query string; only a match's `competition` can
 *                 be part of the page's address, everything else is dropped
 */
export function dashboardSeoFor(pathname: string, search = ''): DashboardSeo {
  const trimmed = pathname.replace(/\/+$/, '');
  const inside = trimmed === DASHBOARD_ROOT || trimmed.startsWith(`${DASHBOARD_ROOT}/`);
  // Anything outside the dashboard is no dashboard page; the resolver is asked
  // for a path it has no screen for, and answers "not found".
  const meta = routeMeta(inside ? trimmed.slice(DASHBOARD_ROOT.length) : '/-', search);

  const path = sitePath(meta.path);
  const found = meta.status !== 404;
  const url = absolute(path);
  const image = { url: absolute('/og-image.png'), width: 1200, height: 630, alt: meta.heading };
  const crumbs: DashboardLink[] = [
    { name: 'Hyper', href: '/' },
    { name: 'Sports', href: '/sports' },
    ...meta.crumbs.map((crumb) => ({ name: crumb.name, href: sitePath(crumb.path) })),
  ];
  const index = found && meta.index;

  return {
    kind: meta.kind,
    title: documentTitle(meta),
    description: meta.description,
    keywords: index ? [...new Set(meta.keywords)].slice(0, 12).join(', ') : '',
    canonical: found ? url : null,
    path: found ? path : trimmed || DASHBOARD_ROOT,
    index,
    status: found ? 200 : 404,
    heading: meta.heading,
    crumbs,
    links: meta.links.slice(0, MAX_LINKS).map((link) => ({ name: link.name, href: sitePath(link.path) })),
    image,
    jsonLd: index ? structuredData(meta, url, crumbs, image.url) : [],
  };
}

/** What the `X-Robots-Tag` header and the robots meta tag say for one route. */
export function dashboardRobots(seo: Pick<DashboardSeo, 'index'>): string {
  // A preview deployment is never indexed, whatever the page.
  if (isPreviewDeployment()) return 'noindex, nofollow';
  return seo.index ? 'index, follow' : 'noindex, follow';
}

/**
 * Dashboard URLs that are pages in their own right: the two hubs, their
 * sections, and every team and player page that can load real data. Submitted
 * by `dashboardSitemapEntries` in `sitemap-rules.ts`, so the list the sitemap
 * uses is the same list the pages are indexed by.
 */
export function dashboardSitemapRoutes(): { path: string; changeFrequency: 'hourly' | 'daily'; priority: number }[] {
  return indexableRoutes().map((route) => ({
    path: sitePath(route.path),
    changeFrequency: route.kind === 'hub' || route.kind === 'section' ? 'hourly' as const : 'daily' as const,
    priority: route.kind === 'hub' ? 0.8 : route.kind === 'section' ? 0.6 : 0.5,
  }));
}
