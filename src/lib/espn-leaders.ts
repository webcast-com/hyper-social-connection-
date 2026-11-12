/**
 * ESPN season leaders, for the homepage leaders board.
 *
 * The Basketball & NFL dashboard already reads ESPN's leaders feed in the
 * browser; this module does the same work server-side so the homepage can
 * render the board with the rest of the page instead of waiting on a client
 * fetch. The normalisation mirrors the dashboard's `normalizeLeaders` so both
 * surfaces show the same players in the same order.
 *
 * When ESPN does not answer, the bundled leaderboard from the dashboard's data
 * module is used and the rows are marked as samples, exactly like the rest of
 * Hyper Sports does with unavailable feeds.
 */
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails, espnResponseMetadata } from './espn-endpoints';

export type SportsLeaderSport = 'basketball' | 'football';

export type SportsLeaderRow = {
  key: string;
  /**
   * ESPN's own ids, when the leaders payload reports them. They are what a
   * player or team page is addressed by; both stay null rather than being
   * derived from a name, so a card only links where ESPN identified the entity.
   */
  athleteId: string | null;
  teamId: string | null;
  name: string;
  team: string;
  teamAbbr: string | null;
  teamLogo: string | null;
  position: string | null;
  metric: string;
  value: string;
  initials: string;
  headshot: string | null;
  jersey: string | null;
};

export type SportsLeaderBoard = {
  sport: SportsLeaderSport;
  league: string;
  rows: SportsLeaderRow[];
  status: 'live' | 'unavailable';
  source: { ok: boolean; url: string; httpStatus: number | null; error?: string; errorKind?: string };
};

/** The two leagues the dashboard shows leaders for. */
const LEADER_LEAGUES: Record<SportsLeaderSport, { league: string; path: string; headshotPath: string }> = {
  basketball: { league: 'nba', path: 'basketball/nba', headshotPath: 'nba' },
  football: { league: 'nfl', path: 'football/nfl', headshotPath: 'nfl' },
};

const leadersUrl = (sport: SportsLeaderSport) =>
  `https://site.web.api.espn.com/apis/common/v3/sports/${LEADER_LEAGUES[sport].path}/leaders`;

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

/** A provider entity id: digits, no leading zero, bounded. Numbers arrive too. */
const entityIdOf = (value: unknown): string | null => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value)
    : typeof value === 'string' ? value.trim() : null;
  return raw !== null && /^[1-9]\d{0,19}$/.test(raw) ? raw : null;
};

const teamLogoUrl = (team: Record<string, unknown>) => {
  const logos = asArray(team.logos);
  const first = logos[0] as Record<string, unknown> | undefined;
  return typeof first?.href === 'string' ? first.href : null;
};

/** One top player per statistic, in the order ESPN reports the categories. */
export function normalizeLeaders(payload: unknown, sport: SportsLeaderSport, limit = 6): SportsLeaderRow[] {
  const lists = findLeaderLists(payload);
  const headshotPath = LEADER_LEAGUES[sport].headshotPath;
  const rows: SportsLeaderRow[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    const metric = String(list.label || 'Season leaders').replace(/\s*leaders?$/i, '').trim();
    if (!metric || seen.has(metric)) continue;
    const entry = list.entries[0] as Record<string, unknown> | undefined;
    if (!entry) continue;
    const athlete = (entry.athlete ?? entry.player ?? {}) as Record<string, unknown>;
    const name = String(athlete.displayName ?? athlete.fullName ?? athlete.name ?? entry.displayName ?? '');
    const value = entry.displayValue ?? entry.value;
    if (!name || value === undefined || value === null) continue;
    const team = (athlete.team ?? entry.team ?? {}) as Record<string, unknown>;
    const id = typeof athlete.id === 'string' ? athlete.id : null;
    seen.add(metric);
    rows.push({
      key: slugify(name),
      athleteId: entityIdOf(athlete.id),
      teamId: entityIdOf(team.id),
      name,
      team: String(team.displayName ?? '—'),
      teamAbbr: typeof team.abbreviation === 'string' ? team.abbreviation : null,
      teamLogo: teamLogoUrl(team),
      position: typeof athlete.position === 'object' && athlete.position
        ? String((athlete.position as Record<string, unknown>).abbreviation ?? (athlete.position as Record<string, unknown>).name ?? '') || null
        : null,
      metric,
      value: String(value),
      initials: initials(name),
      headshot: typeof athlete.headshot === 'object' && athlete.headshot && typeof (athlete.headshot as Record<string, unknown>).href === 'string'
        ? String((athlete.headshot as Record<string, unknown>).href)
        : id ? `https://a.espncdn.com/i/headshots/${headshotPath}/players/full/${id}.png` : null,
      jersey: typeof athlete.jersey === 'string' ? athlete.jersey : null,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}
