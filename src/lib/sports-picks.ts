/**
 * Graded match picks: a reader's side on one fixture, kept until ESPN reports a
 * result, then marked won or lost.
 *
 * Why this is a table and not a post. A pick used to become a post — free text
 * with the odds pasted into it — which is shareable but unanswerable: nothing on
 * the site could say whether the reader was right, so a prediction was decoration
 * and there was no reason to come back. A pick row has a side, the price ESPN
 * reported when it was made, and, once the fixture is finished, an outcome and a
 * point. That is what makes a leaderboard mean something.
 *
 * Three rules hold the whole thing honest:
 *
 *   1. **A pick is addressed the way this app addresses a match** — a catalog
 *      league slug plus ESPN's own numeric event id, both taken from the odds
 *      board that listed the fixture. Never from a team name, so a pick can be
 *      graded against a result without matching strings.
 *   2. **A pick locks at kickoff**, decided server-side from the kickoff ESPN
 *      reported, not from a clock in the reader's browser. A fixture whose
 *      kickoff cannot be parsed is treated as locked: an unverifiable pick is
 *      refused rather than accepted.
 *   3. **A pick is graded only from a result ESPN reported.** No score, no
 *      grade — it stays "awaiting a result" indefinitely rather than being
 *      settled by a guess, a default or a name. Grading writes only to rows
 *      still ungraded, so running it twice cannot change an outcome.
 *
 * Points are one per correct pick and nothing else. A price-weighted score would
 * compare readers who picked at different prices and cannot be computed at all
 * when ESPN reported no price, so the rail shows points alongside the record
 * (won from graded) and lets a reader judge the strike rate themselves.
 *
 * Every database function here is inert without a database: `hasDatabase` false,
 * or any query failure, resolves to an empty or refused answer with a reason
 * rather than throwing, and the surfaces that read it render nothing rather than
 * a leaderboard of nobody.
 */
import { ESPN_LEAGUES, type SportKind } from './sports-catalog';
import { validEntityId } from './espn-team';

export type PickSide = 'home' | 'draw' | 'away';
export type PickOutcome = 'won' | 'lost';

/** The sides a fixture can be picked on. Basketball and most sports cannot draw. */
export const PICK_SIDES: readonly PickSide[] = ['home', 'draw', 'away'];

/* ── Bounds ─────────────────────────────────────────────────────────────── */

/** Picks graded in one pass. Bounded so a pass cannot chase the whole table. */
export const GRADE_PER_PASS = 12;
/** The leaderboard's window, and how far `?days=` may reach. */
export const LEADERBOARD_DAYS = 30;
export const MAX_LEADERBOARD_DAYS = 365;
/** Rows on the rail, and the most a caller may ask for. */
export const LEADERBOARD_ROWS = 10;
export const MAX_LEADERBOARD_ROWS = 25;
/** A reader's own picks read back for one page. Newest first, so the fixtures
 *  on screen — which are upcoming — are always inside it. */
export const VIEWER_PICKS = 100;

const MAX_TEXT = 120;

/* ── What is stored ─────────────────────────────────────────────────────── */

export type MatchPick = {
  id: number;
  userId: number;
  league: string;
  eventId: string;
  side: PickSide;
  /** The team names ESPN reported when the pick was made, so the row still reads
   *  correctly if a club is later renamed. */
  home: string;
  away: string;
  /** The decimal price ESPN reported for this side, or null when it reported none. */
  price: number | null;
  kickoffAt: string | null;
  createdAt: string;
  gradedAt: string | null;
  outcome: PickOutcome | null;
  points: number | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type LeaderRow = {
  userId: number;
  name: string | null;
  username: string | null;
  graded: number;
  won: number;
  points: number;
};

/** Where the viewer stands in the same window, or null with nothing graded. */
export type ViewerStanding = { rank: number; graded: number; won: number; points: number };

export type PicksLeaderboard = {
  ok: boolean;
  reason?: 'no-database' | 'query-failed';
  days: number;
  rows: LeaderRow[];
  /** Distinct readers with at least one graded pick in the window. */
  readers: number;
  viewer: ViewerStanding | null;
};

export const PICKS_UNAVAILABLE: PicksLeaderboard = {
  ok: false, reason: 'no-database', days: LEADERBOARD_DAYS, rows: [], readers: 0, viewer: null,
};

/* ── The rules (pure: decided before any query) ─────────────────────────── */

/**
 * The three sanitizers every read and write goes through. Exported because the
 * store parses rows with the same rules this module validates input with, so a
 * value cannot be accepted on the way in and read back differently.
 */
export const text = (value: unknown, max = MAX_TEXT) =>
  (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

export const knownLeague = (value: unknown) => {
  const slug = text(value, 64);
  return slug && ESPN_LEAGUES.some((league) => league.slug === slug) ? slug : null;
};

export const side = (value: unknown): PickSide | null =>
  (typeof value === 'string' && (PICK_SIDES as readonly string[]).includes(value) ? (value as PickSide) : null);

/**
 * A score worth grading against.
 *
 * An integer between 0 and 999, or nothing. A fractional or impossible score is
 * refused rather than truncated, because rounding one would settle a pick on a
 * result nobody reported.
 */
export const score = (value: unknown): number | null =>
  (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999 ? value : null);

/**
 * A decimal price worth showing. ESPN reports none for many markets, and a price
 * this site cannot read is stored as null rather than as a plausible number:
 * rounding happens only inside the range a bookmaker actually quotes, so 1.007
 * is refused rather than rounded up into a price nobody offered.
 */
export function normalisePrice(value: unknown): number | null {
  const price = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(price) || price < 1.01 || price > 1000) return null;
  return Math.round(price * 100) / 100;
}

/**
 * The sides this fixture may be picked on.
 *
 * Football can draw; the sports that cannot are not offered a third outcome they
 * could never produce — the same rule the match poll has always used.
 */
export function pickSidesFor(sport: SportKind | string | null | undefined): PickSide[] {
  return sport === 'football' ? ['home', 'draw', 'away'] : ['home', 'away'];
}

/**
 * Whether a pick is too late.
 *
 * Decided from the kickoff the feed reported, never from a browser clock. A
 * kickoff that cannot be parsed is treated as locked: this site cannot prove the
 * fixture has not started, so it does not take the pick.
 */
export function pickIsLocked(kickoffAt: string | null | undefined, now: number = Date.now()): boolean {
  const ms = typeof kickoffAt === 'string' ? Date.parse(kickoffAt) : NaN;
  if (Number.isNaN(ms)) return true;
  return ms <= now;
}

/**
 * Whether one pick beats another, from the scores ESPN reported.
 *
 * Returns null when either score is missing or impossible, which leaves the pick
 * ungraded: a fixture with no reported result is not a draw, not a loss and not
 * a win, and guessing one would put a fabricated number on a leaderboard.
 */
export function gradePick(
  picked: PickSide, homeScore: number | null | undefined, awayScore: number | null | undefined,
): { outcome: PickOutcome; points: number } | null {
  const home = score(homeScore);
  const away = score(awayScore);
  if (home === null || away === null) return null;
  const result: PickSide = home > away ? 'home' : home < away ? 'away' : 'draw';
  return result === picked ? { outcome: 'won', points: 1 } : { outcome: 'lost', points: 0 };
}

/** One fixture, addressed the way the board addresses it. */
export function pickEventKey(league: string, eventId: string): string {
  return `${league}:${eventId}`;
}

/**
 * What a pick reads as, in the team names ESPN reported when it was made.
 *
 * A draw has no team to name, and saying "Draw" is the honest label for it.
 */
export function pickedName(pick: { side: PickSide; home: string; away: string }): string {
  return pick.side === 'home' ? pick.home : pick.side === 'away' ? pick.away : 'The draw';
}

/** How a rank reads. 1st, 2nd, 3rd, 4th, 11th, 21st — not 1th or 3st. */
export function ordinal(value: number): string {
  const rank = Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  if (!rank) return '—';
  const teens = rank % 100;
  if (teens >= 11 && teens <= 13) return `${rank}th`;
  return `${rank}${['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th'}`;
}

/** The viewer's picks keyed by fixture, for the cards on one page. */
export function indexPicksByEvent(picks: readonly MatchPick[]): Map<string, MatchPick> {
  const index = new Map<string, MatchPick>();
  for (const pick of picks) index.set(pickEventKey(pick.league, pick.eventId), pick);
  return index;
}

export const clampLeaderboardDays = (value: unknown): number => {
  const days = Math.trunc(Number(value));
  if (!Number.isFinite(days) || days < 1) return LEADERBOARD_DAYS;
  return Math.min(MAX_LEADERBOARD_DAYS, days);
};

export const clampLeaderboardRows = (value: unknown): number => {
  const rows = Math.trunc(Number(value));
  if (!Number.isFinite(rows) || rows < 1) return LEADERBOARD_ROWS;
  return Math.min(MAX_LEADERBOARD_ROWS, rows);
};

/* ── Taking a pick ──────────────────────────────────────────────────────── */

/** What a reader clicked, plus what ESPN reported about the fixture. */
export type PickCandidate = {
  league: unknown;
  eventId: unknown;
  side: unknown;
  sport: SportKind | string | null | undefined;
  home: unknown;
  away: unknown;
  kickoff: string | null | undefined;
  price: unknown;
};

export type NewPick = {
  league: string;
  eventId: string;
  side: PickSide;
  home: string;
  away: string;
  price: number | null;
  kickoffAt: string | null;
};

export type PickRefusal =
  | { ok: false; reason: 'no-fixture'; message: string }
  | { ok: false; reason: 'unknown-side'; message: string }
  | { ok: false; reason: 'locked'; message: string };

/**
 * Turn a click into something that may be stored, or say why it may not.
 *
 * Everything here is checked against what the feed reported, not against what
 * the request claimed: the league must be in the catalog, the event id must be
 * ESPN's numeric id, the side must be one this fixture can produce, and the
 * kickoff must still be in the future.
 */
export function pickFromFixture(candidate: PickCandidate, now: number = Date.now()): { ok: true; pick: NewPick } | PickRefusal {
  const league = knownLeague(candidate.league);
  const eventId = typeof candidate.eventId === 'string' && validEntityId(candidate.eventId) ? candidate.eventId : null;
  const home = text(candidate.home);
  const away = text(candidate.away);
  if (!league || !eventId || !home || !away) {
    return { ok: false, reason: 'no-fixture', message: 'That fixture is not listed with an ESPN match id, so a pick on it could never be graded.' };
  }

  const picked = side(candidate.side);
  const offered = pickSidesFor(candidate.sport);
  if (!picked || !offered.includes(picked)) {
    return {
      ok: false, reason: 'unknown-side',
      message: offered.includes('draw')
        ? 'Choose home, draw or away.'
        : 'This fixture cannot end in a draw, so it is picked home or away.',
    };
  }

  const kickoffAt = typeof candidate.kickoff === 'string' && !Number.isNaN(Date.parse(candidate.kickoff))
    ? new Date(Date.parse(candidate.kickoff)).toISOString()
    : null;
  if (pickIsLocked(kickoffAt, now)) {
    return { ok: false, reason: 'locked', message: 'Picks lock at kickoff, and this fixture has started or its kickoff was not reported.' };
  }

  return {
    ok: true,
    pick: { league, eventId, side: picked, home, away, price: normalisePrice(candidate.price), kickoffAt },
  };
}

/** One outcome written onto one pick. */
export type Grading = { id: number; outcome: PickOutcome; points: number; homeScore: number; awayScore: number };
