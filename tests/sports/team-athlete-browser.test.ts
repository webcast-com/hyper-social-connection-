import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserAthleteBoard, browserTeamBoard, SportsApiError } from '../../src/lib/espn-browser';
import { AthleteInputError, type AthleteBoard } from '../../src/lib/espn-athlete';
import { TeamInputError, type TeamBoard } from '../../src/lib/espn-team';

/**
 * The browser-first transport behind the team and player pages.
 *
 * The rule is the one the scoreboard and match transports already follow: the
 * reader's own browser asks ESPN first, and only what it could not reach is
 * asked of this site's server. A part ESPN answered in the browser is never
 * replaced, a part neither route answered is never filled in, and every source
 * says which route produced it — because the ESPN URL is identical either way.
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

const TEAM = { league: 'epl', teamId: '359' };
const PLAYER = { league: 'nba', athleteId: '3945274' };

const TEAM_URLS = [
  'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359',
  'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/schedule',
  'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/roster',
];
const PLAYER_URLS = [
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/3945274',
  'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3945274',
];

const info = (name = 'Arsenal', id = 359) => ({ team: { id, displayName: name, abbreviation: 'ARS', record: { items: [{ type: 'total', summary: '12-3-2' }] } } });
const schedule = () => ({ team: { id: 359 }, events: [{ id: 704123, date: '2026-11-08T17:30:00Z', competitions: [{ date: '2026-11-08T17:30:00Z', status: { type: { state: 'post', detail: 'Full Time' } }, competitors: [{ homeAway: 'home', winner: true, score: '2', team: { id: 359, displayName: 'Arsenal' } }, { homeAway: 'away', winner: false, score: '1', team: { id: 364, displayName: 'Chelsea' } }] }] }] });
const roster = (name = 'Bukayo Saka') => ({ team: { id: 359 }, roster: [{ athlete: { id: 233064, displayName: name, jersey: '7', position: { abbreviation: 'FW' } } }] });
const player = () => ({ athlete: { id: 3945274, displayName: 'Luka Dončić', position: { abbreviation: 'PG' } } });

const partOf = (url: string) => url.endsWith('/schedule') ? 'schedule' : url.endsWith('/roster') ? 'roster' : url.includes('/athletes/') ? 'athlete' : 'info';

/** ESPN answers every part; this site's endpoint is never asked. */
function espnOnly(respond?: (url: string) => Response | undefined) {
  return (input: any) => {
    const url = String(input);
    assert.ok(url.startsWith('https://'), `only ESPN is asked, got ${url}`);
    const custom = respond?.(url);
    if (custom) return custom;
    const part = partOf(url);
    return Response.json(part === 'schedule' ? schedule() : part === 'roster' ? roster() : part === 'athlete' ? player() : info());
  };
}

/** A server board, in the shape `/api/sports/teams/...` answers with. */
function serverTeamBoard(over: Partial<TeamBoard> = {}): TeamBoard {
  return {
    reference: TEAM,
    leagueName: 'Premier League',
    sport: 'football',
    portraitsFromCdn: false,
    team: { id: '359', name: 'Arsenal (server)', shortName: null, location: null, abbreviation: 'ARS', slug: null, logo: null, colours: { primary: null, secondary: null }, record: '9-9-9', standing: null, venue: null, active: null, links: [] },
    fixtures: [],
    roster: [],
    status: 'ready',
    fetchedAt: new Date().toISOString(),
    sources: [
      { ok: true, part: 'info', url: TEAM_URLS[0], httpStatus: 200 },
      { ok: true, part: 'schedule', url: TEAM_URLS[1], httpStatus: 200 },
      { ok: true, part: 'roster', url: TEAM_URLS[2], httpStatus: 200 },
    ],
    ...over,
  };
}

function serverAthleteBoard(over: Partial<AthleteBoard> = {}): AthleteBoard {
  return {
    reference: PLAYER,
    leagueName: 'NBA',
    sport: 'basketball',
    portraitsFromCdn: true,
    athlete: { id: '3945274', name: 'Luka Dončić (server)', shortName: null, headshot: null, position: null, jersey: null, age: null, born: null, height: null, weight: null, college: null, nationality: null, experience: null, statusText: null, active: null, team: null, statGroups: [], links: [] },
    status: 'ready',
    fetchedAt: new Date().toISOString(),
    sources: [{ ok: true, url: PLAYER_URLS[0], httpStatus: 200 }],
    ...over,
  };
}

test('a browser that reaches ESPN asks it for all three parts and never the server', async () => {
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await browserTeamBoard(TEAM);
    assert.equal(board.status, 'ready');
    assert.equal(board.team?.name, 'Arsenal');
    assert.equal(board.fixtures.length, 1);
    assert.equal(board.roster.length, 1);
    assert.equal(board.portraitsFromCdn, false, 'soccer portraits are never synthesised');
    assert.deepEqual(board.sources.map((source) => [source.part, source.ok, source.transport]), [
      ['info', true, 'browser'], ['schedule', true, 'browser'], ['roster', true, 'browser'],
    ]);
    assert.deepEqual(board.reference, TEAM);
  }, (input) => { urls.push(String(input)); return espnOnly()(input); });
  assert.deepEqual(urls.sort(), [...TEAM_URLS].sort(), 'three ESPN requests and nothing else');
});

test('a part the browser could not reach is asked of the server, and only that part', async () => {
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await browserTeamBoard(TEAM);
    assert.equal(board.status, 'ready', 'the server finished what the browser started');
    // The two parts ESPN answered in the browser are the browser's own, even
    // though the server also had an answer for them.
    assert.equal(board.team?.name, 'Arsenal', 'a part the browser reached is never replaced');
    assert.equal(board.fixtures.length, 1);
    const byPart = new Map(board.sources.map((source) => [source.part, source]));
    assert.equal(byPart.get('info')!.transport, 'browser');
    assert.equal(byPart.get('schedule')!.transport, 'browser');
    assert.deepEqual(byPart.get('roster'), { ok: true, part: 'roster', url: TEAM_URLS[2], httpStatus: 200, transport: 'server' },
      'the refused part carries the server\u2019s own report');
    assert.deepEqual(board.roster.map((person) => person.name), ['Reported By The Server']);
  }, (input) => {
    const url = String(input);
    urls.push(url);
    if (url === TEAM_URLS[2]) return new Response('denied', { status: 403 });
    if (url.startsWith('/api/')) {
      const served = serverTeamBoard();
      return Response.json({ ...served, roster: [{ id: '1', name: 'Reported By The Server', position: null, jersey: null, headshot: null, height: null, weight: null, age: null, experience: null, nationality: null, born: null }] });
    }
    return espnOnly()(input);
  });
  assert.deepEqual(urls.filter((url) => url.startsWith('/api/')), ['/api/sports/teams/epl/359'], 'one server call, for the parts that failed');
});

test('a refresh asks the server to bypass its cache', async () => {
  const urls: string[] = [];
  await withFetch(async () => {
    await browserTeamBoard(TEAM, undefined, true);
  }, (input) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith('/api/')) return Response.json(serverTeamBoard());
    return new Response('denied', { status: 403 });
  });
  assert.deepEqual(urls.filter((url) => url.startsWith('/api/')), ['/api/sports/teams/epl/359?refresh=1']);
});

test('when neither route reaches a team, the server\u2019s explanation is the one shown', async () => {
  await withFetch(async () => {
    const board = await browserTeamBoard(TEAM);
    assert.equal(board.status, 'unavailable');
    assert.equal(board.team, null, 'nothing is invented for a team neither route reached');
    assert.deepEqual(board.fixtures, []);
    assert.deepEqual(board.roster, []);
    assert.deepEqual(board.sources.map((source) => [source.part, source.ok, source.transport, source.error]), [
      ['info', false, 'server', 'fetch failed: ECONNRESET'],
      ['schedule', false, 'server', 'fetch failed: ECONNRESET'],
      ['roster', false, 'server', 'fetch failed: ECONNRESET'],
    ], 'the server explains the same endpoints, so its reasons are kept');
  }, (input) => {
    const url = String(input);
    if (url.startsWith('/api/')) {
      return Response.json(serverTeamBoard({
        team: null, status: 'unavailable',
        sources: TEAM_URLS.map((source, index) => ({ ok: false, part: (['info', 'schedule', 'roster'] as const)[index], url: source, httpStatus: null, errorKind: 'network', error: 'fetch failed: ECONNRESET' })),
      }));
    }
    return new Response('denied', { status: 403 });
  });
});

test('a broken server route with nothing from the browser is a deployment problem', async () => {
  await withFetch(async () => {
    await assert.rejects(() => browserTeamBoard(TEAM), (error: unknown) => error instanceof SportsApiError && error.status === 404);
  }, (input) => String(input).startsWith('/api/') ? new Response('missing', { status: 404 }) : new Response('denied', { status: 403 }));

  // With something from the browser, the same broken route is not thrown: the
  // page keeps the parts ESPN did answer and reports the rest as refused.
  await withFetch(async () => {
    const board = await browserTeamBoard(TEAM);
    assert.equal(board.status, 'partial');
    assert.equal(board.team?.name, 'Arsenal');
    assert.deepEqual(board.sources.map((source) => [source.part, source.ok, source.transport]), [
      ['info', true, 'browser'], ['schedule', false, 'browser'], ['roster', false, 'browser'],
    ]);
  }, (input) => {
    const url = String(input);
    if (url.startsWith('/api/')) return new Response('missing', { status: 404 });
    return url === TEAM_URLS[0] ? Response.json(info()) : new Response('denied', { status: 403 });
  });
});

test('a payload about another team is refused in the browser and asked of the server', async () => {
  await withFetch(async () => {
    const board = await browserTeamBoard(TEAM);
    assert.equal(board.team?.name, 'Arsenal (server)', 'Chelsea\u2019s payload is not rendered under Arsenal\u2019s name');
    const identity = board.sources.find((source) => source.part === 'info')!;
    assert.equal(identity.ok, true);
    assert.equal(identity.transport, 'server');
  }, (input) => {
    const url = String(input);
    if (url.startsWith('/api/')) return Response.json(serverTeamBoard());
    return url === TEAM_URLS[0] ? Response.json(info('Chelsea', 364)) : new Response('denied', { status: 403 });
  });
});

test('a cancelled page does not turn cancellation into an unavailable board', async () => {
  const urls: string[] = [];
  const controller = new AbortController();
  controller.abort();
  await withFetch(async () => {
    // A cancellation is thrown, never reported as "ESPN did not answer": the
    // reader left, so there is no board to render and no fallback to run.
    await assert.rejects(() => browserTeamBoard(TEAM, controller.signal), (error: unknown) => error instanceof Error && error.name === 'AbortError');
    await assert.rejects(() => browserAthleteBoard(PLAYER, controller.signal), (error: unknown) => error instanceof Error && error.name === 'AbortError');
  }, (input, init) => {
    const url = String(input);
    urls.push(url);
    // As a real fetch does: an aborted signal rejects instead of answering.
    if (init?.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return url.startsWith('/api/') ? Response.json(serverTeamBoard()) : Response.json(info());
  });
  assert.deepEqual(urls.filter((url) => url.startsWith('/api/')), [], 'a cancelled page runs no server fallback');
  assert.deepEqual(urls.filter((url) => url.includes('/athletes/')), [], 'a cancelled player page asks nothing at all');
});

test('a bad competition or team id never reaches the network', async () => {
  const urls: string[] = [];
  await withFetch(async () => {
    await assert.rejects(() => browserTeamBoard({ league: 'not-a-league', teamId: '359' }), (error: unknown) => error instanceof TeamInputError && error.httpStatus === 404);
    for (const bad of ['abc', '0359', '', '1'.repeat(21)]) {
      await assert.rejects(() => browserTeamBoard({ league: 'epl', teamId: bad }), (error: unknown) => error instanceof TeamInputError && error.httpStatus === 400);
    }
  }, (input) => { urls.push(String(input)); return Response.json(info()); });
  assert.deepEqual(urls, []);
});

test('a player answered by the site endpoint costs one request', async () => {
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await browserAthleteBoard(PLAYER);
    assert.equal(board.status, 'ready');
    assert.equal(board.athlete?.name, 'Luka Dončić');
    assert.equal(board.portraitsFromCdn, true, 'an NBA portrait may come from ESPN\u2019s headshot CDN');
    assert.deepEqual(board.sources.map((source) => [source.ok, source.transport]), [[true, 'browser']]);
    assert.deepEqual(board.reference, PLAYER);
  }, (input) => { urls.push(String(input)); return espnOnly()(input); });
  assert.deepEqual(urls, [PLAYER_URLS[0]], 'the common endpoint is only tried when it must be');
});

test('a player the site endpoint refuses is asked of the common endpoint', async () => {
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await browserAthleteBoard(PLAYER);
    assert.equal(board.status, 'ready');
    assert.equal(board.athlete?.name, 'Luka Dončić');
    assert.deepEqual(board.sources.map((source) => [source.url, source.ok, source.httpStatus, source.transport]), [
      [PLAYER_URLS[0], false, 403, 'browser'],
      [PLAYER_URLS[1], true, 200, 'browser'],
    ], 'both attempts are reported, in order');
  }, (input) => {
    const url = String(input);
    urls.push(url);
    return url === PLAYER_URLS[0] ? new Response('denied', { status: 403 }) : Response.json(player());
  });
  assert.deepEqual(urls, PLAYER_URLS);
});

test('a player neither endpoint answered is asked of the server, and labelled with that route', async () => {
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await browserAthleteBoard(PLAYER);
    assert.equal(board.status, 'ready');
    assert.equal(board.athlete?.name, 'Luka Dončić (server)');
    assert.deepEqual(board.sources.map((source) => [source.ok, source.transport]), [[true, 'server']]);
  }, (input) => {
    const url = String(input);
    urls.push(url);
    return url.startsWith('/api/') ? Response.json(serverAthleteBoard()) : new Response('denied', { status: 403 });
  });
  assert.deepEqual(urls, [...PLAYER_URLS, '/api/sports/athletes/nba/3945274'], 'both endpoints in the browser, then the server once');
});

test('a player nobody reached is unavailable, with the server\u2019s reasons where it has them', async () => {
  await withFetch(async () => {
    const board = await browserAthleteBoard(PLAYER);
    assert.equal(board.status, 'unavailable');
    assert.equal(board.athlete, null, 'no sample biography is substituted');
    assert.deepEqual(board.sources.map((source) => [source.url, source.ok, source.transport, source.error]), [
      [PLAYER_URLS[0], false, 'server', 'fetch failed: ECONNRESET'],
      [PLAYER_URLS[1], false, 'browser', 'ESPN HTTP 403'],
    ], 'matched by URL, not by position: the server only reported the first endpoint');
  }, (input) => {
    const url = String(input);
    if (url.startsWith('/api/')) {
      return Response.json(serverAthleteBoard({
        athlete: null, status: 'unavailable',
        sources: [{ ok: false, url: PLAYER_URLS[0], httpStatus: null, errorKind: 'network', error: 'fetch failed: ECONNRESET' }],
      }));
    }
    return new Response('denied', { status: 403 });
  });

  // A broken server route is thrown rather than reported as an ESPN outage.
  await withFetch(async () => {
    await assert.rejects(() => browserAthleteBoard(PLAYER), (error: unknown) => error instanceof SportsApiError && error.status === 500);
  }, (input) => String(input).startsWith('/api/') ? new Response('broken', { status: 500 }) : new Response('denied', { status: 403 }));
});

test('a player page validates what the server sent before rendering it', async () => {
  await withFetch(async () => {
    const board = await browserAthleteBoard(PLAYER);
    assert.equal(board.status, 'unavailable', 'a board about another player is not this player');
    assert.equal(board.athlete, null);
    assert.deepEqual(board.sources.map((source) => [source.ok, source.transport]), [[false, 'browser'], [false, 'browser']],
      'the invalid server response is dropped, and the browser\u2019s own attempts are reported');
  }, (input) => {
    const url = String(input);
    if (url.startsWith('/api/')) return Response.json(serverAthleteBoard({ athlete: { ...serverAthleteBoard().athlete!, id: '1' } }));
    return new Response('denied', { status: 403 });
  });
});

test('a bad competition or player id never reaches the network', async () => {
  const urls: string[] = [];
  await withFetch(async () => {
    await assert.rejects(() => browserAthleteBoard({ league: 'not-a-league', athleteId: '1' }), (error: unknown) => error instanceof AthleteInputError && error.httpStatus === 404);
    for (const bad of ['abc', '0042', '', '1'.repeat(21)]) {
      await assert.rejects(() => browserAthleteBoard({ league: 'nba', athleteId: bad }), (error: unknown) => error instanceof AthleteInputError && error.httpStatus === 400);
    }
  }, (input) => { urls.push(String(input)); return Response.json(player()); });
  assert.deepEqual(urls, []);
});
