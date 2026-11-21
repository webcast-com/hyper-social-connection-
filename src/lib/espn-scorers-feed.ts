/**
 * Server-side top scorers feed: a short-lived cache per competition, an
 * in-flight guard, and honest failure reporting. There are no bundled sample
 * scorers: when ESPN does not answer, the board is `unavailable` and empty.
 */
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails } from './espn-endpoints';
import { parseScorers, resolveScorers, type SportsScorersBoard } from './espn-scorers';

const cache = new Map<string, { at: number; board: SportsScorersBoard }>();
const pending = new Map<string, Promise<SportsScorersBoard>>();
const LIVE_TTL = 15 * 60_000;
const FAILURE_TTL = 30_000;

async function fetchScorers(slug: string): Promise<SportsScorersBoard> {
  const { league, url } = resolveScorers(slug);
  const base = { league: league.slug, leagueName: league.name };
  const signal = AbortSignal.timeout(8000);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, undefined);
    }
    const payload: unknown = await response.json();
    if (payload === null || typeof payload !== 'object') throw new EspnEndpointError('ESPN returned no statistics', url, 'invalid-response', httpStatus, undefined);
    const scorers = parseScorers(payload);
    return { ...base, status: scorers.length ? 'ready' : 'empty', scorers, fetchedAt: new Date().toISOString(), source: { ok: true, url, httpStatus } };
  } catch (error) {
    const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(
      httpStatus !== null && !signal.aborted ? 'ESPN returned an invalid statistics response' : espnErrorMessage(error),
      url, signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus,
    );
    return { ...base, status: 'unavailable', scorers: [], fetchedAt: new Date().toISOString(), source: { ok: false, ...espnFailureDetails(failure, url) } };
  }
}

/** Cached top scorers for one competition. Throws only `ScorersInputError`, for a bad slug. */
export function getSportsScorers(slug: string, refresh = false): Promise<SportsScorersBoard> {
  const { league } = resolveScorers(slug);
  const saved = cache.get(league.slug);
  if (!refresh && saved && Date.now() - saved.at < (saved.board.status === 'unavailable' ? FAILURE_TTL : LIVE_TTL)) return Promise.resolve(saved.board);
  const running = pending.get(league.slug);
  if (running) return running;
  const request = fetchScorers(league.slug).then((board) => {
    // A failed refresh does not replace a table that is still recent enough to show.
    const previous = cache.get(league.slug);
    if (board.status === 'unavailable' && previous?.board.status === 'ready' && Date.now() - previous.at < 6 * LIVE_TTL) return previous.board;
    cache.set(league.slug, { at: Date.now(), board });
    return board;
  }).finally(() => { pending.delete(league.slug); });
  pending.set(league.slug, request);
  return request;
}

/** For tests: forget what was cached. */
export function resetSportsScorersCache(): void { cache.clear(); pending.clear(); }
