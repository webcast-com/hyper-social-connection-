/**
 * The words a feed match card puts into a post: what Comment, Poll and Share
 * write when a reader posts a match to their followers.
 *
 * They live here and not in the card so they can be read without mounting it.
 * Nothing here reads a database or a network.
 */
import type { SportsEvent, SportsPrediction } from './sports';
import { SPORT_EMOJI } from './sports-catalog';

/** The card's status in words. A fixture this site invented is a sample, never live. */
export function matchStatusLabel(event: SportsEvent): string {
  if (event.source === 'demo') return 'Sample fixture';
  if (event.status === 'live') return `LIVE ${event.detail || ''}`.trim();
  if (event.status === 'final') return event.detail || 'Final';
  return event.detail || 'Upcoming';
}

/** "CHE 1–2 ARS", "EVE vs LIV", or a race's title. A score nobody reported is a dash. */
export function matchLine(event: SportsEvent): string {
  if (event.race) return event.race.title;
  const score = event.status === 'upcoming'
    ? 'vs'
    : `${event.away.score ?? '–'}–${event.home.score ?? '–'}`;
  return `${event.away.short || event.away.name} ${score} ${event.home.short || event.home.name}`;
}

/**
 * The text of a post made from a match card.
 *
 * It opens with the sport's own emoji — the one in the card's header — so a
 * football post starts with a football and a basketball post with a basketball,
 * and not every match with the same trophy.
 */
export function matchPostText(event: SportsEvent, note?: string, prediction?: SportsPrediction | null): string {
  const parts = [
    `${SPORT_EMOJI[event.sport] ?? SPORT_EMOJI.other} ${matchLine(event)}`,
    `${event.leagueName} · ${matchStatusLabel(event)}`,
    prediction ? `🔮 Prediction: ${prediction.prediction}${prediction.winOdds ? ` @ ${prediction.winOdds}` : ''}` : '',
    event.venue ? `📍 ${event.venue}` : '',
    note?.trim() ? `\n${note.trim()}` : '',
    '\n#Sports #MatchDay',
  ].filter(Boolean);
  return parts.join('\n');
}
