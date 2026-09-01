/**
 * Verifies the predictions pipeline in src/lib/sports.ts against a mocked
 * RapidAPI v2 response (documented schema: { data: [ { id, start_date,
 * home_team, away_team, prediction, odds, competition_name, ... } ] }).
 * Run: npx tsx scripts/test-predictions.mts
 */
import 'dotenv/config';

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date()); // YYYY-MM-DD in London

// Realistic RapidAPI payload: unsorted, >12 rows, missing odds, "T" and space
// separated naive-UTC start_date values as seen in the provider docs.
const rapidApiPayload = {
  success: true,
  data: Array.from({ length: 15 }, (_, i) => ({
    id: 1000 + i,
    start_date:
      i === 5
        ? `2026-09-0${(i % 8) + 1} 1${i % 9}:${(i * 7) % 60 < 10 ? '0' : ''}${(i * 7) % 60}:00` // space variant
        : `2026-09-0${(i % 8) + 1}T1${i % 9}:${(i * 7) % 60 < 10 ? '0' : ''}${(i * 7) % 60}:00`,
    home_team: `Home ${i}`,
    away_team: `Away ${i}`,
    prediction: ['1', 'X', '2', '1X', 'X2', '12'][i % 6],
    odds: i === 3 ? null : { '1': 1.5 + i / 10, X: 3.2, '2': 4.1, '1X': 1.2 + i / 20, X2: 1.9, '12': 1.15 }, // row 3: no odds
    competition_name: i % 2 ? 'Premier League' : 'La Liga',
    federation: 'UEFA',
    market: 'classic',
    result: i % 3 === 0 ? { outcome: 'won' } : null,
  })),
};

const calls: string[] = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const href = String(url);
  calls.push(href);
  const headers = (init?.headers || {}) as Record<string, string>;
  if (href.includes('football-prediction-api.p.rapidapi.com')) {
    // Echo back the auth headers the code must send to RapidAPI.
    calls.push(`  key=${headers['X-RapidAPI-Key'] ? 'present' : 'MISSING'} host=${headers['X-RapidAPI-Host'] || 'MISSING'} qs=${href.split('?')[1]}`);
    return new Response(JSON.stringify(rapidApiPayload), { status: 200 });
  }
  if (href.includes('espn.com')) return new Response(JSON.stringify({ events: [] }), { status: 200 });
  if (href.includes('thesportsdb.com')) return new Response(JSON.stringify({ events: null }), { status: 200 });
  throw new Error(`unexpected url ${href}`);
}) as typeof fetch;

const { getSportsBoard, formatPredictionKickoff } = await import('../src/lib/sports');

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`);
  if (!cond) failures++;
}

if (!process.env.RAPIDAPI_KEY) {
  console.log('RAPIDAPI_KEY missing — set it to exercise the rapidapi path');
  process.exit(1);
}

const board = await getSportsBoard({ bypassCache: true });
const p = board.predictions;

console.log('rapidapi call seen:', calls.find((c) => c.startsWith('  key=')));
check('sends X-RapidAPI-Key header', calls.some((c) => c.includes('key=present')));
check('sends X-RapidAPI-Host header', calls.some((c) => c.includes('host=football-prediction-api.p.rapidapi.com')));
check('queries federation=UEFA & market=classic', calls.some((c) => c.includes('federation=UEFA') && c.includes('market=classic')));
check(`asks for TODAY'S date in London (iso_date=${today})`, calls.some((c) => c.includes(`iso_date=${today}`)), today);
check('capped at 12 predictions', p.length === 12, { got: p.length });
check('sorted by startAt ascending', p.every((x, i) => i === 0 || p[i - 1].startAt <= x.startAt), p.map((x) => x.startAt));
check('source tagged rapidapi', p.every((x) => x.source === 'rapidapi'));
check('home/away mapped as API responds', p.some((x) => x.homeTeam.startsWith('Home ') && x.awayTeam.startsWith('Away ')));
check('pick mapped (1/X/2/1X/X2/12)', p.some((x) => ['1', 'X', '2', '1X', 'X2', '12'].includes(x.prediction)));
check('odds resolved for pick where present', p.some((x) => x.winOdds && Number(x.winOdds) > 1));
check('row without odds → winOdds null', !p.some((x) => x.homeTeam === 'Home 3' && x.winOdds), p.filter((x) => !x.winOdds).map((x) => x.homeTeam));
check('competition_name mapped', p.every((x) => x.competition === 'Premier League' || x.competition === 'La Liga'));
check('board mode not demo when predictions exist', board.mode !== 'demo', { mode: board.mode });
check('source report ok with count', board.sources.some((s) => s.id === 'rapidapi:predictions' && s.ok && s.count === 12), board.sources.find((s) => s.id === 'rapidapi:predictions'));

// start_date is naive UTC — must be tagged as UTC, not shifted.
check('naive "T" start_date parsed as UTC', p.some((x) => x.startAt === '2026-09-01T11:00:00.000Z' || /^2026-09-0\dT1\d:00:00\.000Z$/.test(x.startAt)), p.slice(0, 3).map((x) => x.startAt));
check('space-separated start_date normalized', p.some((x) => /^2026-09-0\dT1\d:\d\d:00\.000Z$/.test(x.startAt)));

// Nairobi (EAT, UTC+3) display conversion.
check('kickoff rendered in Nairobi time (UTC+3)', formatPredictionKickoff('2026-09-02T19:00:00Z') === '2 Sept, 22:00 EAT', formatPredictionKickoff('2026-09-02T19:00:00Z'));
check('kickoff day rollover past midnight EAT', formatPredictionKickoff('2026-09-02T22:30:00Z') === '3 Sept, 01:30 EAT', formatPredictionKickoff('2026-09-02T22:30:00Z'));
check('kickoff label stable across invocations', formatPredictionKickoff('2026-12-06T19:00:00Z') === formatPredictionKickoff('2026-12-06T19:00:00Z'));

// Cache behavior: second call within 45s must not refetch.
calls.length = 0;
const again = await getSportsBoard();
check('45s cache prevents refetch', calls.length === 0 && again.fetchedAt === board.fetchedAt);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
