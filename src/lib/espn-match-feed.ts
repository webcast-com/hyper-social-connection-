import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails, espnResponseMetadata } from './espn-endpoints';
import { parseMatchDetails, resolveMatch, type MatchBoard } from './espn-match';

const cache = new Map<string, { at: number; board: MatchBoard }>();
const pending = new Map<string, Promise<MatchBoard>>();

async function fetchMatch(league: string, eventId: string): Promise<MatchBoard> {
  const { reference, url } = resolveMatch(league, eventId);
  const signal = AbortSignal.timeout(8_000);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) {
      const metadata = espnResponseMetadata(response.headers);
      await response.body?.cancel().catch(() => undefined);
      throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, metadata);
    }
    const match = parseMatchDetails(await response.json(), reference);
    return { match, status: 'ready', fetchedAt: new Date().toISOString(), source: { ok: true, url, httpStatus } };
  } catch (error) {
    const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(httpStatus !== null && !signal.aborted ? 'ESPN returned invalid match details' : espnErrorMessage(error), url,
      signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus);
    return { match: null, status: 'unavailable', fetchedAt: new Date().toISOString(), source: { ok: false, ...espnFailureDetails(failure, url) } };
  }
}

/** Fetch only the opened match, with bounded shared cache/work and no fabricated details. */
export function getMatchDetails(league: string, eventId: string, bypassCache = false): Promise<MatchBoard> {
  const { url } = resolveMatch(league, eventId);
  const saved = cache.get(url);
  if (!bypassCache && saved && Date.now() - saved.at < (saved.board.status === 'ready' ? 30_000 : 10_000)) return Promise.resolve(saved.board);
  const active = pending.get(url);
  if (active) return active;
  if (pending.size >= 8) return Promise.reject(new Error('Match details are busy; try again shortly'));
  const job = fetchMatch(league, eventId).then((board) => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), board });
    return board;
  }).finally(() => pending.delete(url));
  pending.set(url, job);
  return job;
}
