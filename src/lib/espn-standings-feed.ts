import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails, espnResponseMetadata } from './espn-endpoints';
import { parseStandings, resolveStandings, type StandingsBoard } from './espn-standings';

const cache = new Map<string, { at: number; board: StandingsBoard }>();
const pending = new Map<string, Promise<StandingsBoard>>();
async function fetchStandings(league: string, season?: string): Promise<StandingsBoard> {
  const { year, url } = resolveStandings(league, season);
  const signal = AbortSignal.timeout(8000);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) {
      const metadata = espnResponseMetadata(response.headers);
      await response.body?.cancel().catch(() => undefined);
      throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, metadata);
    }
    const parsed = parseStandings(await response.json(), year);
    return { league, requestedSeason: year, ...parsed, fetchedAt: new Date().toISOString(), source: { ok: true, url, httpStatus } };
  } catch (error) {
    const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(httpStatus !== null && !signal.aborted ? 'ESPN returned invalid league standings' : espnErrorMessage(error), url,
      signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus);
    return { league, requestedSeason: year, season: null, groups: [], status: 'unavailable', fetchedAt: new Date().toISOString(), source: { ok: false, ...espnFailureDetails(failure, url) } };
  }
}
/** Separate lazy table work; never delay or invalidate a match summary. Limits are per process. */
export function getStandings(league: string, season?: string, refresh = false): Promise<StandingsBoard> {
  const { url } = resolveStandings(league, season);
  const saved = cache.get(url);
  if (!refresh && saved && Date.now() - saved.at < (saved.board.status === 'unavailable' ? 15_000 : 300_000)) return Promise.resolve(saved.board);
  const active = pending.get(url);
  if (active) return active;
  if (pending.size >= 8) return Promise.reject(new Error('Standings are busy; try again shortly'));
  const job = fetchStandings(league, season).then((board) => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), board }); return board;
  }).finally(() => pending.delete(url));
  pending.set(url, job); return job;
}
