/**
 * The bounded highlights sweeper: how the stored index gets filled.
 *
 * ESPN has no bulk highlights endpoint and no date range. A game's clips live on
 * that game's own video collection and a scoreboard takes one date per request,
 * so "every clip in every competition" is not one call — it is one scoreboard per
 * competition per day, plus one collection per game. Across the 121-competition
 * catalog and a week that is thousands of requests, which is why they are not
 * made during a render: this module walks the catalog **a slice at a time**, in
 * the background, and writes what it finds into `sports_highlight_clips`.
 *
 * The slice is the whole design:
 *
 *   - at most `CELLS_PER_PASS` scoreboards and `GAMES_PER_PASS` collections per
 *     pass, at `CONCURRENCY` in flight, inside one shared `SWEEP_DEADLINE_MS`;
 *   - a cell (one competition, one UTC day) is walked at most once per
 *     `CELL_TTL`, and the cursor lives in Postgres, so coverage survives a deploy
 *     and is shared by every instance instead of restarting at the first league;
 *   - a collection that answered **with clips** is never asked again — the clips
 *     are stored permanently. One that answered empty is retried after
 *     `REPROBE_EMPTY_AFTER_MS`, because ESPN publishes highlights hours after
 *     full time;
 *   - passes are rate-limited per process, including after a failure, so a
 *     refused or throttled ESPN is backed off from rather than hammered.
 *
 * Consequence worth stating plainly: a complete first pass over the catalog takes
 * many passes, i.e. hours of traffic (or of a scheduler hitting
 * `/api/sports/highlights/sweep`). It is not instant, and it cannot be made
 * instant without the unbounded fan-out this module exists to avoid.
 *
 * Nothing here invents a clip. A cell nobody answered is not recorded as walked,
 * a game with no provider id is never asked, and a competition ESPN publishes no
 * per-game clips for (the Premier League and the NFL answer with an empty list)
 * simply stays empty on the match side — its league video news, swept from the
 * existing video-news feed, is what fills it.
 */
import { after } from 'next/server';
import { parseEspnEvents } from './espn';
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnSportsScoreboardUrl } from './espn-endpoints';
import { highlightContextFor, matchVideosUrl } from './espn-highlights-feed';
import { normalizeHighlights, type SportsHighlightClip } from './espn-highlights';
import { VIDEO_NEWS_SLUGS, getSportsVideoNews } from './espn-video-news-feed';
import {
  INDEX_UNAVAILABLE, highlightsStore, probeKey, sweepCellKey,
  type HighlightsIndexSummary, type HighlightsStore, type StoredClip,
} from './highlights-index';
import { ESPN_LEAGUES, type EspnLeague } from './sports-catalog';
import type { SportsEvent } from './sports';

/* ── Bounds ─────────────────────────────────────────────────────────────── */

/** How many days back a pass looks. A week matches the live board's own pool. */
const SWEEP_DAYS = 7;
/** `?days=` may reach further, but a pass is still bounded by the cells below. */
const MAX_SWEEP_DAYS = 30;
/** Scoreboards per pass. One per cell, so this is the pass's discovery cost. */
export const CELLS_PER_PASS = 24;
/** Video collections per pass: the clip cost, one request per game. */
export const GAMES_PER_PASS = 24;
/** A single competition asked for by name is walked completely, not sliced. */
export const LEAGUE_GAMES_MAX = 40;
/** One shared deadline for a whole pass, so it can never overrun a request. */
export const SWEEP_DEADLINE_MS = 4_000;
const REQUEST_TIMEOUT_MS = 6_000;
/**
 * Gentler than the live board's 24: this is background work sharing an upstream
 * host with every other ESPN surface on the site, and a throttle there would
 * cost the scores board, matches, standings, odds and leaders too.
 */
const CONCURRENCY = 8;
/** A walked cell is not worth walking again for six hours. */
export const CELL_TTL = 6 * 60 * 60_000;
/** An empty collection is worth asking again once ESPN has had time to publish. */
export const REPROBE_EMPTY_AFTER_MS = 24 * 60 * 60_000;
/** A pass a page load triggers on the way past, at most once per ten minutes. */
export const OPPORTUNISTIC_INTERVAL_MS = 10 * 60_000;
/** An explicit press of "sweep more" is allowed more often, but not spammed. */
export const EXPLICIT_INTERVAL_MS = 30_000;
/** One named competition, walked completely, at most once per five minutes. */
export const LEAGUE_INTERVAL_MS = 5 * 60_000;
/** League video news has its own fan-out; it joins a pass at most this often. */
const NEWS_TTL = 15 * 60_000;

/* ── Result ─────────────────────────────────────────────────────────────── */

export type SweepPass = {
  ok: boolean;
  /** Why a pass did no work. Absent when it did. */
  reason?: 'no-database' | 'rate-limited' | 'unknown-competition' | 'failed';
  /** Scoreboard cells walked. */
  cells: number;
  /** Game collections asked. */
  games: number;
  /** Match clips written (inserted or refreshed). */
  clips: number;
  /** League video clips written. */
  leagueClips: number;
  /** Upstream requests this pass made, so its cost is never a guess. */
  requests: number;
  /** The deadline ran out before the slice was finished; the rest waits. */
  truncated: boolean;
  startedAt: string;
  durationMs: number;
  summary: HighlightsIndexSummary;
};

export type SweepPassOptions = {
  /** One competition walked completely instead of a slice of the catalog. */
  league?: string | null;
  days?: number | null;
  /** Bypass the opportunistic rate limit (a press, or a scheduler). */
  force?: boolean;
  /** Test seam: a fake store, so a pass can be tested without a database. */
  store?: HighlightsStore;
  /** Test seam: the clock. */
  now?: () => number;
};

const EMPTY_PASS = {
  cells: 0, games: 0, clips: 0, leagueClips: 0, requests: 0, truncated: false, durationMs: 0,
};

/* ── Plan ───────────────────────────────────────────────────────────────── */

type Cell = { key: string; meta: EspnLeague; date: string };

/** YYYYMMDD in UTC — the only form ESPN's `dates` parameter accepts. */
export const espnDate = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/**
 * The cells a pass would like to walk, in the order it should walk them.
 *
 * Day-major on purpose: today's fixtures across every competition come before
 * yesterday's anywhere, so a reader who arrives during the first passes sees the
 * freshest sport the catalog has, and the long tail of competitions fills in
 * behind it. Exported because the page says how far coverage has got.
 */
export function cellPlan(leagueSlug: string | null, days: number, nowMs: number): Cell[] {
  const wanted = Number.isFinite(days) ? Math.min(MAX_SWEEP_DAYS, Math.max(1, Math.trunc(days))) : SWEEP_DAYS;
  const leagues = leagueSlug ? ESPN_LEAGUES.filter((meta) => meta.slug === leagueSlug) : ESPN_LEAGUES;
  const cells: Cell[] = [];
  for (let day = 0; day < wanted; day += 1) {
    const date = espnDate(nowMs - day * 86_400_000);
    for (const meta of leagues) cells.push({ key: sweepCellKey(meta.slug, date), meta, date });
  }
  return cells;
}

/** Live before finished, newest first inside a state: the order clips matter in. */
const ORDER = { live: 0, final: 1 } as const;

/**
 * The games worth asking, in the order to ask them.
 *
 * An upcoming fixture is excluded: it has no clips yet, and asking one would
 * spend a request on a collection that is empty by definition. A game with no
 * provider id cannot be addressed at all, so it is dropped rather than guessed.
 */
export function candidateGames(events: SportsEvent[]): SportsEvent[] {
  const seen = new Set<string>();
  return events
    .filter((event) => (event.status === 'live' || event.status === 'final') && !!probeKey(event))
    .sort((a, b) => {
      const order = ORDER[a.status as keyof typeof ORDER] - ORDER[b.status as keyof typeof ORDER];
      return order !== 0 ? order : new Date(b.startAt).getTime() - new Date(a.startAt).getTime();
    })
    .filter((event) => {
      const key = probeKey(event)!;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Bounded fan-out with a shared deadline; one failure never loses the pass. */
async function settle<T>(jobs: (() => Promise<T>)[], deadlineAt: number): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) {
      // A job that would start after the deadline is abandoned, not attempted:
      // that is what keeps a pass inside its budget on a slow upstream.
      if (Date.now() >= deadlineAt) break;
      const index = next++;
      try {
        results.push(await jobs[index]());
      } catch {
        // One competition that will not answer is not a reason to lose the rest.
      }
    }
  }));
  return results;
}

/* ── The pass ───────────────────────────────────────────────────────────── */

let passJob: Promise<SweepPass> | null = null;
/** Key → when a pass last started, so failures back off too. */
const lastPass = new Map<string, number>();
let lastNewsAt = 0;

/** Test seam: forget the rate limits and any in-flight pass. */
export function resetHighlightsSweep(): void {
  lastPass.clear();
  lastNewsAt = 0;
  passJob = null;
}

/**
 * One bounded pass. Concurrent callers share it; a caller inside the rate limit
 * gets the reason instead of a second fan-out.
 *
 * Never rejects: a sweep is background work, and a page that triggered one must
 * not have to handle its failure.
 */
export function runHighlightsSweep(options: SweepPassOptions = {}): Promise<SweepPass> {
  const store = options.store ?? highlightsStore;
  const now = options.now ?? Date.now;
  const finish = (extra: Partial<SweepPass>): Promise<SweepPass> => Promise.resolve({
    ok: false, ...EMPTY_PASS, startedAt: new Date(now()).toISOString(), summary: INDEX_UNAVAILABLE, ...extra,
  });

  // Without storage there is nothing to fill, so no request is made at all.
  if (!store.available()) return finish({ reason: 'no-database' });

  const slug = typeof options.league === 'string' && options.league.trim() ? options.league.trim() : null;
  if (slug && !ESPN_LEAGUES.some((meta) => meta.slug === slug)) return finish({ reason: 'unknown-competition' });

  const key = slug ? `league:${slug}` : 'catalog';
  const interval = options.force
    ? (slug ? LEAGUE_INTERVAL_MS : EXPLICIT_INTERVAL_MS)
    : OPPORTUNISTIC_INTERVAL_MS;
  const nowMs = now();
  // A pass already running is shared rather than refused: three renders arriving
  // together get one fan-out and one answer, not two rejections and a third pass.
  if (passJob) return passJob;
  if (nowMs - (lastPass.get(key) ?? 0) < interval) return finish({ reason: 'rate-limited' });

  // Recorded before the work: a pass that fails still backs off, which is what
  // keeps a refused ESPN from being asked again on every page load.
  lastPass.set(key, nowMs);
  const startedAt = Date.now();
  const job = sweep(options, store, slug).then(
    (pass) => pass,
    (error: unknown) => {
      // A pass that threw is reported, not raised: the caller is a page render.
      console.warn('[highlights-sweep] pass failed:', (error as Error)?.message);
      return {
        ok: false, ...EMPTY_PASS, reason: 'failed' as const,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        summary: INDEX_UNAVAILABLE,
      };
    },
  ).finally(() => { passJob = null; });
  passJob = job;
  return job;
}

/**
 * Advance coverage once the current response has been sent, without waiting for it.
 *
 * This is what makes traffic-driven coverage real. A bare fire-and-forget call can
 * be frozen the moment its response leaves on a serverless host — requests started,
 * nothing stored — whereas `after` is Next's supported way to keep background work
 * running past the response, and it needs no scheduler and no cron entry to do it.
 *
 * Outside a request scope (a unit test, a script, or a host with no such scope)
 * `after` throws, so the nudge falls back to the fire-and-forget call it replaces:
 * identical behaviour, never a throw for the caller. A pass never rejects, reports
 * its own reason when it is refused or rate-limited, and is bounded to one per ten
 * minutes per process, so a page load can never turn into a fan-out.
 */
export function nudgeHighlightsSweep(options: SweepPassOptions = {}): void {
  try {
    after(() => runHighlightsSweep(options));
  } catch {
    void runHighlightsSweep(options);
  }
}

async function sweep(options: SweepPassOptions, store: HighlightsStore, slug: string | null): Promise<SweepPass> {
  // Real clock throughout: cell dates are ESPN's `dates` parameter and the
  // deadline has to be a wall-clock one. The injected clock in `runHighlightsSweep`
  // only decides whether a pass is due, which is what a test needs to move.
  const startedAt = Date.now();
  const deadline = () => Date.now() - startedAt >= SWEEP_DEADLINE_MS;
  const budget = () => Math.max(750, Math.min(REQUEST_TIMEOUT_MS, SWEEP_DEADLINE_MS - (Date.now() - startedAt)));
  let requests = 0;
  let truncated = false;

  const days = Number.isFinite(options.days as number) ? (options.days as number) : SWEEP_DAYS;
  const plan = cellPlan(slug, days, startedAt);
  // A named competition is walked completely; the catalog is walked a slice at a
  // time and picks up where the stored cursor left off.
  const fresh = slug ? new Set<string>() : await store.freshCells(plan.map((cell) => cell.key), CELL_TTL);
  const waiting = plan.filter((cell) => !fresh.has(cell.key));
  const cap = slug ? waiting.length : CELLS_PER_PASS;
  const cells = waiting.slice(0, cap);
  // More cells waiting than this pass took: coverage is behind, by design.
  if (waiting.length > cells.length) truncated = true;

  /* 1. Discover fixtures: one scoreboard per cell. */
  const readCell = async (cell: Cell) => {
    const url = espnSportsScoreboardUrl(cell.meta, cell.date);
    requests += 1;
    const response = await fetch(url, {
      headers: ESPN_REQUEST_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(budget()),
    });
    if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status);
    const payload = await response.json();
    return { cell, events: parseEspnEvents(payload, cell.meta) };
  };

  const walked = await settle(cells.map((cell) => async () => (deadline() ? null : readCell(cell))), startedAt + SWEEP_DEADLINE_MS);
  const answered = walked.filter((entry): entry is { cell: Cell; events: SportsEvent[] } => !!entry);
  if (answered.length < cells.length) truncated = true;

  /* 2. Ask the games nobody has asked yet: one collection per game. */
  const events = answered.flatMap((entry) => entry.events);
  const cellOf = new Map<string, string>();
  for (const entry of answered) {
    for (const event of entry.events) {
      const key = probeKey(event);
      if (key) cellOf.set(key, entry.cell.key);
    }
  }
  const candidates = candidateGames(events);
  const gameCap = slug ? LEAGUE_GAMES_MAX : GAMES_PER_PASS;
  const askable = await store.probeable(candidates.map((event) => probeKey(event)!), REPROBE_EMPTY_AFTER_MS);
  const unasked = candidates.filter((event) => askable.has(probeKey(event)!));
  const games = unasked.slice(0, gameCap);
  // Games already asked are not truncation; games this pass had no room for are.
  if (unasked.length > games.length) truncated = true;

  const readGame = async (event: SportsEvent) => {
    const url = matchVideosUrl(event);
    const key = probeKey(event)!;
    if (!url) return { key, url: null, clips: [] as SportsHighlightClip[] };
    requests += 1;
    const response = await fetch(url, {
      headers: ESPN_REQUEST_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(budget()),
    });
    if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status);
    const clips = normalizeHighlights(await response.json(), highlightContextFor(event));
    return { key, url, clips };
  };

  const read = await settle(games.map((event) => async () => (deadline() ? null : readGame(event))), startedAt + SWEEP_DEADLINE_MS);
  const collections = read.filter((entry): entry is { key: string; url: string | null; clips: SportsHighlightClip[] } => !!entry);
  if (collections.length < games.length) truncated = true;

  /* 3. Write everything found, in as few statements as possible. */
  const stored: StoredClip[] = [];
  const probes = new Map<string, number>();
  const perCell = new Map<string, { games: number; clips: number }>();
  for (const collection of collections) {
    // A collection that answered is recorded whether or not it had clips: that
    // is what stops the same empty collection being asked on every pass.
    probes.set(collection.key, collection.clips.length);
    const cellKey = cellOf.get(collection.key);
    if (cellKey) {
      const tally = perCell.get(cellKey) ?? { games: 0, clips: 0 };
      tally.games += 1;
      tally.clips += collection.clips.length;
      perCell.set(cellKey, tally);
    }
    for (const clip of collection.clips) stored.push({ kind: 'match', clip, sourceUrl: collection.url });
  }
  // A cell that answered with no askable game at all is still walked: recording
  // it is what lets the cursor advance past a competition with no fixtures today.
  for (const entry of answered) {
    if (!perCell.has(entry.cell.key)) perCell.set(entry.cell.key, { games: 0, clips: 0 });
  }

  const clips = stored.length ? await store.store(stored) : 0;
  await store.recordProbes([...probes].map(([key, count]) => ({ key, clips: count })));
  await store.recordCells([...perCell].map(([key, tally]) => ({ key, games: tally.games, clips: tally.clips })));

  /* 4. League video news, when it is due. */
  let leagueClips = 0;
  if (startedAt - lastNewsAt >= NEWS_TTL) {
    lastNewsAt = startedAt;
    try {
      const board = await getSportsVideoNews(true);
      // One request per configured competition, whether or not any answered.
      requests += VIDEO_NEWS_SLUGS.length;
      if (board.clips.length) {
        leagueClips = await store.store(board.clips.map((clip) => ({ kind: 'league' as const, clip, sourceUrl: board.source.url })));
      }
    } catch {
      // The news feed reports its own failures; a pass does not fail for it.
    }
  }

  const durationMs = Date.now() - startedAt;
  return {
    ok: true,
    cells: answered.length,
    games: collections.length,
    clips,
    leagueClips,
    requests,
    truncated,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    summary: await store.summary(),
  };
}
