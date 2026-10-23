import { summaryFixture } from './match-fixture';
import { parseMatchDetails } from '../../src/lib/espn-match';
import { INSIGHT_KINDS, insightUrls, parseInsight, type InsightsBoard } from '../../src/lib/espn-insights';
export function insightSummary(id = '401234567') {
  const summary = summaryFixture();
  return { ...summary, header: { ...summary.header, id, competitions: [{ ...summary.header.competitions[0], id: '401111111' }] } };
}
export function insightPayload(kind: string, id = '401234567'): unknown {
  const predictor = { homeTeam: { team: { id: '100' }, gameProjection: '63.4' }, awayTeam: { team: { id: '200' }, gameProjection: '36.6' } };
  switch (kind) {
    case 'predictions': return { count: 1, items: [{ eventId: id, predictor }] };
    case 'predictor': return predictor;
    case 'probabilities': return { count: 1, items: [{ homeWinPercentage: 0.72, awayWinPercentage: 0.28, tiePercentage: 0, lastModified: '2026-10-23T18:15:00Z' }] };
    case 'powerindex': return { teams: [{ team: { id: '100' }, stats: [{ name: 'rating', displayName: 'Reported strength', displayValue: '12.7' }] }] };
    case 'odds': return { items: [{ provider: { name: 'Core bookmaker' }, homeTeamOdds: { moneyLine: -125 }, awayTeamOdds: { moneyLine: 120 }, spread: 0 }] };
    default: return {};
  }
}
export function insightsBoard(league = 'epl', id = '401234567'): InsightsBoard {
  const match = parseMatchDetails(insightSummary(id), { league, eventId: id }); const urls = insightUrls(match);
  return { reference: match.reference, status: 'ready', fetchedAt: '2026-10-23T18:15:00Z', matchState: 'in', sections: INSIGHT_KINDS.map((kind) => ({ kind, ...parseInsight(kind, insightPayload(kind, id), match), url: urls[kind], httpStatus: 200 })) };
}
