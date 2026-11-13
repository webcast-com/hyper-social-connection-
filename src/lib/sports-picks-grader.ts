/**
 * Grading picks against results ESPN has already reported.
 *
 * A pass reads the picks still awaiting a result, looks each one up in a sports
 * board by league and ESPN's event id, and writes an outcome only where that
 * board reports the fixture as finished with both scores. A fixture it cannot
 * settle is left alone: an ungraded pick is an honest "awaiting a result", while
 * a guessed one is a fabricated number on a leaderboard.
 *
 * The board is read with no cache bypass, so a pass scheduled behind a page that
 * has just fetched it — the homepage — costs no ESPN request at all. That is why
 * the pass reports what it graded and not what it cost: it cannot attribute a
 * request it did not make.
 */
import { after } from 'next/server';
import { hasDatabase } from '@/lib/prisma';
import { validEntityId } from './espn-team';
import { getSportsBoard, type SportsBoard, type SportsEvent } from './sports';
import {
  GRADE_PER_PASS, gradePick, pickEventKey, score,
  type Grading,
} from './sports-picks';
import { picksStore, type PicksStore } from './sports-picks-store';

/* ── The grading pass ───────────────────────────────────────────────────── */

export type GradingPass = {
  ok: boolean;
  reason?: 'no-database' | 'no-board' | 'query-failed';
  /** Ungraded picks this pass looked at. */
  examined: number;
  /** Picks it wrote an outcome onto. */
  graded: number;
  /** Picks the board could not settle, left ungraded on purpose. */
  awaiting: number;
};

const EMPTY_PASS: GradingPass = { ok: false, reason: 'no-database', examined: 0, graded: 0, awaiting: 0 };

const failed = (reason: 'query-failed', error: unknown) => {
  console.warn('[sports-picks] grading pass failed:', (error as Error)?.message);
  return reason;
};

/**
 * The results this pass may grade against: fixtures ESPN reports as finished,
 * with both scores, addressed by league and ESPN's event id.
 *
 * A sample fixture is not a result and never grades anything.
 */
export function reportedResults(board: SportsBoard | null | undefined): Map<string, { home: number; away: number }> {
  const results = new Map<string, { home: number; away: number }>();
  const events: readonly SportsEvent[] = board?.events ?? [];
  for (const event of events) {
    if (event.source !== 'espn' || event.status !== 'final' || !event.sourceId) continue;
    if (!validEntityId(event.sourceId)) continue;
    const home = score(event.home?.score);
    const away = score(event.away?.score);
    if (home === null || away === null) continue;
    results.set(pickEventKey(event.league, event.sourceId), { home, away });
  }
  return results;
}

/**
 * Grade what a board already reported.
 *
 * The board is read through `getSportsBoard()` with no cache bypass, so on a page
 * that has just fetched it — the homepage — this pass costs no ESPN request at
 * all. It cannot attribute a request it did not make, which is why the pass
 * reports what it graded rather than what it cost.
 */
export async function gradePicksFromBoard(options: {
  board?: SportsBoard | null;
  limit?: number;
  /** Injectable so a pass can be tested without a database. */
  store?: PicksStore;
} = {}): Promise<GradingPass> {
  const store = options.store ?? picksStore;
  if (!store.available()) return EMPTY_PASS;
  try {
    const picks = await store.ungraded(options.limit ?? GRADE_PER_PASS);
    if (!picks.length) return { ok: true, examined: 0, graded: 0, awaiting: 0 };

    const board = options.board ?? await getSportsBoard();
    const results = reportedResults(board);
    if (!results.size) return { ok: true, reason: 'no-board', examined: picks.length, graded: 0, awaiting: picks.length };

    const entries: Grading[] = [];
    for (const pick of picks) {
      const result = results.get(pickEventKey(pick.league, pick.eventId));
      if (!result) continue;
      const graded = gradePick(pick.side, result.home, result.away);
      if (graded) entries.push({ id: pick.id, ...graded, homeScore: result.home, awayScore: result.away });
    }
    const written = await store.grade(entries);
    return { ok: true, examined: picks.length, graded: written, awaiting: picks.length - written };
  } catch (error) {
    return { ...EMPTY_PASS, reason: failed('query-failed', error) };
  }
}

let lastGradingAt = 0;
/** One pass per ten minutes per process, the rate the highlights sweep uses. */
const GRADING_INTERVAL_MS = 10 * 60_000;

export function resetPickGrading() {
  lastGradingAt = 0;
}

/**
 * Schedule a grading pass past this response.
 *
 * `after` keeps it off the render; the fallback covers a caller with no request
 * scope, where `after` throws. Rate-limited so the busiest page on the site
 * cannot turn into a grading loop, and never able to fail a render: a page that
 * cannot grade still shows the picks it has.
 */
export function nudgePickGrading(): void {
  if (!hasDatabase) return;
  const now = Date.now();
  if (now - lastGradingAt < GRADING_INTERVAL_MS) return;
  lastGradingAt = now;
  try {
    after(() => { void gradePicksFromBoard(); });
  } catch {
    void gradePicksFromBoard();
  }
}
