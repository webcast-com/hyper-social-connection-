import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPN_LEAGUES, SPORTS_COMPETITIONS, SPORTS_REGIONS, AVAILABLE_SPORTS } from '../../src/lib/sports-catalog';
import { filterSportsEvents, getSportsBoard, groupEventsByLeague, type SportsEvent } from '../../src/lib/sports';

const fixture = (league: string, sport: SportsEvent['sport'], status: SportsEvent['status'] = 'upcoming'): SportsEvent => ({
  id: league, source: 'espn', league, leagueName: SPORTS_COMPETITIONS.find((item) => item.slug === league)!.name,
  sport, status, startAt: '2026-10-22T18:00:00Z', home: { name: 'Home Club' }, away: { name: 'Away Club' },
});
const events = [fixture('epl', 'football', 'live'), fixture('jleague', 'football'), fixture('nba', 'basketball'), fixture('mlb', 'baseball', 'final'), fixture('south-africa', 'football')];

test('the catalog expands worldwide coverage with unique provider IDs and all regions', () => {
  assert.equal(SPORTS_COMPETITIONS.length, ESPN_LEAGUES.length);
  assert.ok(SPORTS_COMPETITIONS.length > 35);
  assert.ok(!SPORTS_COMPETITIONS.some((league) => league.slug === 'ipl'));
  assert.equal(new Set(SPORTS_COMPETITIONS.map((league) => league.slug)).size, SPORTS_COMPETITIONS.length);
  assert.equal(new Set(ESPN_LEAGUES.map((league) => `${league.sport}/${league.league}`)).size, ESPN_LEAGUES.length);
  for (const region of SPORTS_REGIONS) assert.ok(SPORTS_COMPETITIONS.some((league) => league.region === region.id));
  for (const sport of ['football', 'basketball', 'rugby', 'baseball', 'ice-hockey']) assert.ok(AVAILABLE_SPORTS.includes(sport as typeof AVAILABLE_SPORTS[number]));
  assert.ok(SPORTS_COMPETITIONS.some((league) => league.slug === 'wsl'));
  assert.ok(SPORTS_COMPETITIONS.some((league) => league.slug === 'wnba'));
});

test('sport, region, status, league and search filters combine without changing the input', () => {
  assert.equal(filterSportsEvents(events, 'all', { sport: 'football', region: 'asia', status: 'upcoming', league: 'jleague', query: ' HOME ' })[0]?.league, 'jleague');
  assert.equal(filterSportsEvents(events, 'all', { sport: 'football', region: 'asia', status: 'live' }).length, 0);
  assert.equal(filterSportsEvents(events, 'all', { query: 'NBA' })[0]?.league, 'nba');
  assert.equal(filterSportsEvents(events, 'all', { region: 'africa' })[0]?.league, 'south-africa');
  assert.equal(filterSportsEvents(events, 'live').length, 1);
  assert.equal(filterSportsEvents(events, 'baseball').length, 1);
  assert.equal(groupEventsByLeague([...events, events[0]])[0].events.length, 2);
  assert.equal(events.length, 5);
});

async function withFetch(run: () => Promise<void>, respond: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = respond;
  try { await run(); } finally {
    globalThis.fetch = original;
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
    assert.deepEqual(first.predictions, []);
    assert.equal(first.events.length, ESPN_LEAGUES.length);
    assert.equal(urls.length, ESPN_LEAGUES.length);
    assert.ok(urls.every((url) => new URL(url).hostname === 'site.api.espn.com'));
    assert.equal(first.sources.length, ESPN_LEAGUES.length);
    assert.ok(first.sources.every((source) => source.id.startsWith('espn:')));
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
    return Response.json(scoreboard('Home'));
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

test('ESPN NBA results preserve three-digit scores and final status without a secondary provider', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    const basketball = board.events.find((event) => event.league === 'nba');
    assert.equal(basketball?.source, 'espn');
    assert.equal(basketball?.sport, 'basketball');
    assert.equal(basketball?.status, 'final');
    assert.equal(basketball?.home.score, 184);
    assert.equal(basketball?.away.score, 183);
  }, async (input) => {
    const payload = scoreboard('Home');
    const competition = payload.events[0].competitions[0];
    competition.status.type.state = 'post';
    competition.competitors[0].score = '184';
    competition.competitors[1].score = '183';
    return Response.json(String(input).includes('/basketball/nba/') ? payload : { events: [] });
  });
});

test('total provider failure produces explicitly marked samples spanning the new sports and regions', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    assert.equal(board.mode, 'demo');
    assert.deepEqual(board.predictions, []);
    assert.ok(board.events.every((event) => event.source === 'demo'));
    assert.ok(board.events.every((event) => SPORTS_COMPETITIONS.some((league) => league.slug === event.league)));
    assert.equal(board.sources.filter((source) => !source.ok).length, ESPN_LEAGUES.length);
    for (const slug of ['jleague', 'south-africa', 'brasileirao', 'mlb', 'nhl', 'super-rugby']) assert.ok(board.events.some((event) => event.league === slug));
  }, async () => { throw new Error('offline'); });
});


test('invalid ESPN payloads are reported as failed feeds, not successful empty schedules', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    assert.equal(board.mode, 'partial');
    const source = board.sources.find((source) => source.id === 'espn:epl');
    assert.equal(source?.ok, false);
    assert.match(source?.error || '', /Invalid ESPN scoreboard/);
    assert.ok(board.events.every((event) => event.source !== 'demo'));
  }, async (input) => Response.json(String(input).includes('/soccer/eng.1/') ? { error: 'unavailable' } : { events: [] }));
});
test('same-day F1 sessions survive aggregation and can be searched by race title or any driver', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    assert.equal(board.events.length, 2);
    assert.equal(new Set(board.events.map((event) => event.id)).size, 2);
    assert.equal(filterSportsEvents(board.events, 'all', { query: 'Review Grand Prix' }).length, 2);
    assert.equal(filterSportsEvents(board.events, 'all', { query: 'Third Driver' }).length, 2);
  }, async (input) => Response.json(String(input).includes('/racing/f1/') ? { events: [{
    id: 'gp', name: 'Review Grand Prix', competitions: ['practice', 'race'].map((id) => ({
      id, date: '2026-10-22T18:00:00Z', competitors: ['First Driver', 'Second Driver', 'Third Driver'].map((displayName, i) => ({ athlete: { displayName }, order: i + 1 })),
    })),
  }] } : { events: [] }));
});


test('ESPN-only aggregation preserves same-day doubleheaders between the same teams', async () => {
  await withFetch(async () => {
    const board = await getSportsBoard({ bypassCache: true });
    assert.equal(board.events.length, 2);
    assert.equal(new Set(board.events.map((event) => event.id)).size, 2);
    assert.ok(board.events.every((event) => event.source === 'espn'));
  }, async (input) => {
    const first = scoreboard('Home').events[0];
    return Response.json(String(input).includes('/baseball/mlb/') ? { events: [
      { ...first, id: 'first-game' }, { ...first, id: 'second-game' },
    ] } : { events: [] });
  });
});

test('legacy prediction credentials never trigger requests or affect ESPN feed status', async () => {
  const previous = process.env.RAPIDAPI_KEY;
  process.env.RAPIDAPI_KEY = 'unused-legacy-test-key';
  const urls: string[] = [];
  try {
    await withFetch(async () => {
      const board = await getSportsBoard({ bypassCache: true });
      assert.equal(board.mode, 'live');
      assert.deepEqual(board.predictions, []);
      assert.equal(urls.length, ESPN_LEAGUES.length);
      assert.ok(urls.every((url) => new URL(url).hostname === 'site.api.espn.com'));
      assert.ok(board.sources.every((source) => source.id.startsWith('espn:')));
    }, async (input) => { urls.push(String(input)); return Response.json({ events: [] }); });
  } finally {
    if (previous === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = previous;
  }
});
