/**
 * ESPN top scorers for a football competition.
 *
 * ESPN reports a competition's scoring leaders on its statistics endpoint
 * (`…/site/v2/sports/soccer/{league}/statistics`) as categories of leaders:
 * "goalsLeaders" (top scorers), "assistsLeaders" and so on. Only the goals
 * category is read here.
 *
 * The existing leaders reader (`espn-leaders.ts`) serves the NBA and the NFL
 * from a different endpoint and is not touched.
 *
 * The rules:
 *
 *   1. **Nothing invented.** A row needs a name and a goals figure ESPN gave.
 *      A missing club, photo or appearance count stays null. The order is
 *      ESPN's; no rank is recomputed.
 *   2. **Validated ids only.** A player id reaches a URL only when it matches
 *      the rule the rest of the app uses for ESPN's ids.
 *   3. **Football only.** Other sports have no "goals" table at this address.
 */
import { safeProviderImage } from './espn-image';
import type { EspnEndpointDetails } from './espn-endpoints';
import { ESPN_LEAGUES, type EspnLeague } from './sports-catalog';

export class ScorersInputError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
    this.name = 'ScorersInputError';
  }
}

export type SportsScorer = {
  /** ESPN's athlete id, when it is one this app will put in a URL. */
  athleteId: string | null;
  name: string;
  team: string | null;
  teamLogo: string | null;
  headshot: string | null;
  /** As ESPN reported it: "21". */
  goals: string;
  /** Appearances, when ESPN reported them beside the goals. */
  matches: string | null;
};

export type SportsScorersBoard = {
  league: string;
  leagueName: string;
  /** `empty`: ESPN answered and listed no scorers. `unavailable`: it did not answer. */
  status: 'ready' | 'empty' | 'unavailable';
  scorers: SportsScorer[];
  fetchedAt: string;
  source: EspnEndpointDetails & { ok: boolean; error?: string };
};

export const MAX_SCORERS = 10;

/** The competition a slug names, and where its statistics are. */
export function resolveScorers(slug: string): { league: EspnLeague; url: string } {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) throw new ScorersInputError('Invalid competition', 400);
  const league = ESPN_LEAGUES.find((entry) => entry.slug === slug);
  if (!league) throw new ScorersInputError('Unknown competition', 404);
  if (league.kind !== 'football') throw new ScorersInputError('Top scorers are reported for football competitions only', 404);
  return { league, url: `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/statistics` };
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max = 120): string | null => {
  const raw = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return raw ? raw.slice(0, max) : null;
};
const entityId = (value: unknown): string | null => {
  const raw = typeof value === 'number' && Number.isInteger(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  return /^[1-9]\d{0,19}$/.test(raw) ? raw : null;
};
/** A whole, non-negative count as ESPN gave it: 21, 21.0 or "21". */
const count = (value: unknown): string | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,4}(\.0+)?$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isInteger(number) && number >= 0 && number < 10_000 ? String(number) : null;
};
/** "Matches: 31, Goals: 27" → the figure after a label. */
const labelled = (value: unknown, label: RegExp): string | null => {
  const raw = typeof value === 'string' ? value : '';
  const match = new RegExp(`(?:^|[,;|]\\s*)(?:${label.source})\\s*:\\s*(\\d{1,4})\\b`, 'i').exec(raw);
  return match ? match[1] : null;
};
/** A figure from the athlete's own statistics list, by name. */
const statistic = (athlete: Record<string, unknown> | null, names: RegExp): string | null => {
  for (const entry of list(athlete?.statistics)) {
    const stat = record(entry);
    if (stat && names.test(String(stat.name ?? ''))) return count(stat.value) ?? count(stat.displayValue);
  }
  return null;
};

/** Which category is the goals table: named for goals, and not for assists or conceding. */
function goalsCategory(payload: unknown): Record<string, unknown> | null {
  const root = record(payload);
  const categories = [...list(root?.stats), ...list(root?.statistics), ...list(root?.categories), ...list(record(root?.leaders)?.categories)]
    .map(record).filter((entry): entry is Record<string, unknown> => !!entry && Array.isArray(entry.leaders));
  const named = (entry: Record<string, unknown>) => `${entry.name ?? ''} ${entry.displayName ?? ''} ${entry.shortDisplayName ?? ''}`;
  return categories.find((entry) => /^goals?leaders?$/i.test(String(entry.name ?? '')))
    ?? categories.find((entry) => /\b(top )?scorers?\b|\bgoals?\b/i.test(named(entry)) && !/assist|against|conced|own goal|saves?/i.test(named(entry)))
    ?? null;
}

/** A statistics response → the top scorers in it, in ESPN's order. */
export function parseScorers(payload: unknown, limit = MAX_SCORERS): SportsScorer[] {
  const category = goalsCategory(payload);
  const scorers: SportsScorer[] = [];
  const seen = new Set<string>();
  for (const entry of list(category?.leaders)) {
    if (scorers.length >= limit) break;
    const leader = record(entry);
    const athlete = record(leader?.athlete);
    const name = text(athlete?.displayName) ?? text(athlete?.fullName) ?? text(athlete?.shortName) ?? text(athlete?.name);
    const goals = count(leader?.value) ?? labelled(leader?.displayValue, /goals?|g/) ?? count(leader?.displayValue) ?? statistic(athlete, /^(total)?goals$/i);
    if (!leader || !name || goals === null) continue;
    const athleteId = entityId(athlete?.id);
    const key = athleteId ?? name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const team = record(athlete?.team) ?? record(leader.team);
    const logo = list(team?.logos).map((item) => safeProviderImage(record(item)?.href)).find((href): href is string => !!href) ?? safeProviderImage(team?.logo);
    const headshot = athlete?.headshot;
    scorers.push({
      athleteId,
      name,
      team: text(team?.displayName) ?? text(team?.shortDisplayName) ?? text(team?.name) ?? text(team?.abbreviation),
      teamLogo: logo ?? null,
      headshot: safeProviderImage(typeof headshot === 'string' ? headshot : record(headshot)?.href),
      goals,
      matches: labelled(leader.displayValue, /matches|apps?|appearances|games played|gp|m/) ?? statistic(athlete, /^(appearances|gamesPlayed)$/i),
    });
  }
  return scorers;
}
