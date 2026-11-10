/**
 * Type declarations for the dashboard's plain-JS data modules.
 *
 * The vendor sources are ESM JavaScript consumed by the Vite build, so TypeScript
 * has no types for them. Declaring them here lets the Next app import the same
 * data for search keywords and metadata without adding a build step.
 */

declare module '*/vendor/nfl-nba/src/data/sportsData' {
  export const basketballCompetitions: { id?: string; name: string; region?: string; country?: string }[];
  export const nflCompetitions: { id?: string; name: string; region?: string; country?: string }[];
  export const basketballGames: { id: string; homeTeam?: string; awayTeam?: string; home?: string; away?: string; league?: string; competition?: string; venue?: string; [key: string]: unknown }[];
  export const nflGames: { id: string; homeTeam?: string; awayTeam?: string; home?: string; away?: string; league?: string; competition?: string; venue?: string; [key: string]: unknown }[];
  export const basketballStandings: { teams: Row[]; [key: string]: unknown }[];
  export const nflStandings: { teams: Row[]; [key: string]: unknown }[];
  export const ncaaBasketballStandings: { teams: Row[]; [key: string]: unknown }[];
  export const ncaaWomenStandings: { teams: Row[]; [key: string]: unknown }[];
  export const collegeFootballStandings: { teams: Row[]; [key: string]: unknown }[];
  export const basketballLeaders: { league: string; leaders: LeaderRow[] }[];
  export const nflLeaders: { league: string; leaders: LeaderRow[] }[];
  export const basketballLeadersSample: { league: string; leaders: LeaderRow[] }[];
  export const nflLeadersSample: { league: string; leaders: LeaderRow[] }[];
  export const upcomingBasketballMatchesSample: { id?: string; homeTeam?: string; awayTeam?: string; home?: string; away?: string; competition?: string; league?: string; venue?: string; [key: string]: unknown }[];
  export const upcomingNflMatchesSample: { id?: string; homeTeam?: string; awayTeam?: string; home?: string; away?: string; competition?: string; league?: string; venue?: string; [key: string]: unknown }[];
  export const basketballContinents: string[];
  export const basketballCountries: string[];
  export const nflCountries: string[];
  export const basketballStats: unknown[];
  export const nflStats: unknown[];
  type Row = { team?: string; name?: string; [key: string]: unknown };
  type LeaderRow = { player?: string; playerName?: string; name?: string; team?: string; teamName?: string };
}

declare module '*/vendor/nfl-nba/src/data/scorerBoards' {
  export const basketballScorers: { metric: string; short: string; entries: unknown[] }[];
  export const nflScorers: { metric: string; short: string; entries: unknown[] }[];
}

declare module '*/vendor/nfl-nba/src/data/scorersData' {
  export const demoPlayerImages: Record<string, string[]>;
  export function portraitFor(sport: string, name: string): string;
  export { basketballScorers, nflScorers } from '*/vendor/nfl-nba/src/data/scorerBoards';
}

declare module '*/vendor/nfl-nba/src/utils/entities' {
  export function slugify(value: string): string;
  export function teamKeyFor(value: string): string;
}
