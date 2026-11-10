/** Browser-first ESPN access for Hyper Sports. Catalog-backed URLs only; the
 * same-origin APIs remain the fallback when a browser blocks ESPN/CORS. */
import { ESPN_LEAGUES, SPORTS_CORE_LEAGUES, type EspnLeague } from './sports-catalog';
import { espnSportsScoreboardUrl, espnFailureDetails, EspnEndpointError } from './espn-endpoints';
import { parseEspnEvents } from './espn';
import { parseMatchDetails, resolveMatch, type MatchBoard, type MatchReference } from './espn-match';
import { isStandingsBoard, parseStandings, resolveStandings, type StandingsBoard } from './espn-standings';
import type { SportsBoard, SportsEvent, SportsSourceReport } from './sports';
import { competitionCountry } from './sports-navigation';
import type { SportsFilters } from './sports-filters';

const BROWSER_TIMEOUT = 8000;
const CONCURRENCY = 8;
/** Transient ESPN responses worth one more attempt inside the same deadline. */
const RETRY_STATUS = [429, 500, 502, 503, 504];

/** Retry a transient response without extending the request's own deadline. */
async function retryDelay(response: Response | null, fallbackMs: number): Promise<number> {
  const header = response?.headers.get('Retry-After');
  if (!header) return fallbackMs;
  const seconds = Number(header);
  const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(wait) ? Math.max(fallbackMs, Math.min(wait, 2000)) : fallbackMs;
}

async function requestJson(url: string, signal?: AbortSignal): Promise<{ data: unknown; status: number }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, BROWSER_TIMEOUT);
  const deadline = Date.now() + BROWSER_TIMEOUT;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let retry = false, retryAfterMs = 150, parsing = false, httpStatus: number | null = null;
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
        httpStatus = response.status;
        if (!response.ok) {
          retry = RETRY_STATUS.includes(response.status);
          retryAfterMs = await retryDelay(response, retryAfterMs);
          throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status);
        }
        parsing = true;
        try { return { data: await response.json(), status: response.status }; }
        catch { throw new EspnEndpointError('Invalid ESPN JSON', url, 'invalid-response', response.status); }
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (controller.signal.aborted) throw new EspnEndpointError('ESPN browser request timed out', url, 'timeout', httpStatus);
        // Only a transient provider response is retried here; an unreachable
        // ESPN fails over to the server route immediately instead of waiting.
        if (attempt === 1 || !retry || Date.now() + retryAfterMs >= deadline) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      if (controller.signal.aborted) throw new EspnEndpointError('ESPN browser request timed out', url, 'timeout', httpStatus);
    }
    throw new EspnEndpointError('ESPN browser request failed', url, 'network');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
async function serverJson(url: string, signal?: AbortSignal, timeoutMs = 30_000): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new SportsApiError(response.status);
    return await response.json();
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
/** A same-origin API failure: the scores route itself is missing or broken. */
export class SportsApiError extends Error {
  constructor(readonly status: number) {
    super(`Sports API HTTP ${status}`);
    this.name = 'SportsApiError';
  }
}
export function emptyBrowserBoard(): SportsBoard {
  return { events: [], predictions: [], sources: [], mode: 'partial', fetchedAt: new Date().toISOString() };
}
function validBoard(value: unknown): value is SportsBoard {
  const board = value as SportsBoard | null;
  return !!board && Array.isArray(board.events) && Array.isArray(board.sources) && Array.isArray(board.predictions) && ['live','partial','demo'].includes(board.mode);
}
function mergeGames(events: SportsEvent[]) {
  const unique = new Map(events.map(event => [event.id, event]));
  return [...unique.values()].sort((a,b) => ({live:0, upcoming:1, final:2}[a.status] - {live:0, upcoming:1, final:2}[b.status]) || Date.parse(a.startAt) - Date.parse(b.startAt));
}

/** Keep the whole board, but try the user's current selection before the rest. */
export function prioritizeSportsLeagues(leagues: EspnLeague[], filters: Pick<SportsFilters, 'sport' | 'region' | 'country' | 'league'>): EspnLeague[] {
  const matches = (item: EspnLeague) => (filters.sport === 'all' || item.kind === filters.sport)
    && (filters.region === 'all' || item.region === filters.region)
    && (filters.country === 'all' || competitionCountry(item.slug) === filters.country)
    && (filters.league === 'all' || item.slug === filters.league);
  const selected = leagues.filter(matches);
  const others = leagues.filter((item) => !matches(item));
  // Nothing narrowed: request the competitions that report fixtures most often
  // first, so an unfiltered board still shows live, upcoming and final matches
  // while the rest of the catalog is still in flight. Same set, different order.
  const narrowed = filters.sport !== 'all' || filters.region !== 'all' || filters.country !== 'all' || filters.league !== 'all';
  if (!narrowed) {
    const rank = new Map(SPORTS_CORE_LEAGUES.map((slug, index) => [slug, index]));
    return [...selected].sort((a, b) => (rank.get(a.slug) ?? rank.size) - (rank.get(b.slug) ?? rank.size));
  }
  return [...selected, ...others];
}

/** A whole-catalog board needs a longer budget than a single competition. */
export function sportsDirectBudget(leagues: number): number {
  return Math.max(15_000, Math.min(30_000, Math.ceil(leagues / CONCURRENCY) * 1_200 + 5_000));
}

/** Replace completed successful leagues without discarding the previous board
 * while the remainder of a refresh is still in flight. */
export function mergeBrowserProgress(previous: SportsBoard, progress: SportsBoard): SportsBoard {
  const success = new Set(progress.sources.filter((source) => source.ok).map((source) => source.id));
  const oldSources = new Map(previous.sources.map((source) => [source.id, source]));
  for (const source of progress.sources) if (source.ok || !oldSources.has(source.id)) oldSources.set(source.id, source);
  const events = previous.mode === 'demo' ? [] : previous.events.filter((event) => !success.has(`espn:${event.league}`));
  return { events: mergeGames([...events, ...progress.events]), predictions: [], sources: [...oldSources.values()], mode: 'partial', fetchedAt: progress.fetchedAt };
}

/** Attempt every configured league directly, then use the server only for
 * failed leagues. A successful empty ESPN response is not a failure. */
export async function browserSportsBoard(
  signal?: AbortSignal, force = false, leagues: EspnLeague[] = ESPN_LEAGUES,
  onProgress?: (board: SportsBoard) => void, directDeadlineMs?: number,
): Promise<SportsBoard> {
  const results: { source: SportsSourceReport; events: SportsEvent[] }[] = new Array(leagues.length);
  let next = 0, completed = 0;
  // A total budget prevents an expanded catalog from multiplying the timeout
  // by every queue wave. Successful leagues can render as soon as they arrive.
  const direct = new AbortController();
  const abort = () => direct.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, directDeadlineMs ?? sportsDirectBudget(leagues.length));
  try {
    await Promise.all(Array.from({length: Math.min(CONCURRENCY, leagues.length)}, async () => {
      // Requests already in flight are allowed to finish; only new work stops,
      // so a slow network never discards a competition that was started.
      while (next < leagues.length && !signal?.aborted && !direct.signal.aborted) {
        const index = next++, league = leagues[index], url = espnSportsScoreboardUrl(league);
        try {
          const response = await requestJson(url, direct.signal);
          let events: SportsEvent[];
          try { events = parseEspnEvents(response.data, league); }
          catch { throw new EspnEndpointError('Invalid ESPN scoreboard', url, 'invalid-response', response.status); }
          results[index] = { events, source: { id: `espn:${league.slug}`, ok: true, count: events.length, url, httpStatus: response.status, transport: 'browser' } };
        } catch (error) {
          if (signal?.aborted) throw error;
          const failure = direct.signal.aborted ? new EspnEndpointError('Browser scoreboard deadline reached', url, 'timeout') : error;
          results[index] = { events: [], source: { id: `espn:${league.slug}`, ok: false, count: 0, ...espnFailureDetails(failure, url), transport: 'browser' } };
        }
        completed++;
        if (onProgress && completed < leagues.length && (completed === 1 || completed % 4 === 0)) {
          const available = results.filter((result) => result !== undefined);
          if (available.some((result) => result.source.ok)) onProgress({ events: mergeGames(available.flatMap((result) => result.events)),
            predictions: [], sources: available.map((result) => result.source), mode: 'partial', fetchedAt: new Date().toISOString() });
        }
      }
    }));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  // Competitions the budget never reached stay reported as failures so the
  // server route can cover exactly those, not the whole catalog again.
  for (let index = 0; index < results.length; index++) {
    if (results[index]) continue;
    const league = leagues[index], url = espnSportsScoreboardUrl(league);
    results[index] = { events: [], source: { id: `espn:${league.slug}`, ok: false, count: 0,
      ...espnFailureDetails(new EspnEndpointError('Browser scoreboard deadline reached', url, 'timeout'), url), transport: 'browser' } };
  }
  const failed = leagues.filter((_, index) => !results[index].source.ok).map((league) => league.slug);
  let fallback: SportsBoard | null = null;
  let serverFailure: unknown = null;
  if (failed.length) {
    try {
      const params = new URLSearchParams();
      if (force) params.set('refresh', '1');
      // Only the missing competitions are re-requested server-side, in batches
      // of twelve bounded to four seconds each.
      if (failed.length < leagues.length) params.set('leagues', failed.join(','));
      const fallbackBudget = Math.ceil((failed.length || ESPN_LEAGUES.length) / 12) * 4_000 + 5_000;
      const result = await serverJson(`/api/sports${params.size ? `?${params}` : ''}`, signal, fallbackBudget);
      if (validBoard(result)) fallback = result;
    } catch (error) { if (signal?.aborted) throw error; serverFailure = error; }
  }
  const browserSuccess = results.some(result => result.source.ok);
  if (!browserSuccess && !fallback) {
    // A missing app route is a deployment problem, not a provider outage.
    if (serverFailure instanceof SportsApiError) throw serverFailure;
    throw new Error('Browser ESPN and Sports server are unavailable');
  }
  if (!browserSuccess && fallback?.mode === 'demo') return fallback;
  const allEvents: SportsEvent[] = [], sources: SportsSourceReport[] = [];
  for (const result of results) {
    // A competition the browser could not reach is reported by the server when
    // it has one, because the server explains why (HTTP status, metadata).
    const serverSource = fallback?.sources.find(source => source.id === result.source.id);
    if (!result.source.ok && serverSource && fallback && fallback.mode !== 'demo') {
      sources.push({ ...serverSource, transport: 'server' });
      if (serverSource.ok) allEvents.push(...fallback.events.filter(event => event.source === 'espn' && `espn:${event.league}` === result.source.id));
    } else { sources.push(result.source); allEvents.push(...result.events); }
  }
  // If both routes fail, expose browser failures rather than inventing live data.
  return { events: mergeGames(allEvents), predictions: [], sources, fetchedAt: new Date().toISOString(), mode: sources.every(s => s.ok) ? 'live' : 'partial' };
}

export async function browserMatchBoard(reference: MatchReference, signal?: AbortSignal, force = false): Promise<MatchBoard> {
  const { url } = resolveMatch(reference.league, reference.eventId);
  try {
    const response = await requestJson(url, signal);
    const match = parseMatchDetails(response.data, reference);
    return { match, status: 'ready', fetchedAt: new Date().toISOString(), source: { ok: true, url, httpStatus: response.status } };
  } catch (error) {
    if (signal?.aborted) throw error;
    const result = await serverJson(`/api/sports/matches/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.eventId)}${force ? '?refresh=1' : ''}`, signal) as MatchBoard;
    return result;
  }
}

export async function browserStandingsBoard(league: string, season: number | null, signal?: AbortSignal, force = false): Promise<StandingsBoard> {
  const { url, year } = resolveStandings(league, season === null ? undefined : String(season));
  try {
    const response = await requestJson(url, signal);
    const parsed = parseStandings(response.data, year);
    return { league, requestedSeason: year, ...parsed, fetchedAt: new Date().toISOString(), source: { ok: true, url, httpStatus: response.status } };
  } catch (error) {
    if (signal?.aborted) throw error;
    const params = new URLSearchParams(); if (season !== null) params.set('season', String(season)); if (force) params.set('refresh','1');
    const result = await serverJson(`/api/sports/standings/${encodeURIComponent(league)}${params.size ? `?${params}` : ''}`, signal);
    if (!isStandingsBoard(result, league, season)) throw new Error('Invalid standings response');
    return result;
  }
}
