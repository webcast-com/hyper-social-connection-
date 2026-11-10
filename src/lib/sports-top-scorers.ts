/**
 * Full top-scorer boards for the discovery page.
 *
 * The discovery page lists every player on a leaderboard, not just the single
 * leader per statistic the homepage shows, so this module normalises the whole
 * board (top N per metric) and falls back to the bundled boards the Basketball
 * & NFL dashboard ships when ESPN does not answer.
 */
import { basketballScorers, nflScorers } from '../../vendor/nfl-nba/src/data/scorerBoards';
import type { SportsLeaderSport } from './espn-leaders';

export type SportsTopScorerRow = {
  key: string;
  name: string;
  team: string;
  teamAbbr: string | null;
  teamLogo: string | null;
  position: string | null;
  metric: string;
  short: string;
  value: string;
  initials: string;
  headshot: string | null;
};

export type SportsTopScorerBoard = {
  sport: SportsLeaderSport;
  league: string;
  groups: { metric: string; short: string; entries: SportsTopScorerRow[] }[];
  status: 'live' | 'unavailable';
  source: { ok: boolean; url: string; httpStatus: number | null; error?: string; errorKind?: string };
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const initials = (name: unknown) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() ?? '')
  .join('');

const slugify = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

/** ESPN nests the leader lists at different depths depending on the season. */
function findLeaderLists(node: unknown, out: { label: string; entries: unknown[] }[] = [], depth = 0): { label: string; entries: unknown[] }[] {
  if (depth > 5 || !node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((item) => findLeaderLists(item, out, depth + 1));
    return out;
  }
  const record = node as Record<string, unknown>;
  const leaders = record.leaders;
  if (Array.isArray(leaders) && leaders.length) {
    out.push({ label: String(record.displayName ?? record.name ?? record.shortName ?? 'Season leaders'), entries: leaders });
  }
  Object.values(record).forEach((value) => {
    if (value && typeof value === 'object') findLeaderLists(value, out, depth + 1);
  });
  return out;
}

const teamLogoUrl = (team: Record<string, unknown>) => {
  const first = asArray(team.logos)[0] as Record<string, unknown> | undefined;
  return typeof first?.href === 'string' ? first.href : null;
};

const rowFrom = (entry: unknown, metric: string, short: string, headshotPath: string): SportsTopScorerRow | null => {
  const record = (entry ?? {}) as Record<string, unknown>;
  const athlete = (record.athlete ?? record.player ?? {}) as Record<string, unknown>;
  const name = String(athlete.displayName ?? athlete.fullName ?? athlete.name ?? record.displayName ?? '');
  const value = record.displayValue ?? record.value;
  if (!name || value === undefined || value === null) return null;
  const team = (athlete.team ?? record.team ?? {}) as Record<string, unknown>;
  const id = typeof athlete.id === 'string' ? athlete.id : null;
  const headshot = typeof athlete.headshot === 'object' && athlete.headshot && typeof (athlete.headshot as Record<string, unknown>).href === 'string'
    ? String((athlete.headshot as Record<string, unknown>).href)
    : id ? `https://a.espncdn.com/i/headshots/${headshotPath}/players/full/${id}.png` : null;
  const position = typeof athlete.position === 'object' && athlete.position
    ? String((athlete.position as Record<string, unknown>).abbreviation ?? (athlete.position as Record<string, unknown>).name ?? '') || null
    : null;
  return {
    key: slugify(name),
    name,
    team: String(team.displayName ?? '—'),
    teamAbbr: typeof team.abbreviation === 'string' ? team.abbreviation : null,
    teamLogo: teamLogoUrl(team),
    position,
    metric,
    short,
    value: String(value),
    initials: initials(name),
    headshot,
  };
};

/** The whole board: every player ESPN reports for each statistic. */
export function normalizeTopScorers(payload: unknown, sport: SportsLeaderSport, limit = 5): SportsTopScorerBoard['groups'] {
  const headshotPath = sport === 'football' ? 'nfl' : 'nba';
  const groups: SportsTopScorerBoard['groups'] = [];
  const seen = new Set<string>();
  for (const list of findLeaderLists(payload)) {
    const metric = String(list.label || 'Season leaders').replace(/\s*leaders?$/i, '').trim();
    if (!metric || seen.has(metric)) continue;
    const entries = asArray(list.entries)
      .map((entry) => rowFrom(entry, metric, metric.split(/\s+/)[0].slice(0, 5).toUpperCase(), headshotPath))
      .filter((row): row is SportsTopScorerRow => Boolean(row))
      .slice(0, limit);
    if (!entries.length) continue;
    seen.add(metric);
    groups.push({ metric, short: entries[0].short, entries });
    if (groups.length >= 6) break;
  }
  return groups;
}

/** The dashboard's bundled boards, used when ESPN is unreachable. */
export const bundledTopScorers = (sport: SportsLeaderSport): SportsTopScorerBoard['groups'] => {
  const boards = (sport === 'football' ? nflScorers : basketballScorers) as unknown as {
    metric: string; short: string; entries: { name: string; team: string; teamAbbr?: string; value: string; initials?: string }[];
  }[];
  return boards.map((board) => ({
    metric: board.metric,
    short: board.short,
    entries: board.entries.map((entry) => ({
      key: slugify(entry.name),
      name: entry.name,
      team: entry.team,
      teamAbbr: entry.teamAbbr ?? null,
      teamLogo: null,
      position: null,
      metric: board.metric,
      short: board.short,
      value: entry.value,
      initials: entry.initials ?? initials(entry.name),
      headshot: null,
    })),
  }));
};
