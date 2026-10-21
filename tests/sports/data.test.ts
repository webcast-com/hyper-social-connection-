import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPN_LEAGUES, SPORTS_COMPETITIONS, SPORTS_REGIONS, AVAILABLE_SPORTS } from '../../src/lib/sports-catalog';
import { filterSportsEvents, getSportsBoard, groupEventsByLeague, type SportsEvent } from '../../src/lib/sports';

const fixture = (league: string, sport: SportsEvent['sport'], status: SportsEvent['status'] = 'upcoming'): SportsEvent => ({
  id: league, source: 'espn', league, leagueName: SPORTS_COMPETITIONS.find((item) => item.slug === league)!.name,
  sport, status, startAt: '2026-10-22T18:00:00Z', home: { name: 'Home Club' }, away: { name: 'Away Club' },
});
const events = [fixture('epl', 'football', 'live'), fixture('jleague', 'football'), fixture('ipl', 'cricket'), fixture('mlb', 'baseball', 'final'), fixture('south-africa', 'football')];

test('the catalog expands worldwide coverage with unique provider IDs and all regions', () => {
  assert.ok(SPORTS_COMPETITIONS.length > 35);
  assert.equal(new Set(SPORTS_COMPETITIONS.map((league) => league.slug)).size, SPORTS_COMPETITIONS.length);
  assert.equal(new Set(ESPN_LEAGUES.map((league) => `${league.sport}/${league.league}`)).size, ESPN_LEAGUES.length);
  for (const region of SPORTS_REGIONS) assert.ok(SPORTS_COMPETITIONS.some((league) => league.region === region.id));
  for (const sport of ['football', 'basketball', 'cricket', 'rugby', 'baseball', 'ice-hockey']) assert.ok(AVAILABLE_SPORTS.includes(sport as typeof AVAILABLE_SPORTS[number]));
  assert.ok(SPORTS_COMPETITIONS.some((league) => league.slug === 'wsl'));
  assert.ok(SPORTS_COMPETITIONS.some((league) => league.slug === 'wnba'));
});

test('sport, region, status, league and search filters combine without changing the input', () => {
  assert.equal(filterSportsEvents(events, 'all', { sport: 'football', region: 'asia', status: 'upcoming', league: 'jleague', query: ' HOME ' })[0]?.league, 'jleague');
  assert.equal(filterSportsEvents(events, 'all', { sport: 'football', region: 'asia', status: 'live' }).length, 0);
  assert.equal(filterSportsEvents(events, 'all', { query: 'indian premier' })[0]?.league, 'ipl');
  assert.equal(filterSportsEvents(events, 'all', { region: 'africa' })[0]?.league, 'south-africa');
  assert.equal(filterSportsEvents(events, 'live').length, 1);
  assert.equal(filterSportsEvents(events, 'baseball').length, 1);
  assert.equal(groupEventsByLeague([...events, events[0]])[0].events.length, 2);
  assert.equal(events.length, 5);
});

async function withFetch(run: () => Promise<void>, respond: typeof fetch) {
  const original = globalThis.fetch;
  const key = process.env.RAPIDAPI_KEY;
  globalThis.fetch = respond;
  delete process.env.RAPIDAPI_KEY;
  try { await run(); } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.RAPIDAPI_KEY; else process.env.RAPIDAPI_KEY = key;
  }
}
const scoreboard = (name: string) => ({ events: [{ id: '1', date: '2026-10-22T18:00:00Z', competitions: [{ status: { type: { state: 'in', shortDetail: 'Live' } }, competitors: [
  { homeAway: 'home', team: { displayName: name }, score: '3' },
  { homeAway: 'away', team: { displayName: 'Visitors' }, score: '1' },
] }] }] });

test('all configured endpoints are requested, concurrency is bounded, and concurrent refreshes share work', async () => {
  const urls: string[] = [];
  let active = 0;
  let maximum = 0;
  await withFetch(async () => {
    const [first, second] = await Promise.all([getSportsBoard({ bypassCache: true }), getSportsBoard({ bypassCache: true })]);
    assert.equal(first, second);
    assert.equal(first.mode, 'live');
    assert.equal(first.events.length, ESPN_LEAGUES.length);
    assert.equal(urls.length, ESPN_LEAGUES.length + 10);
    assert.ok(maximum <= 12);
    assert.ok(maximum > 1);
    for (const competition of ESPN_LEAGUES) assert.ok(urls.some((url) => url.includes(`/${competition.sport}/${competition.league}/scoreboard`)));
    assert.equal(first.events.find((event) => event.league === 'super-rugby')?.sport, 'rugby');
    const count = urls.length;
    assert.equal(await getSportsBoard(), first);
    assert.equal(urls.length, count);
  }, async (input) => {
    const url = String(input);
    urls.push(url); active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return Response.json(url.includes('espn') ? scoreboard('Home') : { events: null });
  });
});

test('one failed league does not discard other global scores', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    assert.equal(board.mode, 'partial');
    assert.ok(board.events.some((event) => event.league === 'jleague'));
    assert.equal(board.sources.find((source) => source.id === 'espn:mlb')?.ok, false);
    assert.ok(board.events.every((event) => event.source !== 'demo'));
  }, async (input) => String(input).includes('/baseball/mlb/') ? new Response('', { status: 503 }) : Response.json(String(input).includes('espn') ? scoreboard('Home') : { events: [] }));
});

test('successful empty scoreboards stay empty rather than substituting fabricated fixtures', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    assert.equal(board.mode, 'live');
    assert.equal(board.events.length, 0);
  }, async () => Response.json({ events: [] }));
});

test('IPL fixtures retain cricket results and team scores from the secondary provider', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    const cricket = board.events.find((event) => event.league === 'ipl');
    assert.equal(cricket?.sport, 'cricket');
    assert.equal(cricket?.detail, 'Home won by 4 wickets');
    assert.equal(cricket?.home.score, 184);
  }, async (input) => Response.json(String(input).includes('eventspastleague.php?id=4460') ? { events: [{ idEvent: 'ipl1', dateEvent: '2026-10-22', strTime: '12:00:00', strHomeTeam: 'Home', strAwayTeam: 'Away', intHomeScore: '184', intAwayScore: '183', strResult: 'Home won by 4 wickets' }] } : { events: [] }));
});

test('total provider failure produces explicitly marked samples spanning the new sports and regions', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    assert.equal(board.mode, 'demo');
    assert.ok(board.events.every((event) => event.source === 'demo'));
    for (const slug of ['jleague', 'south-africa', 'brasileirao', 'ipl', 'mlb', 'nhl', 'super-rugby']) assert.ok(board.events.some((event) => event.league === slug));
  }, async () => { throw new Error('offline'); });
});
