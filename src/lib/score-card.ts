/**
 * The NFL & basketball dashboard's score card, as the feed renders it.
 *
 * Basketball and American football fixtures in the For You and Live tabs are
 * drawn as the dashboard's own match card: two crests either side of a "V/S",
 * a competition chip with the league's colour, a clock pill, one row per side
 * with its score, and a footer naming the broadcaster. The rest of the feed's
 * match card — its author header, prediction and comment/poll/share controls —
 * is unchanged, so the card still behaves like a post.
 *
 * Everything a reader could be misled by is decided here rather than in the
 * component, because these are the parts that must not drift:
 *
 *   - a card links to the dashboard's match page **only** for a fixture ESPN
 *     reported with a numeric id, in a competition the dashboard actually serves.
 *     A sample fixture this site invented has no match page anywhere, and a
 *     league the dashboard does not know would ask the wrong ESPN feed, so both
 *     fall back rather than link to something that cannot answer;
 *   - a fixture this site invented is never clocked as live or as a result. It
 *     shows its kickoff like any other upcoming fixture, and the card's own chip
 *     still says "Sample fixture";
 *   - a score ESPN did not report is an em dash, never a zero, and a broadcaster
 *     ESPN did not name is "TV TBD", never a guess.
 *
 * Nothing here reads a database or a network, so the card stays client-safe.
 */
import { matchHref, matchReference } from './espn-match';
import type { SportsEvent } from './sports';
import type { SportKind } from './sports-catalog';

/** The kinds whose fixtures the dashboard has a board — and a match page — for. */
export const SCORE_CARD_SPORTS: readonly SportKind[] = ['basketball', 'american-football'];

/**
 * Where the dashboard serves each board, and the competition id it knows each of
 * this app's catalog leagues by. The dashboard's own `matchPath` omits
 * `?competition=` for the board's flagship league and carries it for everything
 * else, so that its commentary asks the right ESPN feed; `flagship` records that.
 *
 * Ids and colours are the dashboard catalog's, not invented here: a card and the
 * page it links to have to agree about which competition a fixture is in.
 */
type DashboardBoard = { base: string; competition: string; flagship?: boolean };

export const DASHBOARD_BOARDS: Readonly<Record<string, DashboardBoard>> = {
  nba: { base: '/nfl-basketball/basketball', competition: 'nba', flagship: true },
  wnba: { base: '/nfl-basketball/basketball', competition: 'wnba' },
  ncaam: { base: '/nfl-basketball/basketball', competition: 'ncaam' },
  ncaaw: { base: '/nfl-basketball/basketball', competition: 'ncaaw' },
  nfl: { base: '/nfl-basketball/nfl', competition: 'nfl', flagship: true },
};

/**
 * The chip dot's colour, from the dashboard's competition catalog. The NFL has no
 * colour there, so it stays null and the card falls back to its own accent — the
 * same `leagueColor || accent` the dashboard card does.
 */
export const LEAGUE_ACCENTS: Readonly<Record<string, string>> = {
  nba: '#1d428a',
  wnba: '#e8590c',
  ncaam: '#0f4c9c',
  ncaaw: '#0e7490',
};

export function leagueAccent(league: string): string | null {
  return LEAGUE_ACCENTS[league] ?? null;
}

/** Whether this fixture is drawn as the dashboard's score card. */
export function usesScoreCard(event: SportsEvent): boolean {
  // A race has no two sides to put either side of a "V/S".
  return !event.race && SCORE_CARD_SPORTS.includes(event.sport);
}

/**
 * The dashboard match page for this fixture, or null when there is not one to
 * link to: a sample fixture, a league the dashboard does not serve, or a fixture
 * ESPN reported no numeric id for.
 */
export function dashboardMatchHref(event: SportsEvent): string | null {
  if (!usesScoreCard(event) || event.source !== 'espn') return null;
  const board = DASHBOARD_BOARDS[event.league];
  if (!board || !event.details) return null;
  // `details` only exists for an id that already passed this check at parse time;
  // checking again means a hand-built event cannot smuggle a link in.
  const reference = matchReference(event.details.league, event.details.eventId);
  if (!reference) return null;
  const competition = board.flagship ? '' : `?competition=${encodeURIComponent(board.competition)}`;
  return `${board.base}/match/${encodeURIComponent(reference.eventId)}${competition}`;
}

/**
 * Where the card takes a reader: the dashboard's match page when it has one,
 * otherwise this app's own match page for a fixture ESPN reported, otherwise the
 * board. A card is never a dead click, and never points at a page that cannot
 * answer for this fixture.
 */
export function scoreCardTarget(event: SportsEvent): string {
  return dashboardMatchHref(event) ?? (event.details ? matchHref(event.details) : '/sports');
}

/** What the card's link says itself to be, in the dashboard's own words. */
export function scoreCardLabel(event: SportsEvent): string {
  return `Match commentary: ${event.home.name} v ${event.away.name}`;
}

/** The clock pill's tone: in play, over, or still to come. */
export type ClockTone = 'live' | 'final' | 'soon';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` as the viewer's zone sees it, so "Today" means their today. */
function zonedDayKey(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '01';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/**
 * A kickoff in the viewer's own zone: "Today · 19:30", "Tomorrow · 20:00",
 * "Wed 12 Nov · 18:00", or "TBD" when the fixture has no usable time. This is the
 * dashboard's `formatKickoff`, so an upcoming fixture reads the same on the card
 * and on the page it links to.
 */
export function kickoffLabel(iso: string | null | undefined, options: { now?: Date; timeZone?: string } = {}): string {
  const { now = new Date(), timeZone } = options;
  if (!iso) return 'TBD';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'TBD';
  const time = new Intl.DateTimeFormat(undefined, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  let day = '';
  try {
    const delta = Math.round((Date.parse(`${zonedDayKey(date, timeZone)}T00:00:00Z`) - Date.parse(`${zonedDayKey(now, timeZone)}T00:00:00Z`)) / DAY_MS);
    if (delta === 0) day = 'Today';
    else if (delta === 1) day = 'Tomorrow';
    else if (delta === -1) day = 'Yesterday';
    else {
      const parts = new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(date);
      const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
      day = ['weekday', 'day', 'month'].map(pick).filter(Boolean).join(' ');
    }
  } catch {
    day = '';
  }
  return day ? `${day} · ${time}` : time;
}

/**
 * What the clock pill says.
 *
 * Live reads the provider's own clock ("Q3 4:32", "3rd · 08:41") and falls back
 * to "Live"; a finished fixture reads "Final", as the dashboard's card does; an
 * upcoming one reads its kickoff. A sample fixture is always the last of those,
 * whatever status it was invented with, because a clock on a fixture this site
 * made up would be a claim about a game nobody is playing.
 */
export function scoreCardClock(
  event: SportsEvent,
  options: { now?: Date; timeZone?: string } = {},
): { label: string; tone: ClockTone } {
  if (event.source === 'demo') return { label: kickoffLabel(event.startAt, options), tone: 'soon' };
  if (event.status === 'live') return { label: event.detail?.trim() || 'Live', tone: 'live' };
  if (event.status === 'final') return { label: 'Final', tone: 'final' };
  return { label: kickoffLabel(event.startAt, options), tone: 'soon' };
}

/** The footer's broadcaster: what the provider named, or that none is listed. */
export function broadcastLabel(event: SportsEvent): string {
  const named = event.broadcast?.trim();
  return named && named !== '—' ? named : 'TV TBD';
}

/** A side's score: what was reported, or an em dash. Zero is a score. */
export function scoreCell(score: number | null | undefined): number | string {
  return score ?? '—';
}
