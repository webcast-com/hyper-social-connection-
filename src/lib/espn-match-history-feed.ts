import { getMatchDetails } from './espn-match-feed';
import { resolveMatch } from './espn-match';
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnFailureDetails, espnResponseMetadata } from './espn-endpoints';
import { parseTeamSchedule, recentGames, validTeamId, type HistoryGame, type HistorySource, type MatchHistoryBoard } from './espn-match-history';

const cache = new Map<string, { at: number; board: MatchHistoryBoard }>();
const pending = new Map<string, Promise<MatchHistoryBoard>>();
async function fetchHistory(league: string, eventId: string): Promise<MatchHistoryBoard> {
  const { meta, reference } = resolveMatch(league, eventId);
  const summary = await getMatchDetails(league, eventId);
  const match = summary.match;
  const base: MatchHistoryBoard = { reference, cutoff: match?.kickoff ?? null, seasonYears: [], teams: [], headToHead: [], fetchedAt: new Date().toISOString(), status: 'unavailable', message: null };
  if (!match) return { ...base, message: 'Match details are unavailable. Refresh the match details before retrying history.' };
  const year = match.season?.year;
  if (!year || !match.kickoff || !match.teams.every((team) => validTeamId(team.id))) return { ...base, message: 'The provider did not report a usable match season, kickoff or team ID. Historical results cannot be safely selected.' };
  const years = year > 1900 ? [year, year - 1] : [year];
  const signal = AbortSignal.timeout(8000);
  const teams = await Promise.all(match.teams.map(async (team) => {
    const schedules = await Promise.all(years.map(async (season): Promise<{ games: HistoryGame[]; source: HistorySource }> => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${meta.sport}/${meta.league}/teams/${team.id}/schedule?season=${season}`;
      let status: number | null = null;
      try {
        const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal }); status = response.status;
        if (!response.ok) {
          const metadata = espnResponseMetadata(response.headers); await response.body?.cancel().catch(() => undefined);
          throw new EspnEndpointError(`ESPN HTTP ${status}`, url, 'http', status, metadata);
        }
        const games = parseTeamSchedule(await response.json(), team.id, season, match.kickoff!, eventId, meta.league);
        return { games, source: { ok: true, url, season, httpStatus: status } };
      } catch (error) {
        const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(signal.aborted ? 'ESPN history request timed out' : status !== null ? 'ESPN returned invalid team history' : 'ESPN history request failed', url, signal.aborted ? 'timeout' : status !== null ? 'invalid-response' : 'network', status);
        return { games: [], source: { ok: false, season, ...espnFailureDetails(failure, url) } };
      }
    }));
    return { teamId: team.id, name: team.name, allGames: schedules.flatMap((s) => s.games), sources: schedules.map((s) => s.source) };
  }));
  const sources = teams.flatMap((team) => team.sources);
  const status = sources.every((s) => s.ok) ? 'ready' : sources.some((s) => s.ok) ? 'partial' : 'unavailable';
  return { ...base, seasonYears: years, status, message: status === 'ready' ? null : 'Some requested schedules are unavailable; available results may be incomplete.', fetchedAt: new Date().toISOString(),
    teams: teams.map(({ allGames, ...team }) => ({ ...team, games: recentGames(allGames, [team.teamId]) })),
    headToHead: recentGames(teams.flatMap((team) => team.allGames), match.teams.map((team) => team.id)) };
}
/** At most two jobs × four schedules = eight upstream schedule requests, separate from summary work. */
export function getMatchHistory(league: string, eventId: string, refresh = false): Promise<MatchHistoryBoard> {
  const { url } = resolveMatch(league, eventId);
  const active = pending.get(url); if (active) return active;
  const saved = cache.get(url);
  if (!refresh && saved && Date.now() - saved.at < (saved.board.status === 'ready' ? 300_000 : 15_000)) return Promise.resolve(saved.board);
  if (pending.size >= 2) return Promise.reject(new Error('Match history is busy; try again shortly'));
  const job = fetchHistory(league, eventId).then((board) => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), board }); return board;
  }).finally(() => pending.delete(url));
  pending.set(url, job); return job;
}
