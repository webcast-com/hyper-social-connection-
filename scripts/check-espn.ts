import { ESPN_LEAGUES, AVAILABLE_SPORTS } from '../src/lib/sports-catalog';
import { auditEspnScoreboards } from '../src/lib/espn-audit';

// Run from the deployment network; ESPN is outside this sandbox's outbound allowlist.
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run check:espn -- [league slugs] [--sport <sport>] [--json]\nExamples: epl nba f1 | --sport rugby | --json\nSports: ' + AVAILABLE_SPORTS.join(', '));
    return;
  }
  let json = false;
  let sport: string | undefined;
  const slugs: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') json = true;
    else if (arg === '--sport') {
      sport = args[++index];
      if (!sport || !AVAILABLE_SPORTS.some((id) => id === sport)) throw new Error(`Unknown sport. Use: ${AVAILABLE_SPORTS.join(', ')}`);
    } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else slugs.push(arg);
  }
  if (slugs.some((slug) => !ESPN_LEAGUES.some((league) => league.slug === slug))) {
    throw new Error('Unknown competition. Use configured slugs, for example: epl nba f1');
  }
  const leagues = ESPN_LEAGUES.filter((league) => (!slugs.length || slugs.includes(league.slug)) && (!sport || league.kind === sport));
  if (!leagues.length) throw new Error('No competitions match the supplied sport and league filters');
  const report = await auditEspnScoreboards(leagues);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.table(report.results);
    console.table(report.sports);
    console.log(JSON.stringify(report.summary));
    if (report.results.some((row) => row.httpStatus === null)) console.log('No HTTP response is a network/timeout failure, not a 404 or an empty schedule.');
  }
  if (report.results.some((result) => !result.ok)) process.exitCode = 1;
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Audit failed');
  process.exitCode = 1;
});
