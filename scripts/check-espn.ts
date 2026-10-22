import { ESPN_LEAGUES } from '../src/lib/sports-catalog';
import { parseEspnEvents } from '../src/lib/espn';

// Run from the deployment network: npm run check:espn -- epl nba f1
async function main() {
  const slugs = process.argv.slice(2);
  const leagues = ESPN_LEAGUES.filter((league) => !slugs.length || slugs.includes(league.slug));
  if (!leagues.length || slugs.some((slug) => !ESPN_LEAGUES.some((league) => league.slug === slug))) {
    console.error('Unknown competition. Use configured slugs, for example: epl nba f1');
    process.exitCode = 1;
    return;
  }
  const results: { league: string; ok: boolean; events: number; live: number; error?: string }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, leagues.length) }, async () => {
    while (next < leagues.length) {
      const league = leagues[next++];
      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard`, {
          signal: AbortSignal.timeout(5_000), headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const events = parseEspnEvents(await response.json(), league);
        results.push({ league: league.slug, ok: true, events: events.length, live: events.filter((event) => event.status === 'live').length });
      } catch (error) {
        results.push({ league: league.slug, ok: false, events: 0, live: 0, error: error instanceof Error ? error.message : 'Request failed' });
      }
    }
  }));
  console.table(results.sort((a, b) => a.league.localeCompare(b.league)));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
void main();
