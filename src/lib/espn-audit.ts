import { fetchEspnScoreboard } from './espn-client';
import { espnFailureDetails, espnScoreboardUrl, type EspnEndpointDetails } from './espn-endpoints';
import { ESPN_LEAGUES, type EspnLeague } from './sports-catalog';

export type EspnAuditRow = EspnEndpointDetails & {
  league: string; sport: EspnLeague['kind']; providerSport: string;
  name: string; ok: boolean; events: number | null; live: number | null; error?: string;
};

/** Check every selected scoreboard with the app's real transport; never use demo data. */
export async function auditEspnScoreboards(leagues: EspnLeague[] = ESPN_LEAGUES) {
  const results: EspnAuditRow[] = new Array(leagues.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, leagues.length) }, async () => {
    while (next < leagues.length) {
      const index = next++;
      const league = leagues[index];
      const common = { league: league.slug, sport: league.kind, providerSport: league.sport, name: league.name };
      try {
        const board = await fetchEspnScoreboard(league);
        results[index] = { ...common, url: board.url, httpStatus: board.httpStatus, ok: true,
          events: board.events.length, live: board.events.filter((event) => event.status === 'live').length };
      } catch (error) {
        results[index] = { ...common, ...espnFailureDetails(error, espnScoreboardUrl(league)), ok: false, events: null, live: null };
      }
    }
  }));
  const sports = [...new Set(leagues.map((league) => league.kind))].map((sport) => {
    const rows = results.filter((row) => row.sport === sport);
    return { sport, checked: rows.length, healthy: rows.filter((row) => row.ok).length,
      http403: rows.filter((row) => row.httpStatus === 403).length,
      http404: rows.filter((row) => row.httpStatus === 404).length,
      noHttpResponse: rows.filter((row) => row.httpStatus === null).length };
  });
  return {
    checkedAt: new Date().toISOString(),
    summary: { checked: results.length, healthy: results.filter((row) => row.ok).length,
      http403: results.filter((row) => row.httpStatus === 403).length,
      http404: results.filter((row) => row.httpStatus === 404).length,
      httpErrors: results.filter((row) => row.errorKind === 'http').length,
      networkFailures: results.filter((row) => row.errorKind === 'network').length,
      timeouts: results.filter((row) => row.errorKind === 'timeout').length,
      invalidResponses: results.filter((row) => row.errorKind === 'invalid-response').length },
    sports, results,
  };
}
