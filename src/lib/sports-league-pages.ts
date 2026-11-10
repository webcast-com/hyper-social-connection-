import type { SportKind } from './sports-catalog';

/**
 * The two Sports URLs that used to host their own ESPN board.
 *
 * Basketball and the NFL now live in the standalone dashboard, so these routes
 * stay reachable — inbound links keep working — but they carry a canonical tag
 * pointing at the dashboard page that owns the competition. No board is fetched
 * here any more.
 */
export const SPORTS_LEAGUE_PAGES = {
  nba: {
    name: 'NBA',
    sport: 'basketball' as SportKind,
    path: '/sports/nba',
    dashboardPath: '/nfl-basketball/basketball',
    description: 'NBA basketball scores, results and fixtures now live in the Hyper Basketball & NFL dashboard, with live scores, standings and top scorers from ESPN.',
  },
  nfl: {
    name: 'NFL',
    sport: 'american-football' as SportKind,
    path: '/sports/nfl',
    dashboardPath: '/nfl-basketball/nfl',
    description: 'NFL American football scores, results and fixtures now live in the Hyper Basketball & NFL dashboard, with live scores, standings and top scorers from ESPN.',
  },
} as const;
export type SportsLeaguePage = keyof typeof SPORTS_LEAGUE_PAGES;
