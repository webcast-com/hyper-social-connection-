/**
 * The SportSRC requests behind the live-stream screen. Server only: this is the
 * one file that reads SPORTSRC_API_KEY, and the key goes out in a request header
 * and nowhere else — never into a response, a page or a log line.
 *
 * SportSRC counts requests per key and per day (1,000 on the free plan, reset at
 * 00:00 UTC), and it is every visitor's requests against the one key. So nothing
 * is asked twice:
 *
 *   - one `matches` request per sport and day, with no status filter. The tabs
 *     (All / Live / Upcoming / Finished) are cut from that one answer in the
 *     browser instead of each costing a request;
 *   - answers are kept in memory: today's list for two minutes, another day's
 *     for ten, a match's sources for five, the sports list for an hour;
 *   - concurrent readers share one request;
 *   - when SportSRC says under a hundred requests remain, everything is kept four
 *     times as long, and at zero nothing is asked until the day turns over;
 *   - a failed refresh serves the last good answer, marked stale.
 *
 * On a paid plan, set SPORTSRC_MATCHES_TTL_SECONDS (for example 20) to refresh
 * as often as SportSRC recommends.
 */
import {
  DEFAULT_STREAM_SPORT,
  emptyStreamBoard,
  parseStreamDetail,
  parseStreamMatches,
  parseStreamSports,
  streamDate,
  streamMatchId,
  streamSportId,
  type StreamBoard,
  type StreamDetail,
  type StreamDetailResult,
  type StreamSport,
  type StreamState,
} from './sportsrc';

export const SPORTSRC_BASE_URL = 'https://api.sportsrc.org/v3/';

const TIMEOUT_MS = 6_000;
const DEFAULT_MATCHES_TTL_MS = 120_000;
const OTHER_DAY_TTL_MS = 10 * 60_000;
const DETAIL_TTL_MS = 5 * 60_000;
const SPORTS_TTL_MS = 60 * 60_000;
/** A failure is remembered briefly so a broken upstream is not hammered. */
const FAILURE_TTL_MS = 30_000;
/** Below this many requests left today, answers are kept longer. */
const LOW_WATER = 100;
const LOW_WATER_STRETCH = 4;
const MAX_ENTRIES = 400;

export type SportsrcOptions = {
  /** Injected by tests. */
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Overrides the environment. Tests only. */
  apiKey?: string;
};

type Entry<T> = { at: number; ttl: number; value: T };
type Outcome = { state: StreamState; payload: unknown };

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
/** What SportSRC last said about the day's allowance, and the day it said it. */
let quota: { remaining: number; day: string } | null = null;
let warnedMissingKey = false;

export function resetSportsrcCache(): void {
  cache.clear();
  inflight.clear();
  quota = null;
  warnedMissingKey = false;
}

/** The key, or '' when this server has none. */
export function sportsrcKey(): string {
  return (process.env.SPORTSRC_API_KEY ?? process.env.SPORTSRC_KEY ?? '').trim();
}

/** Whether a key is set. For the health report; says nothing about the key itself. */
export function sportsrcConfigured(): boolean {
  return sportsrcKey() !== '';
}

function matchesTtl(): number {
  const seconds = Number(process.env.SPORTSRC_MATCHES_TTL_SECONDS);
  return Number.isFinite(seconds) && seconds >= 10 && seconds <= 3600 ? seconds * 1000 : DEFAULT_MATCHES_TTL_MS;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function quotaLeft(now: number): number | null {
  if (!quota || quota.day !== utcDay(now)) return null;
  return quota.remaining;
}

function remember<T>(key: string, value: T, ttl: number, now: number): T {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, MAX_ENTRIES / 4);
    for (const [stale] of oldest) cache.delete(stale);
  }
  cache.set(key, { at: now, ttl, value });
  return value;
}

/** One GET. Never throws: a failure is a state. */
async function request(params: Record<string, string>, key: string, options: SportsrcOptions): Promise<Outcome> {
  const now = (options.now ?? Date.now)();
  if (key && quotaLeft(now) === 0) return { state: 'rate-limited', payload: null };
  const url = new URL(SPORTSRC_BASE_URL);
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: { Accept: 'application/json', ...(key ? { 'X-API-KEY': key } : {}) },
      signal: controller.signal,
      cache: 'no-store',
    });
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    if (key && response.headers.has('x-ratelimit-remaining') && Number.isFinite(remaining)) {
      quota = { remaining: Math.max(0, remaining), day: utcDay(now) };
    }
    if (response.status === 401 || response.status === 403) return { state: 'unauthorized', payload: null };
    if (response.status === 429) {
      quota = { remaining: 0, day: utcDay(now) };
      return { state: 'rate-limited', payload: null };
    }
    if (!response.ok) return { state: 'unavailable', payload: null };
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || (payload as { success?: unknown }).success === false) {
      return { state: 'unavailable', payload: null };
    }
    return { state: 'ok', payload };
  } catch {
    return { state: 'unavailable', payload: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A cached read. `load` returns the value and whether it is a good answer; a bad
 * one is kept only briefly, and never replaces a good one that is still held.
 */
async function cached<T>(
  key: string,
  ttl: number,
  options: SportsrcOptions,
  load: () => Promise<{ ok: boolean; value: T }>,
  stale: (value: T) => T,
): Promise<T> {
  const now = (options.now ?? Date.now)();
  const left = quotaLeft(now);
  const stretch = left !== null && left < LOW_WATER ? LOW_WATER_STRETCH : 1;
  const held = cache.get(key) as Entry<T> | undefined;
  if (held && now - held.at < held.ttl * stretch) return held.value;
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const good = cache.get(`good:${key}`) as Entry<T> | undefined;
  const task = (async () => {
    const result = await load();
    const at = (options.now ?? Date.now)();
    if (result.ok) {
      remember(`good:${key}`, result.value, Number.MAX_SAFE_INTEGER, at);
      return remember(key, result.value, ttl, at);
    }
    // Keep showing the last good answer for up to an hour rather than nothing.
    if (good && at - good.at < 60 * 60_000) return remember(key, stale(good.value), FAILURE_TTL_MS, at);
    return remember(key, result.value, FAILURE_TTL_MS, at);
  })().finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

/** The sports SportSRC lists. Needs no key; falls back to football alone. */
export async function getStreamSports(options: SportsrcOptions = {}): Promise<StreamSport[]> {
  return cached<StreamSport[]>('sports', SPORTS_TTL_MS, options, async () => {
    const outcome = await request({ type: 'sports' }, '', options);
    return { ok: outcome.state === 'ok', value: parseStreamSports(outcome.payload) };
  }, (value) => value);
}

/**
 * The fixtures that have a stream, for one sport and one day.
 *
 * With no `date` the request carries none and SportSRC answers with its own
 * current list, which is what the screen opens on: it avoids guessing which
 * calendar day SportSRC means by "today" for a reader in another time zone. A
 * `date` (`YYYY-MM-DD`) is sent only when the reader picks another day, and that
 * answer changes less, so it is kept longer. Anything malformed is dropped rather
 * than sent on.
 */
export async function getStreamBoard(
  input: { sport?: string | null; date?: string | null } = {},
  options: SportsrcOptions = {},
): Promise<StreamBoard> {
  const sport = streamSportId(input.sport) ?? DEFAULT_STREAM_SPORT;
  const date = streamDate(input.date) ?? '';
  const key = options.apiKey ?? sportsrcKey();
  if (!key) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn('[sportsrc] SPORTSRC_API_KEY is not set: the live-stream screen has no matches to show.');
    }
    return emptyStreamBoard('missing-key', sport, date);
  }
  return cached<StreamBoard>(`matches:${sport}:${date}`, date ? OTHER_DAY_TTL_MS : matchesTtl(), options, async () => {
    const [outcome, sports] = await Promise.all([
      request({ type: 'matches', sport, date }, key, options),
      getStreamSports(options),
    ]);
    if (outcome.state !== 'ok') return { ok: false, value: { ...emptyStreamBoard(outcome.state, sport, date), sports } };
    const { leagues, matches } = parseStreamMatches(outcome.payload);
    return {
      ok: true,
      value: { state: 'ok', sport, date, leagues, matches, sports, fetchedAt: new Date((options.now ?? Date.now)()).toISOString() },
    };
  }, (value) => ({ ...value, stale: true }));
}

/** One match's stream sources and facts. `id` must be an id SportSRC issued. */
export async function getStreamDetail(id: string | null | undefined, options: SportsrcOptions = {}): Promise<StreamDetailResult> {
  const matchId = streamMatchId(id);
  if (!matchId) return { state: 'unavailable', detail: null };
  const key = options.apiKey ?? sportsrcKey();
  if (!key) return { state: 'missing-key', detail: null };
  return cached<StreamDetailResult>(`detail:${matchId}`, DETAIL_TTL_MS, options, async () => {
    const outcome = await request({ type: 'detail', id: matchId }, key, options);
    if (outcome.state !== 'ok') return { ok: false, value: { state: outcome.state, detail: null } };
    const detail: StreamDetail | null = parseStreamDetail(outcome.payload);
    return detail ? { ok: true, value: { state: 'ok', detail } } : { ok: false, value: { state: 'unavailable', detail: null } };
  }, (value) => value);
}

/** The board for a page render: whatever arrives inside the budget, else empty. */
export async function getStreamBoardForRender(
  input: { sport?: string | null; date?: string | null } = {},
  budgetMs = 2_500,
): Promise<StreamBoard> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<StreamBoard>((resolve) => {
    timer = setTimeout(() => resolve(emptyStreamBoard('unavailable', streamSportId(input.sport) ?? DEFAULT_STREAM_SPORT, streamDate(input.date) ?? '')), budgetMs);
  });
  try {
    return await Promise.race([getStreamBoard(input), late]);
  } finally {
    clearTimeout(timer);
  }
}
