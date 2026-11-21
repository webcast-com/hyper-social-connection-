/**
 * The figures in the sports page's hero.
 *
 * The hero is the one from the ScoreHub layout (`scorehub/index.htm`), whose
 * static original reads "54 Matches Live Now", "12 Sports", "98 Leagues" and
 * "2.4M Users". Here each figure is counted from what the page actually holds:
 *
 *   - live matches and loaded matches are counted from fixtures ESPN reported.
 *     A sample fixture is not a current score and is never counted;
 *   - sports and competitions are the sizes of the board's own catalog;
 *   - there is no user count to report, so that tile is the number of matches
 *     loaded instead;
 *   - before the first answer, on a sample board, and when every feed failed,
 *     a count that is not known is null (shown as a dash), never zero. Zero
 *     means ESPN answered and nothing is in play.
 */
import type { SportsBoard, SportsEvent } from './sports';

export type SportsHeroFigures = {
  /** Fixtures ESPN reports as in play; null while that is not known. */
  live: number | null;
  /** Fixtures ESPN reported, any status; null while that is not known. */
  matches: number | null;
  sports: number;
  competitions: number;
  /** The line in the hero's pill. */
  headline: string;
  /** Whether the pill is announcing matches in play (it is lit red only then). */
  inPlay: boolean;
};

export function sportsHeroFigures(
  board: Pick<SportsBoard, 'mode'> & { events: Pick<SportsEvent, 'source' | 'status'>[]; sources?: { ok: boolean }[] },
  catalog: { sports: number; competitions: number },
  loading: boolean,
): SportsHeroFigures {
  const reported = board.events.filter((event) => event.source === 'espn');
  // Known once ESPN has answered for something. A sample board answers for
  // nothing, and neither does a board on which every feed failed: "no matches
  // live" would then be a claim nobody checked.
  const answered = board.mode === 'live' || reported.length > 0 || (board.sources ?? []).some((source) => source.ok);
  const known = !loading && board.mode !== 'demo' && answered;
  const live = known ? reported.filter((event) => event.status === 'live').length : null;
  const headline = loading ? 'Loading live scores…'
    : live === null ? 'Live scores unavailable right now'
    : live === 0 ? 'No matches live right now'
    : live === 1 ? '1 Match Live Now'
    : `${live} Matches Live Now`;
  return {
    live,
    matches: known ? reported.length : null,
    sports: catalog.sports,
    competitions: catalog.competitions,
    headline,
    inPlay: live !== null && live > 0,
  };
}
