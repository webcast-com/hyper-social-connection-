/**
 * Team news for one fixture: ESPN-reported injuries and recent league
 * articles that mention either side.
 *
 * Injuries come from the same `summary?event=` payload the match page reads —
 * ESPN publishes an `injuries` section for its US-sport summaries (NFL, NBA,
 * MLB, NHL). Competitions whose summaries carry no such section (most
 * football/soccer leagues) honestly report none rather than inventing a list.
 * Articles are the league's own news feed, kept only when the headline or
 * description names one of the two teams.
 */
import type { MatchReference } from './espn-match';
import type { SportsNewsArticle } from './espn-news';
import type { EspnEndpointDetails } from './espn-endpoints';

export type TeamNewsPlayer = { name: string; position: string | null; status: string | null; note: string | null };
export type TeamNewsTeam = { teamId: string; team: string; players: TeamNewsPlayer[] };
export type TeamNewsSource = EspnEndpointDetails & { kind: 'injuries' | 'articles'; ok: boolean; error?: string };
export type TeamNewsBoard = {
  reference: MatchReference;
  fetchedAt: string;
  status: 'ready' | 'partial' | 'empty' | 'unavailable';
  message: string | null;
  injuries: TeamNewsTeam[];
  articles: SportsNewsArticle[];
  sources: TeamNewsSource[];
};

const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown, max = 300): string | null => {
  const raw = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  return raw ? raw.slice(0, max) : null;
};

export const MAX_INJURY_TEAMS = 2;
export const MAX_INJURY_PLAYERS = 15;
export const MAX_TEAM_ARTICLES = 6;

/**
 * Read the `injuries` section of an ESPN event summary. Only reported fields
 * are kept: a player without a name is dropped, a missing status or note
 * stays null, and nothing is derived from other parts of the payload.
 */
export function parseSummaryInjuries(payload: unknown): TeamNewsTeam[] {
  return list(obj(payload).injuries).slice(0, MAX_INJURY_TEAMS).flatMap((entry): TeamNewsTeam[] => {
    const row = obj(entry);
    const team = obj(row.team);
    const teamId = text(team.id, 30);
    const teamName = text(team.displayName) ?? text(team.name);
    if (!teamId || !/^[1-9]\d{0,19}$/.test(teamId) || !teamName) return [];
    const players = list(row.injuries).slice(0, MAX_INJURY_PLAYERS).flatMap((raw): TeamNewsPlayer[] => {
      const item = obj(raw);
      const athlete = obj(item.athlete);
      const name = text(athlete.displayName) ?? text(athlete.fullName) ?? text(athlete.shortName);
      if (!name) return [];
      const details = obj(item.details);
      const position = text(obj(athlete.position).abbreviation) ?? text(obj(athlete.position).displayName);
      const status = text(item.status) ?? text(obj(item.type).description) ?? text(obj(item.type).name);
      const returnDate = text(details.returnDate, 40);
      const composed = [text(details.type), text(details.detail) ?? text(details.side), returnDate ? `est. return ${returnDate}` : null]
        .filter((part): part is string => !!part).join(' · ');
      const note = text(item.shortComment, 500) ?? text(item.longComment, 500) ?? (composed || null);
      return [{ name, position, status, note }];
    });
    return players.length ? [{ teamId, team: teamName, players }] : [];
  });
}

/** Suffix words too generic to identify a club on their own. */
const GENERIC_NAME_WORDS = new Set([
  'united', 'city', 'town', 'county', 'club', 'real', 'sporting', 'athletic',
  'albion', 'rovers', 'wanderers', 'fc', 'afc', 'sc', 'cf', 'state', 'the',
]);

/** The phrases that count as a mention: the full team name, plus its final word when distinctive. */
export function teamAliases(name: string): string[] {
  const full = name.trim().toLowerCase();
  if (!full) return [];
  const aliases = [full];
  const words = full.split(/\s+/);
  const last = words[words.length - 1];
  if (words.length > 1 && last.length >= 5 && !GENERIC_NAME_WORDS.has(last)) aliases.push(last);
  return aliases;
}

/** Keep articles whose headline or description names either side. Order is preserved; nothing is rewritten. */
export function filterTeamArticles(articles: SportsNewsArticle[], teamNames: string[], limit = MAX_TEAM_ARTICLES): SportsNewsArticle[] {
  const aliases = teamNames.flatMap(teamAliases);
  if (!aliases.length) return [];
  return articles.filter((article) => {
    const haystack = `${article.headline} ${article.description ?? ''}`.toLowerCase();
    return aliases.some((alias) => haystack.includes(alias));
  }).slice(0, limit);
}

/** Validate a board parsed from the app API before rendering it client-side. */
export function isTeamNewsBoard(value: unknown): value is TeamNewsBoard {
  const board = obj(value);
  const optionalText = (v: unknown) => v === null || typeof v === 'string';
  const reference = obj(board.reference);
  return typeof reference.league === 'string' && typeof reference.eventId === 'string'
    && ['ready', 'partial', 'empty', 'unavailable'].includes(String(board.status))
    && optionalText(board.message)
    && typeof board.fetchedAt === 'string' && Number.isFinite(Date.parse(board.fetchedAt))
    && Array.isArray(board.injuries) && board.injuries.length <= MAX_INJURY_TEAMS
    && board.injuries.every((raw) => {
      const team = obj(raw);
      return typeof team.teamId === 'string' && typeof team.team === 'string'
        && Array.isArray(team.players) && team.players.length > 0 && team.players.length <= MAX_INJURY_PLAYERS
        && team.players.every((entry) => {
          const player = obj(entry);
          return typeof player.name === 'string' && optionalText(player.position)
            && optionalText(player.status) && optionalText(player.note);
        });
    })
    && Array.isArray(board.articles) && board.articles.length <= MAX_TEAM_ARTICLES
    && board.articles.every((raw) => {
      const article = obj(raw);
      return typeof article.id === 'string' && typeof article.headline === 'string'
        && optionalText(article.description) && optionalText(article.published) && optionalText(article.image)
        && typeof article.url === 'string' && /^https:\/\/([a-z0-9-]+\.)*espn\.com\//.test(String(article.url));
    })
    && Array.isArray(board.sources) && board.sources.length <= 2;
}
