/**
 * Which match the homepage's floating live-stream card shows next.
 *
 * The card appears for a few seconds, goes away, and comes back with a
 * different match. "Different" is decided here, without a clock or a network,
 * so it can be tested: the card works through every match that can be watched
 * before it shows any of them a second time, and when it starts over it does
 * not open with the one it has just shown.
 */
import { isWatchable, orderStreamMatches, type StreamMatch } from './sportsrc';

/**
 * The matches worth interrupting a reader for: the ones that can be watched
 * now — in play, or starting within half an hour — matches in play first.
 * A fixture hours away, or one that has finished, is not announced.
 */
export function toastCandidates(matches: readonly StreamMatch[], now: Date = new Date()): StreamMatch[] {
  return orderStreamMatches(matches).filter((match) => isWatchable(match, now));
}

/**
 * The next match to show, and the history to pass in next time.
 *
 * `history` is the ids already shown, oldest first. The first candidate not in
 * it is chosen. Once every candidate has been shown the round starts again —
 * with any match but the last one shown, when there is another to choose.
 */
export function pickToastMatch(
  candidates: readonly StreamMatch[],
  history: readonly string[],
): { match: StreamMatch | null; history: string[] } {
  if (candidates.length === 0) return { match: null, history: [...history] };
  const unseen = candidates.find((match) => !history.includes(match.id));
  if (unseen) return { match: unseen, history: [...history, unseen.id] };
  const last = history[history.length - 1];
  const next = candidates.find((match) => match.id !== last) ?? candidates[0];
  return { match: next, history: [next.id] };
}

/** Where the card leads: the live-stream screen, opened on that match. */
export function toastHref(match: Pick<StreamMatch, 'id'>): string {
  return `/sports/live?match=${encodeURIComponent(match.id)}`;
}
