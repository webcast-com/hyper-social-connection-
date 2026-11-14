/**
 * Server-side match highlights feed for the homepage.
 *
 * Follows the shape of the other Hyper Sports feeds (`espn-leaders-feed`,
 * `espn-standings-feed`): a short-lived cache, an in-flight guard so concurrent
 * renders share one request, and a bundled fallback when ESPN does not answer.
 * A failure here must never break the homepage, so errors resolve to an
 * `unavailable` board instead of rejecting.
 *
 * ESPN has no highlights collection endpoint; a game's clips live on that
 * game's own video collection (`…/videos?event={id}`). So the fixtures have to
 * come from somewhere else, and they come from two places:
 *
 *   1. the scores board the site already fetches (today's fixtures), and
 *   2. a sweep of the last week's scoreboards, because a finished match from
 *      Tuesday is exactly where the full-match highlights are.
 *
 * The sweep is the expensive half. ESPN's scoreboard takes one date per
 * request and there is no league-wide clip listing, so a week of fixtures costs
 * one request per competition per day. Each day is therefore asked for once,
 * remembered for a day, and bounded by a render budget: the page is served from
 * whatever is already known, and the rest of the week is picked up by the next
 * render.
 */
import { getSportsBoard, type SportsEvent } from './sports';
import { ESPN_LEAGUES } from './sports-catalog';
import { parseEspnEvents } from './espn';
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnFailureDetails, espnSportsScoreboardUrl } from './espn-endpoints';
import { bundledHighlights, normalizeHighlights, type SportsHighlightClip } from './espn-highlights';

export type SportsHighlightsBoard = {
  clips: SportsHighlightClip[];
  status: 'live' | 'partial' | 'unavailable';
  /** How many ESPN video collections answered with a clip. */
  games: number;
  source: { ok: boolean; url: string; httpStatus: number | null; error?: string; errorKind?: string };
  /**
   * Which read filled this board, stamped only by `getHighlightsBoardForRender`.
   *
   * Optional so every producer that predates the stored index — this feed, the
   * bundled sample board, a page's empty board — stays valid untouched. It exists
   * for diagnostics and tests: the cards are the same shape either way, so no
   * consumer has to branch on it.
   */
  provenance?: 'live' | 'stored';
};

/**
 * One video collection per competition keeps the board varied. ESPN publishes
 * clips for some competitions and not for others (the Champions League, La Liga
 * and the NBA answer with clips; the Premier League and the NFL answer with an
 * empty list), so more fixtures are asked than the board can show.
 */
const MAX_GAMES_PER_LEAGUE = 1;
const MAX_GAMES = 12;
const MAX_CLIPS = 12;
const SUMMARY_TIMEOUT_MS = 6_000;
const LIVE_TTL = 15 * 60_000;
const FAILURE_TTL = 60_000;

const cache = new Map<string, { at: number; board: SportsHighlightsBoard }>();
let pending: Promise<SportsHighlightsBoard> | null = null;

/* ── The last week's finished fixtures ──────────────────────────────────── */

/**
 * How many days back the board looks for finished matches.
 *
 * ESPN has no highlights collection endpoint and no date range: a game's clips
 * live on that game's own video collection, and the scoreboard takes one date
 * per request. So a week of fixtures costs one scoreboard request per
 * competition per day, which is why the sweep is incremental — a day is asked
 * for once and remembered — and why it is bounded: the page is never held up
 * for it.
 */
const POOL_DAYS = 7;
/** A day's scoreboards are worth remembering for a day, not forever. */
const DAY_TTL = 24 * 60 * 60_000;
/** How often the board looks for a day it has not asked about yet. */
const POOL_TTL = 15 * 60_000;
const POOL_TIMEOUT_MS = 6_000;
const POOL_CONCURRENCY = 24;
/**
 * How long a render will wait for a day it has not seen yet. Enough for a day
 * or two of every competition; the rest of the week is picked up by the next
 * render, because a remembered day is never asked for twice.
 */
const POOL_RENDER_BUDGET_MS = 3_500;

type DaySweep = { at: number; events: SportsEvent[] };
/** YYYYMMDD → that day's scoreboards, as the Site API sends them. */
const dayCache = new Map<string, DaySweep>();

/** When the sweep last asked ESPN for a day. */
let sweptAt = 0;
let poolJob: Promise<SportsEvent[]> | null = null;

/** A day is remembered until it is old enough to be worth asking about again. */
function rememberedDay(date: string): SportsEvent[] | null {
  const hit = dayCache.get(date);
  if (!hit) return null;
  if (Date.now() - hit.at >= DAY_TTL) {
    dayCache.delete(date);
    return null;
  }
  return hit.events;
}

/** YYYYMMDD in UTC — the only form ESPN's `dates` parameter accepts. */
const espnDate = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/** Bounded fan-out, in the shape `settleJobs` uses for the scores board. */
async function settle<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(POOL_CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next++;
      try {
        results.push(await jobs[index]());
      } catch {
        // One competition that will not answer is not a reason to lose the day.
      }
    }
  }));
  return results;
}

/**
 * Every competition's scoreboard for one day.
 *
 * `answered` says whether ESPN responded at all: a day nobody answered is not
 * remembered, so a transient failure is retried by the next render instead of
 * costing the board a day of history.
 */
async function sweepDay(date: string, timeoutMs: number): Promise<{ events: SportsEvent[]; answered: boolean }> {
  // One deadline for the whole day, shared by every request in it: the pool
  // works in batches, and a batch that starts late must not be given a fresh
  // budget of its own.
  const deadline = AbortSignal.timeout(timeoutMs);
  const groups = await settle(ESPN_LEAGUES.map((meta) => async () => {
    // The same scoreboards the scores board reads, so a fixture found here is
    // the same fixture the board already shows.
    const url = espnSportsScoreboardUrl(meta, date);
    const response = await fetch(url, {
      headers: ESPN_REQUEST_HEADERS,
      cache: 'no-store',
      signal: deadline,
    });
    if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status);
    return parseEspnEvents(await response.json(), meta);
  }));
  return { events: groups.flat(), answered: groups.length > 0 };
}

/** Every finished match remembered for the last week, newest first. */
function finishedFixtures(): SportsEvent[] {
  const seen = new Set<string>();
  const out: SportsEvent[] = [];
  for (const day of dayCache.values()) {
    for (const event of day.events) {
      // Only a finished match carries its full-match highlights.
      if (event.status !== 'final' || !event.sourceId || seen.has(event.id)) continue;
      seen.add(event.id);
      out.push(event);
    }
  }
  return out.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
}

/**
 * Asks for the days of the last week that are not remembered yet.
 *
 * A day already remembered is skipped, so each render extends the week by the
 * days it has time for rather than asking for all of them again.
 */
async function sweepMissingDays(deadlineMs: number): Promise<SportsEvent[]> {
  const started = Date.now();
  // What a day may cost: the time left, and never more than one request's
  // worth, so a slow ESPN is abandoned rather than run past the deadline.
  const budget = () => Math.max(500, Math.min(POOL_TIMEOUT_MS, deadlineMs - (Date.now() - started)));

  for (let day = 1; day <= POOL_DAYS; day += 1) {
    const date = espnDate(Date.now() - day * 86_400_000);
    if (rememberedDay(date)) continue;
    // No time left for another day of every competition.
    if (day > 1 && Date.now() - started > deadlineMs) break;
    const sweep = await sweepDay(date, budget());
    if (!sweep.answered) break;
    dayCache.set(date, { at: Date.now(), events: sweep.events });
  }
  // Recorded whether or not ESPN answered: a sweep that got nothing backs off
  // for the pool's lifetime instead of being repeated by the next render.
  sweptAt = Date.now();

  return finishedFixtures();
}

/** The remembered fixtures, or a sweep of the days not seen yet. */
function recentFinishedEvents(): Promise<SportsEvent[]> {
  if (Date.now() - sweptAt < POOL_TTL) return Promise.resolve(finishedFixtures());
  if (poolJob) return poolJob;
  const job = sweepMissingDays(POOL_RENDER_BUDGET_MS).finally(() => { poolJob = null; });
  poolJob = job;
  return job;
}

/**
 * Test seam: remembers fixtures as yesterday's, so a board can be built without
 * sweeping a week of ESPN scoreboards. `ageMs` ages the pool, the way a few
 * renders would.
 */
export function seedRecentFinishedEvents(events: SportsEvent[], ageMs = 0): void {
  const at = Date.now() - ageMs;
  dayCache.clear();
  dayCache.set(espnDate(at - 86_400_000), { at, events });
  sweptAt = at;
}

/** Test seam: forgets the week, so the next board sweeps ESPN from scratch. */
export function resetRecentFinishedEvents(): void {
  dayCache.clear();
  sweptAt = 0;
}

/* ── The board ──────────────────────────────────────────────────────────── */

/**
 * The video collection for one fixture.
 *
 * `SportsEvent.sport` is the site's own sport kind (`football`,
 * `american-football`), while ESPN addresses a league by its provider path
 * (`soccer/eng.1`), so the catalog supplies the path. The board id is namespaced
 * (`espn-epl-401234`) and the video collection wants the provider's own id,
 * which the event carries; sample fixtures have none and are skipped.
 *
 * The game summary is *not* a substitute: read live, it answers with boxscore,
 * plays, leaders and standings but no videos at all, so the clips have to come
 * from here.
 */
const videosUrl = (event: SportsEvent) => {
  const meta = ESPN_LEAGUES.find((league) => league.slug === event.league);
  const eventId = event.sourceId ?? null;
  const path = meta ? `${meta.sport}/${meta.league}` : null;
  if (!path || !eventId || !/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/.test(path)) return null;
  return `https://site.api.espn.com/apis/site/v2/sports/${path}/videos?event=${encodeURIComponent(eventId)}`;
};

/** Live and finished games carry highlights; upcoming fixtures usually do not. */
const ORDER = { live: 0, final: 1, upcoming: 2 } as const;

/** Newest first inside a status: a highlights board wants the freshest clips. */
const byBoardOrder = (a: SportsEvent, b: SportsEvent) => {
  const order = ORDER[a.status] - ORDER[b.status];
  return order !== 0 ? order : new Date(b.startAt).getTime() - new Date(a.startAt).getTime();
};

function pickGames(events: SportsEvent[]): SportsEvent[] {
  const perLeague = new Map<string, number>();
  const chosen: SportsEvent[] = [];
  const seen = new Set<string>();

  for (const event of [...events].sort(byBoardOrder)) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const count = perLeague.get(event.league) ?? 0;
    if (count >= MAX_GAMES_PER_LEAGUE) continue;
    perLeague.set(event.league, count + 1);
    chosen.push(event);
    if (chosen.length >= MAX_GAMES) break;
  }

  return chosen;
}

const contextFor = (event: SportsEvent) => ({
  eventId: event.id,
  eventName: `${event.home.name} vs ${event.away.name}`,
  sport: event.sport,
  league: event.league,
  leagueName: event.leagueName,
  home: event.home.name,
  away: event.away.name,
  homeLogo: event.home.logo ?? null,
  awayLogo: event.away.logo ?? null,
  startAt: event.startAt,
  status: event.status,
  // The provider's team ids travel with the clip so a team page can be answered
  // from stored rows. Null when the scoreboard reported none — never guessed.
  homeId: event.home.id ?? null,
  awayId: event.away.id ?? null,
});

/**
 * The collection URL and fixture context, exported for the stored-index sweeper
 * (`highlights-sweep.ts`) so that a clip found by the sweeper is addressed and
 * described exactly as one found by the live board: same URL shape, same
 * provider-id gate, same namespaced event id. Two readers that derive these
 * separately would eventually disagree about what a clip is.
 */
export const matchVideosUrl = videosUrl;
export const highlightContextFor = contextFor;

async function readClips(event: SportsEvent) {
  const url = videosUrl(event);
  if (!url) return { url: null, httpStatus: null, clips: [] as SportsHighlightClip[] };
  const signal = AbortSignal.timeout(SUMMARY_TIMEOUT_MS);
  const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
  if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status, undefined);
  const clips = normalizeHighlights(await response.json(), contextFor(event));
  return { url, httpStatus: response.status, clips };
}

async function fetchHighlights(): Promise<SportsHighlightsBoard> {
  const board = await getSportsBoard();

  // The last week's finished fixtures, which is where the full-match
  // highlights live; the sweep carries its own render budget.
  const recent = await recentFinishedEvents();

  const games = pickGames([...board.events, ...recent]);
  const sources: { ok: boolean; url: string; httpStatus: number | null; error?: string; errorKind?: string }[] = [];

  const settled = await Promise.allSettled(games.map(readClips));
  const clips: SportsHighlightClip[] = [];
  // ESPN publishes clips for some competitions and not for others, so the
  // board counts the collections that actually answered with a clip rather
  // than the ones it asked.
  let read = 0;
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      if (result.value.clips.length) read += 1;
      clips.push(...result.value.clips);
      if (result.value.url) sources.push({ ok: true, url: result.value.url, httpStatus: result.value.httpStatus });
      continue;
    }
    const reason = result.reason;
    const url = reason instanceof EspnEndpointError ? reason.url : 'https://site.api.espn.com/apis/site/v2/sports';
    sources.push({ ok: false, ...espnFailureDetails(reason, url) });
  }

  const anyOk = sources.some((source) => source.ok);
  // A board with no clips is worse than useless on the homepage: fall back.
  if (anyOk && clips.length) {
    return {
      clips: clips.slice(0, MAX_CLIPS),
      status: sources.every((source) => source.ok) ? 'live' : 'partial',
      games: read,
      source: sources.find((source) => source.ok)!,
    };
  }
  return {
    clips: bundledHighlights(),
    status: 'unavailable',
    games: games.length,
    source: {
      ok: false,
      url: sources[0]?.url ?? 'https://site.api.espn.com/apis/site/v2/sports',
      httpStatus: sources[0]?.httpStatus ?? null,
      errorKind: sources[0]?.errorKind,
      error: sources[0]?.error ?? 'ESPN returned no highlight videos',
    },
  };
}

/** Cached highlight clips; concurrent callers share a single fan-out. */
export function getSportsHighlights(refresh = false): Promise<SportsHighlightsBoard> {
  const saved = cache.get('highlights');
  const ttl = saved?.board.status === 'unavailable' ? FAILURE_TTL : LIVE_TTL;
  if (!refresh && saved && Date.now() - saved.at < ttl) return Promise.resolve(saved.board);
  if (pending) return pending;
  const job = fetchHighlights().then((board) => {
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set('highlights', { at: Date.now(), board });
    return board;
  }).finally(() => { pending = null; });
  pending = job;
  return job;
}
