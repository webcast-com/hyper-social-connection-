import { ESPN_LEAGUES } from './sports-catalog';
import { MatchInputError } from './espn-match';
import type { EspnEndpointDetails } from './espn-endpoints';

export type StandingColumn = { name: string; label: string; description: string };
export type StandingRow = { teamId: string; team: string; rank: string | null; note: string | null; values: Record<string, string | null> };
export type StandingGroup = { id: string; label: string; columns: StandingColumn[]; rows: StandingRow[] };
export type StandingsBoard = {
  league: string; requestedSeason: number | null; season: { year: number; label: string | null } | null;
  status: 'ready' | 'empty' | 'unavailable'; groups: StandingGroup[]; fetchedAt: string;
  source: EspnEndpointDetails & { ok: boolean; error?: string };
};
export function resolveStandings(league: string, season?: string) {
  const meta = ESPN_LEAGUES.find((item) => item.slug === league && item.kind !== 'motorsport');
  if (!meta) throw new MatchInputError('Unknown standings competition', 404);
  if (season !== undefined && (!/^\d{4}$/.test(season) || Number(season) < 1900 || Number(season) > 2100)) throw new MatchInputError('Invalid standings season', 400);
  const year = season === undefined ? null : Number(season);
  return { year, url: `https://site.api.espn.com/apis/v2/sports/${meta.sport}/${meta.league}/standings${year === null ? '' : `?season=${year}`}` };
}
const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;

/** Preserve supplied groups/order/ranks/stat labels, never calculate a league table from scores. */
export function parseStandings(payload: unknown, requestedSeason: number | null): Pick<StandingsBoard, 'season' | 'groups' | 'status'> {
  const root = obj(payload);
  const rawYear = obj(root.season).year ?? root.seasonYear ?? root.season;
  const year = Number(rawYear);
  const season = Number.isInteger(year) && year >= 1900 && year <= 2100 ? { year, label: text(obj(root.season).displayName) ?? text(obj(root.season).name) } : null;
  if (requestedSeason !== null && season?.year !== requestedSeason) throw new Error('Standings season not confirmed');
  let recognized = Array.isArray(root.children) || Array.isArray(obj(root.standings).entries);
  const groups: StandingGroup[] = [];
  let visited = 0;
  const visit = (node: unknown, path: string, names: string[], depth: number) => {
    if (depth > 5 || ++visited > 100 || groups.length >= 32) return;
    const data = obj(node); const table = obj(data.standings);
    const name = text(data.name) ?? text(data.displayName) ?? text(table.displayName) ?? text(table.name);
    const labels = name ? [...names, name] : names;
    if (Array.isArray(table.entries)) {
      recognized = true;
      const columns = new Map<string, StandingColumn>();
      const seen = new Set<string>();
      const rows = list(table.entries).slice(0, 300).flatMap((entry): StandingRow[] => {
        const item = obj(entry); const team = obj(item.team); const teamId = text(team.id); const teamName = text(team.displayName) ?? text(team.name);
        if (!teamId || !teamName || seen.has(teamId)) return [];
        seen.add(teamId);
        const values: Record<string, string | null> = Object.create(null);
        let rank: string | null = null;
        for (const value of list(item.stats).slice(0, 80)) {
          const stat = obj(value); const key = text(stat.name);
          if (!key || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
          const display = text(stat.displayValue) ?? text(stat.value);
          if (key === 'rank' || key === 'rankOverall') { rank = rank ?? display; continue; }
          if (!columns.has(key) && columns.size >= 40) continue;
          if (!columns.has(key)) columns.set(key, { name: key, label: text(stat.shortDisplayName) ?? text(stat.abbreviation) ?? text(stat.displayName) ?? key, description: text(stat.description) ?? text(stat.displayName) ?? key });
          values[key] = display;
        }
        return [{ teamId, team: teamName, rank, note: text(obj(item.note).description), values }];
      });
      if (rows.length) groups.push({ id: path, label: labels.join(' / ') || 'League standings', columns: [...columns.values()], rows });
    }
    list(data.children).slice(0, 40).forEach((child, index) => visit(child, `${path}-${index}`, labels, depth + 1));
  };
  visit(root, 'table', [], 0);
  if (!recognized) throw new Error('Invalid ESPN standings');
  return { season, groups, status: groups.length ? 'ready' : 'empty' };
}

/** Validate the public API envelope before rendering, including nested table cells. */
export function isStandingsBoard(value: unknown, league: string, season: number | null): value is StandingsBoard {
  const board = obj(value); const source = obj(board.source);
  const optionalText = (v: unknown) => v === null || typeof v === 'string';
  return board.league === league && board.requestedSeason === season && ['ready', 'empty', 'unavailable'].includes(String(board.status))
    && typeof board.fetchedAt === 'string' && Number.isFinite(Date.parse(board.fetchedAt)) && typeof source.ok === 'boolean' && typeof source.url === 'string'
    && (source.httpStatus === null || typeof source.httpStatus === 'number')
    && (board.season === null || (typeof obj(board.season).year === 'number' && optionalText(obj(board.season).label)))
    && (season === null || board.status === 'unavailable' || obj(board.season).year === season)
    && Array.isArray(board.groups) && board.groups.length <= 32
    && (board.status === 'ready' ? source.ok === true && board.groups.length > 0 : board.groups.length === 0)
    && board.groups.every((raw) => {
      const group = obj(raw);
      return typeof group.id === 'string' && typeof group.label === 'string' && Array.isArray(group.columns) && group.columns.length <= 40
        && group.columns.every((column) => ['name', 'label', 'description'].every((key) => typeof obj(column)[key] === 'string'))
        && Array.isArray(group.rows) && group.rows.length > 0 && group.rows.length <= 300 && group.rows.every((entry) => {
          const row = obj(entry);
          return typeof row.teamId === 'string' && typeof row.team === 'string' && optionalText(row.rank) && optionalText(row.note)
            && row.values !== null && typeof row.values === 'object' && !Array.isArray(row.values) && Object.values(obj(row.values)).every(optionalText);
        });
    });
}
