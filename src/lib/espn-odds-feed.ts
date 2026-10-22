import { EspnEndpointError, espnErrorMessage, espnFailureDetails, espnScoreboardUrl } from './espn-endpoints';
import {
  BATCH_SIZE, FREE_MATCHES, MAX_MATCHES, ODDS_LEAGUES, dayStamp, field,
  mapOddsEvent, normalizeOddsRequest, text, type OddsBoard, type OddsMatch, type OddsRequest,
} from './espn-odds';

const CACHE_MS = 45_000;
const REQUEST_MS = 10_000;
const TOTAL_MS = 25_000;
const cache = new Map<string, { at: number; board: OddsBoard }>();
const inFlight = new Map<string, Promise<OddsBoard>>();

async function fetchBoard(request: OddsRequest): Promise<OddsBoard> {
  const now = new Date();
  const deadline = Date.now() + TOTAL_MS;
  const leagues = ODDS_LEAGUES.filter((league) => request.sports.length
    ? request.sports.includes(league.sport) : !league.secondary);
  const matches: OddsMatch[] = [];
  const sources: OddsBoard['sources'] = [];
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  let truncated = false;
  outer: for (let offset = 0; offset < request.days; offset++) {
    const pending = leagues.filter((league) => !request.perLeague || (counts.get(league.path) || 0) < request.perLeague);
    if (!pending.length) break;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      if (Date.now() >= deadline) { truncated = true; break outer; }
      const batch = pending.slice(i, i + BATCH_SIZE);
      const date = offset === 0 ? null : dayStamp(offset, now);
      const results = await Promise.allSettled(batch.map(async (league) => {
        const url = espnScoreboardUrl(league, date ?? undefined);
        const signal = AbortSignal.timeout(Math.max(1, Math.min(REQUEST_MS, deadline - Date.now())));
        let httpStatus: number | null = null;
        try {
          const response = await fetch(url, {
            signal, cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'HyperSports/1.0 (+https://hyper.social)' },
          });
          httpStatus = response.status;
          if (!response.ok) {
            await response.body?.cancel();
            throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status);
          }
          const json: unknown = await response.json();
          const events = field(json, 'events');
          if (!Array.isArray(events)) throw new EspnEndpointError('Invalid ESPN scoreboard: events array missing', url, 'invalid-response', httpStatus);
          const name = field(json, 'leagues');
          const leagueName = Array.isArray(name) ? text(field(name[0], 'name')) : null;
          return { httpStatus, matches: events.map((event) => mapOddsEvent(event, { ...league, name: leagueName || league.name }, now)).filter((event): event is OddsMatch => !!event) };
        } catch (error) {
          if (error instanceof EspnEndpointError) throw error;
          throw new EspnEndpointError(espnErrorMessage(error), url, signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus);
        }
      }));
      for (const [index, result] of results.entries()) {
        const league = batch[index];
        if (result.status === 'rejected') {
          sources.push({ path: league.path, date, ok: false, count: 0,
            ...espnFailureDetails(result.reason, espnScoreboardUrl(league, date ?? undefined)) });
          continue;
        }
        sources.push({ path: league.path, date, ok: true, count: result.value.matches.length,
          url: espnScoreboardUrl(league, date ?? undefined), httpStatus: result.value.httpStatus });
        for (const match of result.value.matches) {
          if (seen.has(match.id) || (request.perLeague && (counts.get(league.path) || 0) >= request.perLeague)) continue;
          counts.set(league.path, (counts.get(league.path) || 0) + 1);
          seen.add(match.id);
          matches.push(match);
        }
      }
    }
  }
  const list = matches.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)).slice(0, MAX_MATCHES)
    .map((match, index) => ({ ...match, is_premium: index >= FREE_MATCHES }));
  const anyOk = sources.some((source) => source.ok);
  return {
    matches: list, sources, fetchedAt: new Date().toISOString(), truncated,
    status: !anyOk ? 'unavailable' : truncated || sources.some((source) => !source.ok) ? 'partial' : list.length ? 'ready' : 'empty',
  };
}

/** A bounded, shared cache prevents every page view from fanning out to every league. */
export function getEspnOdds(input: unknown = {}, options: { bypassCache?: boolean } = {}): Promise<OddsBoard> {
  const request = normalizeOddsRequest(input);
  const key = JSON.stringify(request);
  const saved = cache.get(key);
  if (!options.bypassCache && saved && Date.now() - saved.at < CACHE_MS) return Promise.resolve(saved.board);
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (inFlight.size >= 8) return Promise.reject(new Error('Odds feed is busy; please try again shortly'));
  const task = fetchBoard(request).then((board) => {
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), board });
    return board;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
