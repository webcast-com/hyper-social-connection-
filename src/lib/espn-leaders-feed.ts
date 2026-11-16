/**
 * Server-side leaders feed for the homepage leaders board.
 *
 * Follows the same shape as the other Hyper Sports feeds (`espn-standings-feed`,
 * `espn-insights-feed`): a short-lived cache, an in-flight guard so concurrent
 * renders share one request. There is no bundled fallback: when ESPN does not
 * answer, the board is `unavailable` and carries no players, so nothing a reader
 * sees was invented. A failure here must never break the homepage, so errors
 * resolve to that empty board instead of rejecting.
 */
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails } from './espn-endpoints';
import { leadersUrl, normalizeLeaders, type SportsLeaderBoard, type SportsLeaderSport } from './espn-leaders';
import { normalizeTopScorers, TOP_SCORERS_PER_STAT, type SportsTopScorerBoard } from './sports-top-scorers';

const cache = new Map<string, { at: number; board: SportsLeaderBoard }>();
const pending = new Map<string, Promise<SportsLeaderBoard>>();
const LIVE_TTL = 15 * 60_000;
const FAILURE_TTL = 60_000;

async function fetchLeaders(sport: SportsLeaderSport): Promise<SportsLeaderBoard> {
  // The homepage shows one player per statistic, so it asks for one.
  const url = leadersUrl(sport, 1);
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
      sport, league: sport === 'football' ? 'nfl' : 'nba', rows: [], status: 'unavailable',
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
  const url = leadersUrl(sport, TOP_SCORERS_PER_STAT);
  const signal = AbortSignal.timeout(6000);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, undefined);
    const groups = normalizeTopScorers(await response.json(), sport, TOP_SCORERS_PER_STAT);
    if (!groups.length) throw new EspnEndpointError('ESPN returned no leader lists', url, 'invalid-response', httpStatus, undefined);
    return { sport, league: sport === 'football' ? 'nfl' : 'nba', groups, status: 'live', source: { ok: true, url, httpStatus } };
  } catch (error) {
    const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(
      httpStatus !== null && !signal.aborted ? 'ESPN returned an invalid leaders response' : espnErrorMessage(error),
      url, signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus,
    );
    return {
      sport, league: sport === 'football' ? 'nfl' : 'nba', groups: [], status: 'unavailable',
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
