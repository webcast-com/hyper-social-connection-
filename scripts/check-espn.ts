import { ESPN_LEAGUES } from '../src/lib/sports-catalog';
import { fetchEspnEvents, espnScoreboardUrl } from '../src/lib/espn-client';

// Run from the deployment network: npm run check:espn -- epl nba f1
async function main() {
  const slugs = process.argv.slice(2);
  const leagues = ESPN_LEAGUES.filter((league) => !slugs.length || slugs.includes(league.slug));
  if (!leagues.length || slugs.some((slug) => !ESPN_LEAGUES.some((league) => league.slug === slug))) {
    console.error('Unknown competition. Use configured slugs, for example: epl nba f1');
    process.exitCode = 1;
    return;
  }
  const results: { league: string; ok: boolean; events: number; live: number; url: string; error?: string }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, leagues.length) }, async () => {
    while (next < leagues.length) {
      const league = leagues[next++];
      try {
        const events = await fetchEspnEvents(league);
        results.push({ league: league.slug, url: espnScoreboardUrl(league), ok: true, events: events.length, live: events.filter((event) => event.status === 'live').length });
      } catch (error) {
        results.push({ league: league.slug, url: espnScoreboardUrl(league), ok: false, events: 0, live: 0, error: error instanceof Error ? error.message : 'Request failed' });
      }
    }
  }));
  console.table(results.sort((a, b) => a.league.localeCompare(b.league)));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
void main();
