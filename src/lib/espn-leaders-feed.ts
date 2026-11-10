/**
 * Server-side leaders feed for the homepage leaders board.
 *
 * Follows the same shape as the other Hyper Sports feeds (`espn-standings-feed`,
 * `espn-insights-feed`): a short-lived cache, an in-flight guard so concurrent
 * renders share one request, and a bundled fallback when ESPN does not answer.
 * A failure here must never break the homepage, so errors resolve to an
 * `unavailable` board instead of rejecting.
 */
import { basketballLeaders, nflLeaders } from '../../vendor/nfl-nba/src/data/sportsData';
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails } from './espn-endpoints';
import { normalizeLeaders, type SportsLeaderBoard, type SportsLeaderRow, type SportsLeaderSport } from './espn-leaders';
import { bundledTopScorers, normalizeTopScorers, type SportsTopScorerBoard } from './sports-top-scorers';

const LEADERS_URL: Record<SportsLeaderSport, string> = {
  basketball: 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/leaders',
  football: 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/leaders',
};

const cache = new Map<string, { at: number; board: SportsLeaderBoard }>();
const pending = new Map<string, Promise<SportsLeaderBoard>>();
const LIVE_TTL = 15 * 60_000;
const FAILURE_TTL = 60_000;

const slugify = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2)
  .map((part) => part[0]?.toUpperCase() ?? '').join('');

/** The dashboard's bundled leaderboard, used when ESPN is unreachable. */
const bundledRows = (sport: SportsLeaderSport): SportsLeaderRow[] => {
  const leaders = (sport === 'football' ? nflLeaders : basketballLeaders) as unknown as {
    name: string; team?: string; metric?: string; value?: string; initials?: string; position?: string; teamAbbr?: string;
  }[];
  return leaders.slice(0, 6).map((player) => ({
    key: slugify(player.name),
    name: player.name,
    team: player.team ?? '—',
    teamAbbr: player.teamAbbr ?? null,
    teamLogo: null,
    position: player.position ?? null,
    metric: player.metric ?? 'Season leaders',
    value: String(player.value ?? '—'),
    initials: player.initials ?? initials(player.name),
    headshot: null,
    jersey: null,
  }));
};

async function fetchLeaders(sport: SportsLeaderSport): Promise<SportsLeaderBoard> {
  const url = LEADERS_URL[sport];
  const signal = AbortSignal.timeout(6000);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, undefined);
    const rows = normalizeLeaders(await response.json(), sport);
    if (!rows.length) throw new EspnEndpointError('ESPN returned no leader lists', url, 'invalid-response', httpStatus, undefined);
    return { sport, league: sport === 'football' ? 'nfl' : 'nba', rows, status: 'live', source: { ok: true, url, httpStatus } };
  } catch (error) {
    const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(
      httpStatus !== null && !signal.aborted ? 'ESPN returned an invalid leaders response' : espnErrorMessage(error),
      url, signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus,
    );
    return {
      sport, league: sport === 'football' ? 'nfl' : 'nba', rows: bundledRows(sport), status: 'unavailable',
      source: { ok: false, ...espnFailureDetails(failure, url) },
    };
  }
}

/** Cached leaders for one sport; concurrent callers share a single request. */
export function getSportsLeaders(sport: SportsLeaderSport, refresh = false): Promise<SportsLeaderBoard> {
  const saved = cache.get(sport);
  const ttl = saved?.board.status === 'live' ? LIVE_TTL : FAILURE_TTL;
  if (!refresh && saved && Date.now() - saved.at < ttl) return Promise.resolve(saved.board);
  const active = pending.get(sport);
  if (active) return active;
  const job = fetchLeaders(sport).then((board) => {
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(sport, { at: Date.now(), board });
    return board;
  }).finally(() => pending.delete(sport));
  pending.set(sport, job);
  return job;
}

/** Both sports at once, so the homepage renders one board per tab. */
export async function getSportsLeaderBoards(refresh = false): Promise<Record<SportsLeaderSport, SportsLeaderBoard>> {
  const [basketball, football] = await Promise.all([getSportsLeaders('basketball', refresh), getSportsLeaders('football', refresh)]);
  return { basketball, football };
}

const topScorerCache = new Map<string, { at: number; board: SportsTopScorerBoard }>();
const topScorerPending = new Map<string, Promise<SportsTopScorerBoard>>();

async function fetchTopScorers(sport: SportsLeaderSport): Promise<SportsTopScorerBoard> {
  const url = LEADERS_URL[sport];
  const signal = AbortSignal.timeout(6000);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, undefined);
    const groups = normalizeTopScorers(await response.json(), sport);
    if (!groups.length) throw new EspnEndpointError('ESPN returned no leader lists', url, 'invalid-response', httpStatus, undefined);
    return { sport, league: sport === 'football' ? 'nfl' : 'nba', groups, status: 'live', source: { ok: true, url, httpStatus } };
  } catch (error) {
    const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(
      httpStatus !== null && !signal.aborted ? 'ESPN returned an invalid leaders response' : espnErrorMessage(error),
      url, signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus,
    );
    return {
      sport, league: sport === 'football' ? 'nfl' : 'nba', groups: bundledTopScorers(sport), status: 'unavailable',
      source: { ok: false, ...espnFailureDetails(failure, url) },
    };
  }
}

/** Cached full top-scorer board for one sport; concurrent callers share a request. */
export function getSportsTopScorers(sport: SportsLeaderSport, refresh = false): Promise<SportsTopScorerBoard> {
  const saved = topScorerCache.get(sport);
  const ttl = saved?.board.status === 'live' ? LIVE_TTL : FAILURE_TTL;
  if (!refresh && saved && Date.now() - saved.at < ttl) return Promise.resolve(saved.board);
  const active = topScorerPending.get(sport);
  if (active) return active;
  const job = fetchTopScorers(sport).then((board) => {
    if (topScorerCache.size >= 20) topScorerCache.delete(topScorerCache.keys().next().value!);
    topScorerCache.set(sport, { at: Date.now(), board });
    return board;
  }).finally(() => topScorerPending.delete(sport));
  topScorerPending.set(sport, job);
  return job;
}

/** Both sports at once, for the discovery page's top-scorer section. */
export async function getSportsTopScorerBoards(refresh = false): Promise<Record<SportsLeaderSport, SportsTopScorerBoard>> {
  const [basketball, football] = await Promise.all([getSportsTopScorers('basketball', refresh), getSportsTopScorers('football', refresh)]);
  return { basketball, football };
}
