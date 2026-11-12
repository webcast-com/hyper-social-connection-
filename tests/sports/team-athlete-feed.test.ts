import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTeamDetail, resetTeamCaches } from '../../src/lib/espn-team-feed';
import { getAthleteDetail, resetAthleteCaches } from '../../src/lib/espn-athlete-feed';
import { TeamInputError } from '../../src/lib/espn-team';
import { AthleteInputError } from '../../src/lib/espn-athlete';

/**
 * The team and player feeds: their own fan-out, cache and failure reporting.
 *
 * What matters most here is that a page never shows data ESPN did not report.
 * One refused part leaves the other two on screen and says which part is
 * missing; a payload about a different entity is treated as a failure rather
 * than rendered under the requested name; and a bad id never reaches the
 * network at all.
 */

async function withFetch(run: () => Promise<void>, respond: (input: any, init?: any) => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = respond as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

const reset = () => { resetTeamCaches(); resetAthleteCaches(); };

const info = (id = 359) => ({ team: { id, displayName: 'Arsenal', abbreviation: 'ARS', record: { items: [{ type: 'total', summary: '12-3-2' }] }, standingSummary: '3rd' } });
const schedule = () => ({ team: { id: 359 }, events: [{ id: 704123, date: '2026-11-08T17:30:00Z', competitions: [{ date: '2026-11-08T17:30:00Z', status: { type: { state: 'post', detail: 'Full Time' } }, competitors: [{ homeAway: 'home', winner: true, score: '2', team: { id: 359, displayName: 'Arsenal' } }, { homeAway: 'away', winner: false, score: '1', team: { id: 364, displayName: 'Chelsea' } }] }] }] });
const roster = () => ({ team: { id: 359 }, roster: [{ athlete: { id: 233064, displayName: 'Bukayo Saka', jersey: '7', position: { abbreviation: 'FW' } } }] });
const player = (id = 3945274) => ({ athlete: { id, displayName: 'Luka Dončić', position: { abbreviation: 'PG' }, team: { id: 1001, displayName: 'Los Angeles Lakers' } } });

const partOf = (url: string) => url.endsWith('/schedule') ? 'schedule' : url.endsWith('/roster') ? 'roster' : url.includes('/athletes/') ? 'athlete' : 'info';

test('a team page asks exactly three ESPN endpoints, built from the catalog', async () => {
  reset();
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getTeamDetail('epl', '359');
    assert.equal(board.status, 'ready');
    assert.equal(board.team?.name, 'Arsenal');
    assert.equal(board.team?.record, '12-3-2');
    assert.equal(board.fixtures.length, 1);
    assert.equal(board.roster.length, 1);
    assert.equal(board.portraitsFromCdn, false, 'soccer portraits are never synthesised');
    assert.deepEqual(board.sources.map((source) => [source.part, source.ok, source.httpStatus]), [['info', true, 200], ['schedule', true, 200], ['roster', true, 200]]);
    assert.deepEqual(board.reference, { league: 'epl', teamId: '359' });
  }, (input) => {
    const url = String(input);
    urls.push(url);
    assert.match(url, /^https:\/\/site\.api\.espn\.com\/apis\/site\/v2\/sports\/soccer\/eng\.1\/teams\/359(\/(schedule|roster))?$/);
    const part = partOf(url);
    return Response.json(part === 'schedule' ? schedule() : part === 'roster' ? roster() : info());
  });
  assert.equal(urls.length, 3, `three requests, got ${urls.length}`);
  assert.deepEqual(urls.map(partOf).sort(), ['info', 'roster', 'schedule']);
  reset();
});

test('one refused part keeps the other two on the page and reports itself', async () => {
  reset();
  await withFetch(async () => {
    const board = await getTeamDetail('epl', '359');
    assert.equal(board.status, 'partial');
    assert.equal(board.team?.name, 'Arsenal');
    assert.equal(board.fixtures.length, 1);
    assert.deepEqual(board.roster, [], 'a refused squad is empty, not invented');
    const refused = board.sources.find((source) => source.part === 'roster')!;
    assert.equal(refused.ok, false);
    assert.equal(refused.httpStatus, 403);
    assert.equal(refused.errorKind, 'http');
    assert.match(refused.error ?? '', /HTTP 403/);
  }, (input) => {
    const url = String(input);
    if (url.endsWith('/roster')) return new Response('denied', { status: 403 });
    const part = partOf(url);
    return Response.json(part === 'schedule' ? schedule() : info());
  });

  // Nothing answered at all: the page says so and holds no data.
  await withFetch(async () => {
    const board = await getTeamDetail('nba', '1001');
    assert.equal(board.status, 'unavailable');
    assert.equal(board.team, null);
    assert.deepEqual(board.fixtures, []);
    assert.deepEqual(board.roster, []);
    assert.equal(board.sources.every((source) => !source.ok), true);
    assert.equal(board.sources.every((source) => source.errorKind === 'network'), true);
  }, (input) => Promise.reject(new Error(`ESPN unreachable for ${String(input)}`)));
  reset();
});

test('a payload about another team is a failure, not this team\u2019s data', async () => {
  reset();
  await withFetch(async () => {
    const board = await getTeamDetail('epl', '359');
    assert.equal(board.status, 'partial');
    assert.equal(board.team, null, 'an unconfirmed identity is not rendered');
    const identity = board.sources.find((source) => source.part === 'info')!;
    assert.equal(identity.ok, false);
    assert.equal(identity.errorKind, 'invalid-response');
    assert.match(identity.error ?? '', /not confirmed|unusable/i);
    assert.equal(board.roster.length, 1, 'the other parts still answer');
  }, (input) => {
    const url = String(input);
    if (url.endsWith('/schedule')) return Response.json(schedule());
    if (url.endsWith('/roster')) return Response.json(roster());
    return Response.json(info(364));
  });

  // Invalid JSON is the same story.
  await withFetch(async () => {
    const board = await getTeamDetail('epl', '359');
    assert.equal(board.sources.find((source) => source.part === 'info')!.errorKind, 'invalid-response');
  }, (input) => {
    const url = String(input);
    if (url.endsWith('/schedule')) return Response.json(schedule());
    if (url.endsWith('/roster')) return Response.json(roster());
    return new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  });
  reset();
});

test('a bad competition or team id never reaches the network', async () => {
  reset();
  let requests = 0;
  await withFetch(async () => {
    assert.throws(() => getTeamDetail('not-a-league', '359'), (error: unknown) => error instanceof TeamInputError && error.httpStatus === 404);
    for (const bad of ['abc', '0359', '', '359/../../admin', '1'.repeat(21)]) {
      assert.throws(() => getTeamDetail('epl', bad), (error: unknown) => error instanceof TeamInputError && error.httpStatus === 400);
    }
    assert.equal(requests, 0, 'a refused id costs no request');
  }, () => { requests += 1; return Response.json(info()); });
  reset();
});

test('team boards are cached, shared across concurrent renders, and bypassed by a refresh', async () => {
  reset();
  let requests = 0;
  await withFetch(async () => {
    const [first, second] = await Promise.all([getTeamDetail('epl', '359'), getTeamDetail('epl', '359')]);
    assert.equal(first, second, 'concurrent renders share one fan-out');
    assert.equal(requests, 3);

    await getTeamDetail('epl', '359');
    assert.equal(requests, 3, 'a cached board costs nothing');

    // Another team is its own entry, and a refresh bypasses the cache.
    await getTeamDetail('epl', '364');
    assert.equal(requests, 6);
    await getTeamDetail('epl', '359', true);
    assert.equal(requests, 9);
    await getTeamDetail('epl', '359');
    assert.equal(requests, 9, 'the refreshed board is cached again');
  }, (input) => {
    requests += 1;
    const part = partOf(String(input));
    return Response.json(part === 'schedule' ? schedule() : part === 'roster' ? roster() : info());
  });
  reset();
});

test('a refused team board is cached briefly, so a page is not hammered', async () => {
  reset();
  let requests = 0;
  await withFetch(async () => {
    const first = await getTeamDetail('epl', '359');
    assert.equal(first.status, 'unavailable');
    assert.equal(requests, 3);
    const second = await getTeamDetail('epl', '359');
    assert.equal(requests, 3, 'a failure is cached briefly so a page is not hammered');
    assert.equal(second.status, 'unavailable');
  }, () => { requests += 1; return Promise.reject(new Error('unreachable')); });
  reset();
});

test('only so many teams are fetched at once, and the rest are told to retry', async () => {
  reset();
  const gates: (() => void)[] = [];
  await withFetch(async () => {
    const jobs = Array.from({ length: 9 }, (_, index) => getTeamDetail('epl', String(359 + index)));
    // The ninth team is refused while eight are still in flight, rather than
    // queueing an unbounded fan-out against the provider.
    await assert.rejects(() => jobs[8], /busy/i);
    assert.equal(gates.length, 24, 'eight teams x three parts, and nothing for the refused ninth');
    for (const open of gates) open();
    const settled = await Promise.allSettled(jobs.slice(0, 8));
    assert.equal(settled.every((result) => result.status === 'fulfilled'), true);
  }, () => new Promise<Response>((resolve) => {
    gates.push(() => resolve(Response.json(info())));
  }));
  reset();
});

test('a player page asks the site endpoint first and the common endpoint only if it must', async () => {
  reset();
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getAthleteDetail('nba', '3945274');
    assert.equal(board.status, 'ready');
    assert.equal(board.athlete?.name, 'Luka Dončić');
    assert.equal(board.athlete?.team?.name, 'Los Angeles Lakers');
    assert.equal(board.portraitsFromCdn, true);
    assert.equal(board.sources.length, 1, 'a served player costs one request');
  }, (input) => { urls.push(String(input)); return Response.json(player()); });
  assert.deepEqual(urls, ['https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/3945274']);

  // The site endpoint refuses: the common v3 endpoint is tried, and both attempts
  // are reported, so a page can show which one answered.
  const tried: string[] = [];
  await withFetch(async () => {
    const board = await getAthleteDetail('epl', '233064');
    assert.equal(board.status, 'ready');
    assert.equal(board.sources.length, 2);
    assert.deepEqual(board.sources.map((source) => [source.ok, source.httpStatus]), [[false, 404], [true, 200]]);
    assert.equal(board.portraitsFromCdn, false, 'a soccer portrait is never synthesised');
  }, (input) => {
    const url = String(input);
    tried.push(url);
    return url.includes('site.web.api.espn.com')
      ? Response.json(player(233064))
      : new Response('no such player', { status: 404 });
  });
  assert.deepEqual(tried, [
    'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/athletes/233064',
    'https://site.web.api.espn.com/apis/common/v3/sports/soccer/eng.1/athletes/233064',
  ]);

  // Neither answers: the page holds nothing and says so.
  resetAthleteCaches();
  await withFetch(async () => {
    const board = await getAthleteDetail('nba', '3945274');
    assert.equal(board.status, 'unavailable');
    assert.equal(board.athlete, null);
    assert.equal(board.sources.length, 2);
  }, () => Promise.reject(new Error('unreachable')));
  reset();
});

test('a payload about another player is refused, and the second endpoint is tried', async () => {
  reset();
  await withFetch(async () => {
    const board = await getAthleteDetail('nba', '3945274');
    assert.equal(board.status, 'ready');
    assert.equal(board.athlete?.id, '3945274');
    assert.deepEqual(board.sources.map((source) => [source.ok, source.errorKind]), [[false, 'invalid-response'], [true, undefined]]);
  }, (input) => {
    const url = String(input);
    return url.includes('site.web.api.espn.com') ? Response.json(player()) : Response.json(player(3202));
  });
  reset();
});

test('a bad player id never reaches the network, and boards are cached', async () => {
  reset();
  let requests = 0;
  await withFetch(async () => {
    assert.throws(() => getAthleteDetail('not-a-league', '1'), (error: unknown) => error instanceof AthleteInputError && error.httpStatus === 404);
    for (const bad of ['abc', '0042', '', '1'.repeat(21)]) {
      assert.throws(() => getAthleteDetail('nba', bad), (error: unknown) => error instanceof AthleteInputError && error.httpStatus === 400);
    }
    assert.equal(requests, 0);

    const [first, second] = await Promise.all([getAthleteDetail('nba', '3945274'), getAthleteDetail('nba', '3945274')]);
    assert.equal(first, second, 'concurrent renders share one request');
    assert.equal(requests, 1);
    await getAthleteDetail('nba', '3945274');
    assert.equal(requests, 1, 'a cached player costs nothing');
    await getAthleteDetail('nba', '3945274', true);
    assert.equal(requests, 2, 'refresh=1 bypasses the cache');
  }, () => { requests += 1; return Response.json(player()); });
  reset();
});
