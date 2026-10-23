import type { MatchDetails, MatchReference } from './espn-match';
import type { EspnEndpointDetails } from './espn-endpoints';

export type HistoryTeam = { id: string; name: string; side: string | null; score: string; winner: boolean | null; shootout: string | null };
export type HistoryGame = { id: string; kickoff: string; status: string | null; teams: HistoryTeam[] };
export type HistorySource = EspnEndpointDetails & { ok: boolean; season: number };
export type MatchHistoryBoard = {
  reference: MatchReference; cutoff: string | null; seasonYears: number[]; fetchedAt: string;
  status: 'ready' | 'partial' | 'unavailable'; message: string | null;
  teams: { teamId: string; name: string; games: HistoryGame[]; sources: HistorySource[] }[];
  headToHead: HistoryGame[];
};
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const reportedScore = (v: unknown): string | null => { const value = text(object(v).displayValue) ?? text(object(v).value) ?? text(v); return value !== null && !['-', '--', '—'].includes(value) ? value : null; };
const score = (v: unknown): string | null => { const value = reportedScore(v); return value !== null && /^\d{1,5}$/.test(value) ? value : null; };
export const validTeamId = (v: string) => /^[1-9]\d{0,19}$/.test(v);

/** Read supplied completed fixtures only. Do not follow references, infer completion, or use future results. */
export function parseTeamSchedule(payload: unknown, teamId: string, season: number, cutoff: string, eventId: string, leagueSlug?: string): HistoryGame[] {
  const root = object(payload);
  if (text(object(root.team).id) !== teamId || Number(object(root.season).year) !== season || !Array.isArray(root.events)) throw new Error('Schedule team/season not confirmed');
  const rootLeague = text(object(root.league).slug);
  if (leagueSlug && rootLeague && rootLeague !== leagueSlug) throw new Error('Schedule competition not confirmed');
  const seen = new Set<string>();
  return root.events.slice(0, 500).flatMap((entry): HistoryGame[] => {
    const event = object(entry); const competition = object(list(event.competitions)[0]);
    const type = object(object(competition.status ?? event.status).type);
    const leagues = [event.league, ...list(event.leagues), competition.league].map((value) => text(object(value).slug)).filter((slug): slug is string => !!slug);
    if (leagueSlug && leagues.length && !leagues.includes(leagueSlug)) return [];
    const id = text(event.id); const date = text(competition.date) ?? text(event.date);
    if (!id || !validTeamId(id) || id === eventId || seen.has(id) || !date || !Number.isFinite(Date.parse(date)) || Date.parse(date) >= Date.parse(cutoff)
      || type.completed !== true || /cancel|postpon|abandon|suspend/i.test(`${type.name ?? ''} ${type.detail ?? ''}`)) return [];
    const competitors = list(competition.competitors);
    if (competitors.length !== 2) return [];
    const teams = competitors.flatMap((raw): HistoryTeam[] => {
      const row = object(raw); const team = object(row.team); const id = text(team.id); const name = text(team.displayName) ?? text(team.name); const points = reportedScore(row.score);
      return id && validTeamId(id) && name && points !== null ? [{ id, name, side: text(row.homeAway), score: points, winner: typeof row.winner === 'boolean' ? row.winner : null, shootout: score(row.shootoutScore) }] : [];
    });
    if (teams.length !== 2 || teams[0].id === teams[1].id || !teams.some((team) => team.id === teamId) || teams.every((team) => team.winner === true)) return [];
    seen.add(id);
    let status = text(type.detail) ?? text(type.description);
    if (/penalt|shootout|_pen(?:$|_)/i.test(String(type.name)) && !/penalt|shootout/i.test(status ?? '')) status = `${status ?? 'Final'} · Penalties`;
    if (/extra|overtime|_aet|_ot(?:$|_)/i.test(String(type.name)) && !/extra|overtime|\bOT\b/i.test(status ?? '')) status = `${status ?? 'Final'} · After extra time / overtime`;
    return [{ id, kickoff: new Date(date).toISOString(), status, teams }];
  });
}
export function historyOutcome(game: HistoryGame, teamId: string): 'W' | 'D' | 'L' | null {
  const team = game.teams.find((t) => t.id === teamId); const opponent = game.teams.find((t) => t.id !== teamId);
  if (!team || !opponent) return null;
  if (team.winner === true) return 'W';
  if (opponent.winner === true) return 'L';
  if (team.shootout !== null && opponent.shootout !== null && Number(team.shootout) !== Number(opponent.shootout)) return Number(team.shootout) > Number(opponent.shootout) ? 'W' : 'L';
  const penalties = /penalt|shootout/i.test(game.status ?? '');
  // A reported draw (e.g. a multi-day cricket match) overrides unequal run totals.
  if (!penalties && /\bdraw(?:n)?\b|\btied\b/i.test(game.status ?? '')) return 'D';
  const numericScores = [team.score, opponent.score].every((value) => /^\d{1,5}$/.test(value));
  if (!numericScores) return null;
  if (Number(team.score) !== Number(opponent.score)) return Number(team.score) > Number(opponent.score) ? 'W' : 'L';
  // A drawn scoreline alone cannot establish the winner of a penalty shootout.
  return penalties ? null : 'D';
}
export function recentGames(games: HistoryGame[], teamIds: string[]): HistoryGame[] {
  const unique = new Map<string, HistoryGame>(); const conflicts = new Set<string>();
  const signature = (game: HistoryGame) => JSON.stringify([game.kickoff, [...game.teams].sort((a, b) => a.id.localeCompare(b.id)).map((team) => [team.id, team.score, team.winner, team.shootout])]);
  for (const game of games) {
    if (!teamIds.every((id) => game.teams.some((team) => team.id === id))) continue;
    const previous = unique.get(game.id);
    if (previous && signature(previous) !== signature(game)) conflicts.add(game.id);
    else unique.set(game.id, game);
  }
  return [...unique.values()].filter((game) => !conflicts.has(game.id)).sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff) || a.id.localeCompare(b.id)).slice(0, 5);
}

export function isMatchHistoryBoard(value: unknown, match: MatchDetails): value is MatchHistoryBoard {
  const board = object(value); const reference = object(board.reference);
  const optionalText = (v: unknown) => v === null || typeof v === 'string';
  const validGame = (raw: unknown) => {
    const game = object(raw);
    return typeof game.id === 'string' && validTeamId(game.id) && game.id !== match.reference.eventId
      && typeof game.kickoff === 'string' && Number.isFinite(Date.parse(game.kickoff)) && !!match.kickoff && Date.parse(game.kickoff) < Date.parse(match.kickoff)
      && optionalText(game.status) && Array.isArray(game.teams) && game.teams.length === 2 && game.teams.every((raw) => {
        const team = object(raw);
        return typeof team.id === 'string' && validTeamId(team.id) && typeof team.name === 'string' && optionalText(team.side) && typeof team.score === 'string' && reportedScore(team.score) !== null
          && (team.winner === null || typeof team.winner === 'boolean') && (team.shootout === null || typeof team.shootout === 'string' && score(team.shootout) !== null);
      }) && object(game.teams[0]).id !== object(game.teams[1]).id;
  };
  const games = (v: unknown) => Array.isArray(v) && v.length <= 5 && v.every(validGame);
  return reference.league === match.reference.league && reference.eventId === match.reference.eventId && board.cutoff === match.kickoff
    && ['ready', 'partial', 'unavailable'].includes(String(board.status)) && optionalText(board.message)
    && typeof board.fetchedAt === 'string' && Number.isFinite(Date.parse(board.fetchedAt))
    && Array.isArray(board.seasonYears) && board.seasonYears.length <= 2 && board.seasonYears.every((year) => Number.isInteger(year) && year >= 1900 && year <= 2100)
    && (board.status === 'unavailable' || board.seasonYears[0] === match.season?.year)
    && Array.isArray(board.teams) && (board.status === 'unavailable' ? board.teams.length === 0 || board.teams.length === 2 : board.teams.length === 2)
    && new Set(board.teams.map((raw) => object(raw).teamId)).size === board.teams.length
    && board.teams.every((raw) => {
      const team = object(raw);
      return match.teams.some((t) => t.id === team.teamId) && typeof team.name === 'string' && games(team.games)
        && (team.games as HistoryGame[]).every((game) => game.teams.some((t) => t.id === team.teamId))
        && Array.isArray(team.sources) && team.sources.length <= 2 && team.sources.every((raw) => {
          const source = object(raw);
          return typeof source.ok === 'boolean' && typeof source.url === 'string' && (source.httpStatus === null || typeof source.httpStatus === 'number') && (board.seasonYears as number[]).includes(source.season as number);
        });
    }) && games(board.headToHead) && (board.headToHead as HistoryGame[]).every((game) => match.teams.every((team) => game.teams.some((t) => t.id === team.id)));
}
