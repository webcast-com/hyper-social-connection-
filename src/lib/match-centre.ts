/**
 * The homepage's live match centre: which fixtures it shows, and in what order.
 *
 * Why this file exists. The homepage used to render the same fixtures three
 * times from two different boards: a compact summary in the mobile column and a
 * full rail in the desktop column, each with its own `getSportsBoard()` call, so
 * a cold cache paid for the 121-competition fan-out twice and — worse — the two
 * surfaces could disagree, because they were two snapshots taken at different
 * moments. On top of that, a fixture the For You feed already carried as a match
 * card was repeated verbatim in the rail beside it.
 *
 * So one board is fetched per render and handed to both surfaces as a prop, and
 * the rows each surface shows come from one rule, here, where it can be tested
 * without a browser:
 *
 *   1. live first, then upcoming, then results — the board's own order;
 *   2. within that, one fixture per competition before a second fixture from any
 *      competition, so a rail of four rows is four competitions rather than four
 *      Premier League games;
 *   3. a fixture the feed already shows as a card is *deprioritised*, not
 *      dropped — and never deprioritised while it is live.
 *
 * Rule 3 is a preference and not an exclusion on purpose. Dropping every
 * fixture the feed mentions would empty the centre on a quiet day, when the two
 * or three fixtures that exist are exactly the ones a reader wants scores for;
 * a centre that shows nothing because the feed is already showing it is not
 * deduplication, it is a hole. So the centre fills its rows with fixtures the
 * reader has not just seen, and only then repeats one, and a live fixture is
 * never treated as a repeat at all: a score that is moving is the reason this
 * surface exists.
 *
 * Nothing here reads a database or a network. It orders and bounds a list it is
 * given, so the same rule serves the mobile summary, the desktop rail and the
 * feed's Live tab, and a caller cannot get a different answer by accident.
 *
 * The Live tab itself lists every fixture the board reports, so it uses
 * `orderCentreEvents` directly and not this selection: a list that shows
 * everything has no scarce rows to spend on one fixture per competition. What it
 * shares with the centre is the order — live first, then upcoming, then results.
 */
import type { SportsEvent } from './sports';

/** Rows in the desktop rail. */
export const MATCH_CENTRE_ROWS = 4;
/** Rows in the compact mobile summary, which shares a column with the feed. */
export const MATCH_CENTRE_ROWS_COMPACT = 2;
/** Hard ceiling on rows, so a caller cannot ask for the whole board. */
export const MAX_CENTRE_ROWS = 12;

const STATUS_ORDER: Record<SportsEvent['status'], number> = { live: 0, upcoming: 1, final: 2 };

export type MatchCentreOptions = {
  /** Rows to return, clamped to `[1, MAX_CENTRE_ROWS]`. */
  limit?: number;
  /**
   * Ids of fixtures this page already renders as feed cards. Deprioritised, not
   * dropped; ignored for live fixtures.
   */
  shownEventIds?: Iterable<string>;
};

/** Live first, then upcoming, then results. Ties keep the board's own order. */
export function orderCentreEvents(events: readonly SportsEvent[]): SportsEvent[] {
  return [...events].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

/**
 * The fixtures a reader can pick right now: ESPN-reported and not yet started.
 *
 * A sample fixture is never pickable, because there is no result to grade it
 * against, and a fixture ESPN reported no id for cannot be addressed later.
 */
export function pickableEvents(events: readonly SportsEvent[]): SportsEvent[] {
  return events.filter((event) => event.source === 'espn' && event.status === 'upcoming' && !!event.sourceId);
}

/**
 * The rows for one match-centre surface.
 *
 * Returns fewer rows than `limit` only when the board has fewer fixtures; it
 * never returns none because the reader has already seen them elsewhere.
 */
export function selectMatchCentreRows(events: readonly SportsEvent[], options: MatchCentreOptions = {}): SportsEvent[] {
  const limit = Math.min(MAX_CENTRE_ROWS, Math.max(1, Math.trunc(options.limit ?? MATCH_CENTRE_ROWS)));
  const shown = new Set(options.shownEventIds ?? []);
  const ordered = orderCentreEvents(events);
  // Tier 1: fixtures this page has not already put in front of the reader as a
  // card. Tier 2: every fixture, which is the rule the centre had before this
  // file existed, so a quiet day still fills its rows.
  const fresh = ordered.filter((event) => event.status === 'live' || !shown.has(event.id));
  const rows: SportsEvent[] = [];
  for (const tier of [fresh, ordered]) {
    for (const event of tier) {
      if (rows.length >= limit) break;
      if (!rows.some((row) => row.league === event.league)) rows.push(event);
    }
    for (const event of tier) {
      if (rows.length >= limit) break;
      if (!rows.includes(event)) rows.push(event);
    }
    if (rows.length >= limit) break;
  }
  return rows;
}

/** How many fixtures in a list ESPN reports as live right now. */
export function liveFixtureCount(events: readonly SportsEvent[]): number {
  return events.filter((event) => event.status === 'live' && event.source === 'espn').length;
}

/** A feed card, in the only two respects the Live tab's own summary needs. */
type LiveCard = { type?: string | null; event?: { status?: string | null; source?: string | null } | null };

/**
 * What the Live tab may claim about itself, counted from the cards it was given.
 *
 * The count is the honesty-critical part of that sentence, so it lives here
 * rather than in the component: a fixture this site invented (`source: 'demo'`)
 * is never counted as live, and a card that is not a fixture — a league video, a
 * prediction — never counts as one either. A tab that says "3 live" when nothing
 * is in play is worse than a tab that says nothing.
 */
export function summariseLiveCards(cards: readonly LiveCard[]): { live: number; fixtures: number } {
  const fixtures = cards.filter((card) => card?.type === 'sports' && !!card.event);
  return {
    live: fixtures.filter((card) => card.event!.status === 'live' && card.event!.source !== 'demo').length,
    fixtures: fixtures.length,
  };
}
