import type { SportKind } from './sports-catalog';
import type { SportsBoard } from './sports';

export const SPORTS_LEAGUE_PAGES = {
  nba: { name: 'NBA', sport: 'basketball' as SportKind, path: '/sports/nba', description: 'NBA basketball scores, results and upcoming fixtures from ESPN. Open a game for reported player stats, rosters, form, head-to-head and standings.' },
  nfl: { name: 'NFL', sport: 'american-football' as SportKind, path: '/sports/nfl', description: 'NFL American football scores, results and upcoming fixtures from ESPN. Open a game for reported player stats, rosters, form, head-to-head and standings.' },
} as const;
export type SportsLeaguePage = keyof typeof SPORTS_LEAGUE_PAGES;

/** Scope diagnostics as well as events: an unrelated failed feed must not mark this league unavailable. */
export function scopeLeagueBoard(board: SportsBoard, league: SportsLeaguePage): SportsBoard {
  const sources = board.sources.filter((source) => source.id === `espn:${league}`);
  return { ...board, events: board.events.filter((event) => event.league === league && event.sport === SPORTS_LEAGUE_PAGES[league].sport), predictions: [], sources,
    mode: board.mode === 'demo' ? 'demo' : sources.length ? sources.every((source) => source.ok) ? 'live' : 'partial' : 'partial' };
}
