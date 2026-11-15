/**
 * The sports board's featured match, and the small facts its cards derive from a
 * fixture: which one leads the page, how far through it is, who won, and how
 * long until kickoff.
 *
 * Everything here is read off the fixture the provider reported. Nothing is
 * invented and nothing is fetched, so the rules can be tested without a browser:
 *
 *   - only a fixture ESPN reports as live is ever featured. A sample fixture is
 *     never featured, because it is not a current score, and a race has no two
 *     sides to put either side of a scoreline;
 *   - an unreported score stays unreported. It counts as nothing when fixtures
 *     are ranked and it never makes a side a winner or a loser;
 *   - a progress bar is drawn only from a football minute the provider gave.
 *     Other sports report clocks this file does not pretend to understand.
 */
import type { SportsEvent } from './sports';

/** Regulation minutes in a football match — the whole of the progress bar. */
const FOOTBALL_MINUTES = 90;

const reported = (score: number | null | undefined): score is number =>
  typeof score === 'number' && Number.isFinite(score);

/** Whether this fixture may lead the board: reported by ESPN, in play, two sides. */
export function isFeaturable(event: SportsEvent): boolean {
  return event.source === 'espn' && event.status === 'live' && !event.race && event.sport !== 'motorsport';
}

/**
 * The elapsed minute of a football match, from the provider's own clock text:
 * `54'` is 54, `45'+2'` is 45, `HT` is 45. Null when the fixture is not football
 * or the text is not a minute.
 */
export function footballMinute(event: SportsEvent): number | null {
  if (event.sport !== 'football' || event.status !== 'live') return null;
  const detail = event.detail?.trim() ?? '';
  if (/^(ht|half[\s-]?time)$/i.test(detail)) return FOOTBALL_MINUTES / 2;
  const minute = /^(\d{1,3})\s*['’′]/.exec(detail);
  return minute ? Number(minute[1]) : null;
}

/** How far through a live football match is, 0–100, or null when not known. */
export function matchProgressPercent(event: SportsEvent): number | null {
  const minute = footballMinute(event);
  if (minute === null) return null;
  return Math.max(0, Math.min(100, Math.round((minute / FOOTBALL_MINUTES) * 100)));
}

/** Points on the board, counting an unreported score as none. */
function combinedScore(event: SportsEvent): number {
  return (reported(event.home.score) ? event.home.score : 0) + (reported(event.away.score) ? event.away.score : 0);
}

/**
 * The match that leads the board, or null when nothing featurable is in play.
 *
 * The board lists several sports, and a cricket or rugby total would always
 * outrank a football scoreline, so sports are not compared with each other: the
 * first live fixture in the board's own order decides the sport. Within that
 * sport the most watchable match wins — most combined scoring, then the football
 * match furthest into its clock, then the board's own order.
 */
export function pickFeaturedEvent(events: readonly SportsEvent[]): SportsEvent | null {
  const live = events.filter(isFeaturable);
  if (live.length === 0) return null;
  const candidates = live.filter((event) => event.sport === live[0].sport);
  let best = candidates[0];
  for (const event of candidates.slice(1)) {
    const scoring = combinedScore(event) - combinedScore(best);
    if (scoring > 0 || (scoring === 0 && (footballMinute(event) ?? 0) > (footballMinute(best) ?? 0))) best = event;
  }
  return best;
}

/**
 * The side that won a finished match, or null: still in play, level, or a score
 * the provider did not report.
 */
export function winningSide(event: SportsEvent): 'home' | 'away' | null {
  if (event.status !== 'final' || event.race) return null;
  if (!reported(event.home.score) || !reported(event.away.score) || event.home.score === event.away.score) return null;
  return event.home.score > event.away.score ? 'home' : 'away';
}

const MINUTE_MS = 60_000;
/** Countdowns stop at a day out; beyond that the kickoff date already says it. */
const COUNTDOWN_WINDOW_MS = 24 * 60 * MINUTE_MS;

/**
 * "in 2h 15m" for a kickoff inside the next day, or null: already started,
 * more than a day away, not an upcoming fixture, or an unreadable date.
 */
export function kickoffCountdown(event: Pick<SportsEvent, 'status' | 'startAt'>, now: number): string | null {
  if (event.status !== 'upcoming') return null;
  const kickoff = Date.parse(event.startAt);
  if (!Number.isFinite(kickoff) || !Number.isFinite(now)) return null;
  const remaining = kickoff - now;
  if (remaining <= 0 || remaining > COUNTDOWN_WINDOW_MS) return null;
  const minutes = Math.max(1, Math.ceil(remaining / MINUTE_MS));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `in ${minutes}m`;
  return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
}

/**
 * The scoreline as one comparable string, or '' while there is no score to show.
 * Cards use it to notice that a score changed between two refreshes.
 */
export function scoreKey(event: SportsEvent): string {
  if (event.status === 'upcoming' || event.race) return '';
  return `${event.away.score ?? '–'}–${event.home.score ?? '–'}`;
}
