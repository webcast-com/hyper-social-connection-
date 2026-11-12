/**
 * Server-side athlete detail feed.
 *
 * Its own cache and in-flight guard, separate from every other feed. Two
 * endpoints are tried in order — the site endpoint ESPN.com itself reads, then
 * the common v3 endpoint this repository already uses for leaders — because
 * which one answers depends on the competition, and a player page that works for
 * the NBA should also work for the Kenyan Premier League. The second request is
 * only made when the first refused or reported nothing usable, so a served
 * player costs one request, and both attempts are recorded in `sources`.
 *
 * There is no sample player here: an unanswered request is an `unavailable`
 * board and the page says ESPN did not report this player.
 */
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails, espnResponseMetadata } from './espn-endpoints';
import { athleteBoardOf, parseAthlete, resolveAthlete, type AthleteBoard, type AthleteDetail, type AthleteSource } from './espn-athlete';

const READY_TTL = 300_000;
const FAILURE_TTL = 15_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_PENDING = 8;
const MAX_CACHED = 100;

const cache = new Map<string, { at: number; board: AthleteBoard }>();
const pending = new Map<string, Promise<AthleteBoard>>();

async function readAthlete(url: string, parse: (payload: unknown) => AthleteDetail): Promise<{ source: AthleteSource; athlete: AthleteDetail | null }> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) {
      const metadata = espnResponseMetadata(response.headers);
      await response.body?.cancel().catch(() => undefined);
      throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, metadata);
    }
    return { source: { ok: true, url, httpStatus }, athlete: parse(await response.json()) };
  } catch (error) {
    const failure = error instanceof EspnEndpointError
      ? error
      : new EspnEndpointError(
        signal.aborted ? 'ESPN player request timed out' : httpStatus !== null ? 'ESPN returned unusable player data' : espnErrorMessage(error),
        url,
        signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network',
        httpStatus,
      );
    return { source: { ok: false, ...espnFailureDetails(failure, url) }, athlete: null };
  }
}

async function fetchAthlete(league: string, athleteId: string): Promise<AthleteBoard> {
  const { meta, reference, urls } = resolveAthlete(league, athleteId);
  const sources: AthleteSource[] = [];
  let athlete: AthleteDetail | null = null;

  for (const url of [urls.site, urls.common]) {
    const attempt = await readAthlete(url, (payload) => parseAthlete(payload, meta, reference));
    sources.push(attempt.source);
    if (attempt.athlete) {
      athlete = attempt.athlete;
      break;
    }
  }

  // The board's shape and status come from the one assembler the browser
  // transport uses too, so the two routes cannot disagree about a player page.
  return athleteBoardOf(meta, reference, athlete, sources);
}

/** One player's detail, with bounded shared cache and no fabricated biography. */
export function getAthleteDetail(league: string, athleteId: string, bypassCache = false): Promise<AthleteBoard> {
  const { urls } = resolveAthlete(league, athleteId);
  const saved = cache.get(urls.site);
  if (!bypassCache && saved && Date.now() - saved.at < (saved.board.status === 'unavailable' ? FAILURE_TTL : READY_TTL)) {
    return Promise.resolve(saved.board);
  }
  const active = pending.get(urls.site);
  if (active) return active;
  if (pending.size >= MAX_PENDING) return Promise.reject(new Error('Player details are busy; try again shortly'));
  const job = fetchAthlete(league, athleteId).then((board) => {
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    cache.set(urls.site, { at: Date.now(), board });
    return board;
  }).finally(() => pending.delete(urls.site));
  pending.set(urls.site, job);
  return job;
}

/** Test seam: forget every cached player and drop any in-flight work. */
export function resetAthleteCaches(): void {
  cache.clear();
  pending.clear();
}
