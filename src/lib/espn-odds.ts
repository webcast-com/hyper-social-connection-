import { matchReference, type MatchReference } from './espn-match';
import type { EspnEndpointDetails } from './espn-endpoints';
import { ESPN_LEAGUES, type SportKind } from './sports-catalog';

export const FREE_MATCHES = 6;
export const MAX_MATCHES = 48;
export const BATCH_SIZE = 20;

const primary = new Set(['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'ucl', 'nba', 'nfl', 'mlb', 'nhl']);
// Motorsport has athlete fields, not the home/away markets this feed requires.
export const ODDS_LEAGUES = ESPN_LEAGUES.filter((league) => league.kind !== 'motorsport' && !league.excludeFromOdds).map((league) => ({
  slug: league.slug, sport: league.kind, path: `${league.sport}/${league.league}`, name: league.name,
  secondary: !primary.has(league.slug),
}));
export type OddsLeague = typeof ODDS_LEAGUES[number];
export const ODDS_SPORTS = [...new Set(ODDS_LEAGUES.map((league) => league.sport))];
export type MatchOdds = {
  home: number | null; away: number | null; draw: number | null;
  over_under: number | null; spread: number | null; provider: string | null;
  // Optional for compatibility with previously rendered/cached boards.
  spread_home_odds?: number | null; spread_away_odds?: number | null;
  over_odds?: number | null; under_odds?: number | null;
};
export type OddsMatch = {
  details?: MatchReference;
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

/** Display only: derived from decimal prices, not the original unrounded quote. */
export function decimalToAmerican(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 1) return null;
  const price = value >= 2 ? (value - 1) * 100 : -100 / (value - 1);
  if (!Number.isFinite(price) || !Number.isSafeInteger(Math.round(price))) return null;
  return `${price > 0 ? '+' : ''}${Math.round(price)}`;
}

/** Any supplied line or price is useful; never infer its missing counterpart. */
export function hasOdds(odds: MatchOdds): boolean {
  return [odds.home, odds.away, odds.draw, odds.spread, odds.over_under,
    odds.spread_home_odds, odds.spread_away_odds, odds.over_odds, odds.under_odds]
    .some((value) => typeof value === 'number' && Number.isFinite(value));
}

// Owner-supplied provider directory; fallback attribution only, not a coverage guarantee.
// ESPN's reported name remains authoritative if provider branding changes.
const BETTING_PROVIDER_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '38': 'Caesars',
  '37': 'FanDuel',
  '41': 'DraftKings',
  '58': 'BetMGM',
  '68': 'ESPN BET',
  '2000': 'Bet365',
});

function oddsProviderName(provider: unknown): string | null {
  const name = text(field(provider, 'name'));
  if (name) return name;
  const rawId = field(provider, 'id');
  const id = typeof rawId === 'string' ? rawId.trim()
    : typeof rawId === 'number' && Number.isSafeInteger(rawId) ? String(rawId) : null;
  if (!id || !/^[1-9]\d{0,19}$/.test(id)) return null;
  return BETTING_PROVIDER_NAMES[id] ?? `Provider ID ${id}`;
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
    // Select one quoted phase per market. Do not fill missing close prices with open prices.
    const phase = (market: string, sides: string[]) => sides.some((side) => Object.keys(object(field(row, market, side, 'close'))).length) ? 'close' : 'open';
    const spreadPhase = phase('pointSpread', ['home', 'away']);
    const totalPhase = phase('total', ['over', 'under']);
    const quotedPrice = (market: string, side: string, when: string) =>
      decimal(field(row, market, side, when, 'decimalOdds')) ?? americanToDecimal(field(row, market, side, when, 'odds'));
    const total = number(field(row, 'overUnder') ?? field(row, 'total', 'over', totalPhase, 'line') ?? field(row, 'total', 'under', totalPhase, 'line'));
    const spreadHome = quotedPrice('pointSpread', 'home', spreadPhase) ?? americanToDecimal(field(row, 'homeTeamOdds', 'spreadOdds'));
    const spreadAway = quotedPrice('pointSpread', 'away', spreadPhase) ?? americanToDecimal(field(row, 'awayTeamOdds', 'spreadOdds'));
    const over = quotedPrice('total', 'over', totalPhase) ?? americanToDecimal(field(row, 'overOdds'));
    const under = quotedPrice('total', 'under', totalPhase) ?? americanToDecimal(field(row, 'underOdds'));
    const odds: MatchOdds = {
      home: money('home'), away: money('away'), draw: money('draw'),
      over_under: total !== null && total > 0 ? total : null,
      spread: number(field(row, 'spread') ?? field(row, 'pointSpread', 'home', spreadPhase, 'line')),
      provider: oddsProviderName(field(row, 'provider')),
      ...(spreadHome !== null ? { spread_home_odds: spreadHome } : {}),
      ...(spreadAway !== null ? { spread_away_odds: spreadAway } : {}),
      ...(over !== null ? { over_odds: over } : {}),
      ...(under !== null ? { under_odds: under } : {}),
    };
    // Do not combine prices from different bookmakers, or invent missing markets.
    if (hasOdds(odds)) return odds;
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
  if (!hasOdds(odds)) return null;
  return {
    details: matchReference(league.slug, id),
    id: `espn-odds:${id}`, sport: league.sport, path: league.path,
    league: league.name, home_team: homeName, away_team: awayName,
    home_logo: logo(field(home, 'team', 'logo')), away_logo: logo(field(away, 'team', 'logo')),
    kickoff: kickoff.toISOString(), venue: text(field(competition, 'venue', 'fullName')), odds, is_premium: false,
  };
}

/** Validate every value rendered after a browser refresh, not just the outer arrays. */
export function isOddsBoard(value: unknown): value is OddsBoard {
  const board = object(value);
  const boundedText = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const nullableText = (v: unknown) => v === null || boundedText(v);
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const price = (v: unknown) => v === null || finite(v) && v > 1;
  const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const safeUrl = (v: unknown, source = false) => {
    if (v === null && !source) return true;
    if (typeof v !== 'string' || v.length > 4000) return false;
    try {
      const url = new URL(v);
      return url.protocol === 'https:' && !url.username && !url.password
        && (!source || url.hostname === 'site.api.espn.com');
    } catch { return false; }
  };
  if (!['ready', 'partial', 'empty', 'unavailable'].includes(String(board.status)) || !timestamp(board.fetchedAt)
    || typeof board.truncated !== 'boolean' || !Array.isArray(board.matches) || board.matches.length > MAX_MATCHES
    || !Array.isArray(board.sources) || board.sources.length > 1000) return false;
  if (['empty', 'unavailable'].includes(String(board.status)) && board.matches.length) return false;
  const ids = new Set<string>();
  return board.matches.every((raw) => {
    const match = object(raw); const odds = object(match.odds);
    const league = ODDS_LEAGUES.find((league) => league.path === match.path && league.sport === match.sport);
    if (!league || !boundedText(match.id, 200) || ids.has(match.id)) return false;
    ids.add(match.id);
    if (match.details !== undefined) {
      const ref = object(match.details);
      if (ref.league !== league.slug || typeof ref.eventId !== 'string' || !matchReference(league.slug, ref.eventId)) return false;
    }
    return boundedText(match.home_team) && boundedText(match.away_team) && boundedText(match.league)
      && timestamp(match.kickoff) && nullableText(match.venue) && safeUrl(match.home_logo) && safeUrl(match.away_logo)
      && typeof match.is_premium === 'boolean' && nullableText(odds.provider)
      && ['home', 'draw', 'away'].every((key) => price(odds[key]))
      && (odds.spread === null || finite(odds.spread))
      && (odds.over_under === null || finite(odds.over_under) && odds.over_under > 0)
      && ['spread_home_odds', 'spread_away_odds', 'over_odds', 'under_odds'].every((key) => odds[key] === undefined || price(odds[key]))
      && hasOdds(odds as MatchOdds);
  }) && board.sources.every((raw) => {
    const source = object(raw); const metadata = object(source.responseMetadata);
    return boundedText(source.path, 200) && ODDS_LEAGUES.some((league) => league.path === source.path)
      && (source.date === null || typeof source.date === 'string' && /^\d{8}$/.test(source.date))
      && typeof source.ok === 'boolean' && Number.isSafeInteger(source.count) && Number(source.count) >= 0
      && (source.error === undefined || boundedText(source.error, 4000))
      && (source.url === undefined || safeUrl(source.url, true))
      && (source.httpStatus === undefined || source.httpStatus === null || Number.isInteger(source.httpStatus) && Number(source.httpStatus) >= 100 && Number(source.httpStatus) <= 599)
      && (source.errorKind === undefined || ['http', 'network', 'timeout', 'invalid-response'].includes(String(source.errorKind)))
      && (source.responseMetadata === undefined || source.responseMetadata !== null && typeof source.responseMetadata === 'object' && !Array.isArray(source.responseMetadata)
        && ['server', 'via', 'contentType', 'proxyBlockReason'].every((key) => metadata[key] === undefined || typeof metadata[key] === 'string' && String(metadata[key]).length <= 160));
  });
}
