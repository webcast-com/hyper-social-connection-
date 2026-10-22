import type { EspnEndpointDetails } from './espn-endpoints';
import { ESPN_LEAGUES, type SportKind } from './sports-catalog';

export const FREE_MATCHES = 6;
export const MAX_MATCHES = 48;
export const BATCH_SIZE = 20;

const primary = new Set(['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'ucl', 'nba', 'nfl', 'mlb', 'nhl']);
// Motorsport has athlete fields, not the home/away markets this feed requires.
export const ODDS_LEAGUES = ESPN_LEAGUES.filter((league) => league.kind !== 'motorsport').map((league) => ({
  sport: league.kind, path: `${league.sport}/${league.league}`, name: league.name,
  secondary: !primary.has(league.slug),
}));
export type OddsLeague = typeof ODDS_LEAGUES[number];
export const ODDS_SPORTS = [...new Set(ODDS_LEAGUES.map((league) => league.sport))];
export type MatchOdds = {
  home: number | null; away: number | null; draw: number | null;
  over_under: number | null; spread: number | null; provider: string | null;
};
export type OddsMatch = {
  id: string; sport: SportKind; league: string; path: string;
  home_team: string; away_team: string; home_logo: string | null; away_logo: string | null;
  kickoff: string; venue: string | null; odds: MatchOdds; is_premium: boolean;
};
export type OddsSource = Partial<EspnEndpointDetails> & { path: string; date: string | null; ok: boolean; count: number; error?: string };
export type OddsBoard = {
  matches: OddsMatch[]; sources: OddsSource[]; fetchedAt: string;
  status: 'ready' | 'partial' | 'empty' | 'unavailable'; truncated: boolean;
};
export type OddsRequest = { sports: SportKind[]; perLeague: number; days: number };
export class OddsInputError extends Error {}

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function field(value: unknown, ...keys: string[]): unknown {
  return keys.reduce((current: unknown, key) => object(current)[key], value);
}
export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function number(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function decimal(value: unknown) {
  const parsed = number(value);
  return parsed !== null && parsed > 1 ? parsed : null;
}
export function americanToDecimal(value: unknown): number | null {
  const price = number(value);
  if (price === null || Math.abs(price) < 100) return null;
  const rounded = Math.round((price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price)) * 10_000) / 10_000;
  return Number.isFinite(rounded) && rounded > 1 ? rounded : null;
}

/** ESPN money lines are American; explicit decimalOdds values are already decimal. */
export function mapOdds(competition: unknown): MatchOdds {
  const raw = field(competition, 'odds');
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const row of rows) {
    const money = (side: string) => {
      const legacy = field(row, side === 'draw' ? 'drawOdds' : `${side}TeamOdds`) ?? field(row, `${side}TeamOdds`);
      return decimal(field(legacy, 'decimalOdds'))
        ?? americanToDecimal(field(legacy, 'moneyLine')
          ?? (typeof legacy === 'number' || typeof legacy === 'string' ? legacy : undefined)
          ?? field(row, 'moneyline', side, 'close', 'odds')
          ?? field(row, 'moneyline', side, 'open', 'odds'));
    };
    const total = number(field(row, 'overUnder') ?? field(row, 'total', 'over', 'close', 'line'));
    const odds: MatchOdds = {
      home: money('home'), away: money('away'), draw: money('draw'),
      over_under: total !== null && total > 0 ? total : null,
      spread: number(field(row, 'spread')),
      provider: text(field(row, 'provider', 'name')),
    };
    // Do not combine prices from different bookmakers, or invent missing markets.
    if (odds.home !== null || odds.away !== null || odds.over_under !== null) return odds;
  }
  return { home: null, away: null, draw: null, over_under: null, spread: null, provider: null };
}

export function dayStamp(offset: number, now = new Date()): string {
  return new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
}

export function normalizeOddsRequest(input: unknown): OddsRequest {
  const body = object(input);
  if (body.sports !== undefined && !Array.isArray(body.sports)) throw new OddsInputError('sports must be an array');
  const requested = (body.sports ?? []) as unknown[];
  if (requested.length > ODDS_SPORTS.length) throw new OddsInputError('Too many sport filters');
  if (requested.some((sport) => typeof sport !== 'string' || !ODDS_SPORTS.includes(sport as SportKind))) {
    throw new OddsInputError(`Supported sports: ${ODDS_SPORTS.join(', ')}`);
  }
  const perLeague = body.perLeague === undefined ? 0 : number(body.perLeague);
  if (perLeague === null) throw new OddsInputError('perLeague must be a finite number');
  const cap = perLeague > 0 ? Math.min(Math.max(Math.floor(perLeague), 1), 12) : 0;
  const days = body.days === undefined ? 1 : number(body.days);
  if (cap && days === null) throw new OddsInputError('days must be a finite number');
  return {
    sports: [...new Set(requested as SportKind[])].sort(), perLeague: cap,
    days: cap ? Math.min(Math.max(Math.floor(days || 1), 1), 10) : 1,
  };
}

function logo(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  try { return new URL(url).protocol === 'https:' ? url : null; } catch { return null; }
}

export function mapOddsEvent(event: unknown, league: OddsLeague, now = new Date()): OddsMatch | null {
  const id = field(event, 'id');
  const competitions = field(event, 'competitions');
  const competition = Array.isArray(competitions) ? competitions[0] : null;
  if (!competition || (typeof id !== 'string' && typeof id !== 'number') || !String(id)) return null;
  const date = text(field(event, 'date') ?? field(competition, 'date'));
  const kickoff = date ? new Date(date) : null;
  if (!kickoff || !Number.isFinite(kickoff.getTime()) || kickoff.getTime() < now.getTime()) return null;
  const status = field(competition, 'status', 'type') ?? field(event, 'status', 'type');
  const state = field(status, 'state');
  if (field(status, 'completed') === true || (state && state !== 'pre')) return null;
  const competitors = field(competition, 'competitors');
  if (!Array.isArray(competitors)) return null;
  const home = competitors.find((item) => field(item, 'homeAway') === 'home');
  const away = competitors.find((item) => field(item, 'homeAway') === 'away');
  const homeName = text(field(home, 'team', 'displayName') ?? field(home, 'team', 'name'));
  const awayName = text(field(away, 'team', 'displayName') ?? field(away, 'team', 'name'));
  if (!homeName || !awayName) return null;
  const odds = mapOdds(competition);
  if (odds.home === null && odds.away === null && odds.over_under === null) return null;
  return {
    id: `espn-odds:${id}`, sport: league.sport, path: league.path,
    league: league.name, home_team: homeName, away_team: awayName,
    home_logo: logo(field(home, 'team', 'logo')), away_logo: logo(field(away, 'team', 'logo')),
    kickoff: kickoff.toISOString(), venue: text(field(competition, 'venue', 'fullName')), odds, is_premium: false,
  };
}
