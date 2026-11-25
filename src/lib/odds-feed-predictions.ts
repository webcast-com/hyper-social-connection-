/**
 * Feed prediction cards from the ESPN odds board.
 *
 * The homepage feed has always had slots and a card for predictions
 * (`SportsPredictionFeedCard`), but `getSportsBoard()` reports none — its
 * `predictions` array is empty on every path. This mapper fills the gap from
 * the same source the `/sports/predictions` page reads: `getEspnOdds()`, whose
 * bookmaker prices become a pick exactly the way that page computes one — the
 * outcome with the highest implied probability. Prices are bookmaker odds,
 * not a model; nothing is invented, and a match without a win price maps to
 * nothing.
 */
import type { OddsBoard, OddsMatch } from './espn-odds';
import type { SportsPrediction } from './sports';
import { SPORT_LABELS } from './sports-catalog';

export const MAX_FEED_PREDICTIONS = 8;

type Candidate = { label: string; odds: number };

function bestOutcome(match: OddsMatch): Candidate | null {
  const price = (value: number | null | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 1 ? value : null;
  const candidates: Candidate[] = [
    { label: `${match.home_team} to win`, odds: price(match.odds.home) ?? NaN },
    { label: 'Draw', odds: price(match.odds.draw) ?? NaN },
    { label: `${match.away_team} to win`, odds: price(match.odds.away) ?? NaN },
  ].filter((candidate) => Number.isFinite(candidate.odds));
  if (!candidates.length) return null;
  // Highest implied probability = lowest decimal price.
  return candidates.reduce((best, candidate) => (candidate.odds < best.odds ? candidate : best));
}

/** Upcoming matches with a win price, as feed predictions in board order (soonest kickoff first). */
export function oddsFeedPredictions(board: OddsBoard | null | undefined, limit = MAX_FEED_PREDICTIONS): SportsPrediction[] {
  if (!board || !Array.isArray(board.matches)) return [];
  const predictions: SportsPrediction[] = [];
  for (const match of board.matches) {
    if (predictions.length >= limit) break;
    const pick = bestOutcome(match);
    if (!pick) continue;
    predictions.push({
      id: match.id,
      source: 'espn',
      federation: SPORT_LABELS[match.sport] ?? match.sport,
      market: typeof match.odds.draw === 'number' && match.odds.draw > 1 ? '1X2' : 'Money line',
      startAt: match.kickoff,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      prediction: pick.label,
      winOdds: pick.odds.toFixed(2),
      competition: match.league,
    });
  }
  return predictions;
}
