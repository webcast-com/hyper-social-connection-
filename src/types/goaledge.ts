export type TipStatus = "upcoming" | "won" | "lost" | "void" | "pending";

export type HistoryFilter = "all" | "won" | "lost" | "void";

export type ApiStatus = "live" | "offline" | "demo" | "loading";

export interface LiveOddsData {
  odds: string;
  direction?: "up" | "down" | "stable";
}

export interface OddsComparisonBookmaker {
  bookmaker: string;
  odds: number;
  isBest?: boolean;
  url?: string;
}

export interface OddsComparison {
  tipId?: string;
  market?: string;
  bookmakers: OddsComparisonBookmaker[];
  best: OddsComparisonBookmaker;
  baseOdds: number;
}

export interface FormStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
}

export interface HeadToHeadRecord {
  games: number;
  homeWins: number;
  awayWins: number;
  draws: number;
}

/**
 * One bookmaker's full quote for a fixture as reported by ESPN (e.g. DraftKings):
 * money line, spread line with per-side prices, and total (O/U) with over/under
 * prices. Every field is optional data straight from the feed — nothing derived.
 */
export interface TipBookmakerOdds {
  provider: string | null;
  home: number | null;
  draw: number | null;
  away: number | null;
  spread: number | null;
  spreadHomeOdds?: number | null;
  spreadAwayOdds?: number | null;
  overUnder: number | null;
  overOdds?: number | null;
  underOdds?: number | null;
}

export interface EspnRef {
  sport?: string;
  league?: string;
  eventId?: string;
  [key: string]: unknown;
}

export interface Tip {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  country: string;
  flag: string;
  matchTime: string;
  kickoffAt?: string | null;
  odds: string;
  confidence: number;
  confidenceLabel: string;
  prediction: string;
  predictionType: string;
  status: TipStatus;
  isPremium: boolean;
  tipster: string;
  homeForm?: Array<"W" | "D" | "L">;
  awayForm?: Array<"W" | "D" | "L">;
  homeFormStats?: FormStats | null;
  awayFormStats?: FormStats | null;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  headToHead?: string | null;
  headToHeadRecord?: HeadToHeadRecord | null;
  analysis?: string | null;
  espnRef?: EspnRef | null;
  /** The feed bookmaker's full markets (money line, spread, O/U) when published. */
  bookmakerOdds?: TipBookmakerOdds | null;
}
