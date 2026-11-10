/**
 * Portrait artwork for the homepage leaders board.
 *
 * The Basketball & NFL dashboard bundles the same portraits and resolves them
 * with `portraitFor()` in `vendor/nfl-nba/src/data/scorersData.js`. The copies
 * under `public/sports/players` are byte-identical, so a player keeps the same
 * face on both surfaces; ESPN headshots replace them whenever the leaders feed
 * answers.
 */
import type { SportsLeaderSport } from './espn-leaders';

const PORTRAITS: Record<SportsLeaderSport, string[]> = {
  basketball: [1, 2, 3, 4, 5].map((index) => `/sports/players/nba-portrait-${index}.jpg`),
  football: [1, 2, 3, 4, 5].map((index) => `/sports/players/nfl-portrait-${index}.jpg`),
};

/** Deterministic per player, matching the dashboard's selection. */
export function portraitFor(sport: SportsLeaderSport, name: string): string {
  const pool = PORTRAITS[sport] ?? PORTRAITS.basketball;
  const seed = [...String(name)].reduce((total, char) => total + char.charCodeAt(0), 0);
  return pool[seed % pool.length];
}
