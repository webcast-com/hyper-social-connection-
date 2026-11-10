import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserSportsBoard, browserMatchBoard, browserStandingsBoard, prioritizeSportsLeagues, mergeBrowserProgress, sportsDirectBudget, SportsApiError } from '../../src/lib/espn-browser';
import { ESPN_LEAGUES, SPORTS_CORE_LEAGUES } from '../../src/lib/sports-catalog';
import { summaryFixture } from './match-fixture';
import { standingsFixture } from './standings-fixture';

const nba = ESPN_LEAGUES.find(league => league.slug === 'nba')!;
const nfl = ESPN_LEAGUES.find(league => league.slug === 'nfl')!;
const scoreboard = (id: string) => ({ events: [{ id, date: '2026-11-08T18:00:00Z', competitions: [{ competitors: [{homeAway:'home',team:{displayName:'Home'}},{homeAway:'away',team:{displayName:'Away'}}] }] }] });
async function withFetch(mock: typeof fetch, run: () => Promise<void>) {
  const previous = globalThis.fetch; globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = previous; }
}

test('scores use direct ESPN first and do not call server when the browser succeeds', async () => {
  const urls: string[] = [];
  await withFetch(async (input, init) => {
    const url = String(input); urls.push(url); assert.ok(url.startsWith('https://site.api.espn.com/'));
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.referrerPolicy, 'no-referrer');
    return Response.json(scoreboard(url.includes('/nba/') ? '100' : '200'));
  }, async () => {
    const board = await browserSportsBoard(undefined, false, [nba, nfl]);
    assert.equal(board.mode, 'live'); assert.equal(board.events.length, 2);
    assert.ok(board.sources.every(s => s.transport === 'browser'));
    assert.equal(urls.length, 2);
  });
});

test('fallback merges only failed leagues, keeping direct live scores and never adding demo fixtures', async () => {
  const urls: string[] = [];
  const serverEvent = { id: 'espn-nfl-300', source: 'espn', sport: 'american-football', league: 'nfl', leagueName: 'NFL', status: 'final', startAt:'2026-11-08T18:00:00Z', home:{name:'Server home'}, away:{name:'Server away'} };
  await withFetch(async input => {
    const url = String(input); urls.push(url);
    if (url.includes('/nba/')) return Response.json(scoreboard('100'));
    if (url.includes('/nfl/')) throw new TypeError('Failed to fetch');
    if (url === '/api/sports?refresh=1&leagues=nfl') return Response.json({mode:'partial',fetchedAt:'2026-11-08T18:00:00Z',predictions:[],events:[serverEvent, {...serverEvent, id:'demo', source:'demo'}],sources:[{id:'espn:nfl',ok:true,count:1},{id:'espn:nba',ok:true,count:0}]});
    throw Error(url);
  }, async () => {
    const board = await browserSportsBoard(undefined, true, [nba,nfl]);
    assert.equal(board.mode, 'live'); assert.deepEqual(board.events.map(e => e.id).sort(), ['espn-nba-100','espn-nfl-300']);
    assert.equal(board.sources.find(s=>s.id==='espn:nba')?.transport,'browser');
    assert.equal(board.sources.find(s=>s.id==='espn:nfl')?.transport,'server');
    // The server is asked only for the competition the browser could not reach.
    assert.equal(urls.filter(url=>url.startsWith('/api/')).length, 1);
    assert.ok(urls.includes('/api/sports?refresh=1&leagues=nfl'), urls.join(','));
  });
});

test('browser-empty success is not mistaken for a failure, and failed fallbacks do not fabricate games', async () => {
  await withFetch(async input => {
    const url = String(input);
    if (url.includes('/nba/')) return Response.json({events:[]});
    if (url.includes('/nfl/')) return new Response('no', {status:403});
    return new Response('offline', {status:503});
  }, async () => {
    const board = await browserSportsBoard(undefined,false,[nba,nfl]);
    assert.equal(board.mode,'partial'); assert.equal(board.events.length,0);
    assert.equal(board.sources[0].ok,true); assert.equal(board.sources[1].httpStatus,403);
  });
});

test('match details and standings request browser ESPN first and use the shared parsers', async () => {
  const urls: string[] = [];
  await withFetch(async input => {
    const url = String(input); urls.push(url);
    if (url.includes('/summary?')) return Response.json(summaryFixture());
    if (url.includes('/standings?')) return Response.json(standingsFixture());
    throw Error(url);
  }, async () => {
    const match = await browserMatchBoard({league:'epl',eventId:'401234567'});
    assert.equal(match.status,'ready'); assert.equal(match.match?.statistics.length,2);
    const table = await browserStandingsBoard('epl',2026);
    assert.equal(table.status,'ready'); assert.equal(table.groups.length,2);
    assert.ok(urls.every(url=>url.startsWith('https://site.api.espn.com/')));
  });
});

test('match and standings fall back to same-origin APIs after direct failures or malformed payloads', async () => {
  const urls: string[] = [];
  await withFetch(async input => {
    const url = String(input); urls.push(url);
    if (url.startsWith('https://')) return Response.json({bad:'payload'});
    if (url.startsWith('/api/sports/matches/')) return Response.json({status:'unavailable',match:null,source:{ok:false,url:'https://site.api.espn.com/',httpStatus:null}});
    if (url.startsWith('/api/sports/standings/')) return Response.json({league:'epl',requestedSeason:2026,season:null,status:'unavailable',groups:[],fetchedAt:'2026-11-08T18:00:00Z',source:{ok:false,url:'https://site.api.espn.com/',httpStatus:null}});
    throw Error(url);
  }, async () => {
    assert.equal((await browserMatchBoard({league:'epl',eventId:'401234567'},undefined,true)).status,'unavailable');
    assert.equal((await browserStandingsBoard('epl',2026,undefined,true)).status,'unavailable');
    assert.ok(urls.some(url=>url==='/api/sports/matches/epl/401234567?refresh=1'));
    assert.ok(urls.some(url=>url==='/api/sports/standings/epl?season=2026&refresh=1'));
  });
});

test('aborting browser requests cancels work without invoking server fallback', async () => {
  const controller = new AbortController(); const urls: string[] = [];
  await withFetch(async (input, init) => {
    urls.push(String(input)); return new Promise<Response>((_,reject) => {
      if (init?.signal?.aborted) reject(new DOMException('Aborted','AbortError'));
      else init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    });
  }, async () => {
    const pending = browserSportsBoard(controller.signal,false,[nba,nfl]); controller.abort();
    await assert.rejects(pending, {name:'AbortError'}); assert.ok(urls.every(url=>url.startsWith('https://')));
  });
});

test('complete browser and server failure rejects so the UI can retain the previous update', async () => {
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(browserSportsBoard(undefined, false, [nba, nfl]), /unavailable/);
  });
});

test('a missing app scores route is reported as a deployment failure, not an ESPN outage', async () => {
  await withFetch(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/')) return new Response('Not found', { status: 404 });
    throw new TypeError('Failed to fetch');
  }, async () => {
    await assert.rejects(browserSportsBoard(undefined, false, [nba, nfl]), (error: unknown) => {
      assert.ok(error instanceof SportsApiError);
      assert.equal(error.status, 404);
      return true;
    });
  });
});

test('server-reported feed failures keep their status and metadata instead of browser timeouts', async () => {
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes('/nba/')) return Response.json({ events: [] });
    if (url.includes('/nfl/')) return new Response('denied', { status: 403, headers: { server: 'example-edge' } });
    return Response.json({ mode: 'partial', predictions: [], events: [], fetchedAt: '', sources: [
      { id: 'espn:nba', ok: true, count: 0 },
      { id: 'espn:nfl', ok: false, count: 0, httpStatus: 404, errorKind: 'http', url, error: 'ESPN HTTP 404', responseMetadata: { server: 'origin' } },
    ] });
  }, async () => {
    const board = await browserSportsBoard(undefined, false, [nba, nfl]);
    const reported = board.sources.find((source) => source.id === 'espn:nfl')!;
    assert.equal(reported.transport, 'server');
    assert.equal(reported.httpStatus, 404);
    assert.deepEqual(reported.responseMetadata, { server: 'origin' });
    assert.equal(board.mode, 'partial');
  });
});

test('incremental browser results render before the overall board settles', async () => {
  let release!: () => void;
  const stalled = new Promise<void>((resolve) => { release = resolve; });
  const progress: string[][] = [];
  await withFetch(async input => {
    if (String(input).includes('/nfl/')) await stalled;
    return Response.json(scoreboard(String(input).includes('/nba/') ? '100' : '200'));
  }, async () => {
    const pending = browserSportsBoard(undefined, false, [nba, nfl], board => {
      progress.push(board.events.map(event => event.id));
      release();
    });
    const board = await pending;
    assert.deepEqual(progress, [['espn-nba-100']]);
    assert.equal(board.events.length, 2);
  });
});

test('overall browser budget bounds stalled queues and preserves fallback results', async () => {
  let directCalls = 0;
  await withFetch(async (input, init) => {
    if (String(input).startsWith('/api/')) return Response.json({ mode: 'partial', predictions: [], events: [], fetchedAt: '', sources: [] });
    directCalls++;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  }, async () => {
    const board = await browserSportsBoard(undefined, false, ESPN_LEAGUES.slice(0, 12), undefined, 25);
    assert.equal(directCalls, 8);
    assert.equal(board.sources.length, 12);
    assert.ok(board.sources.every(source => !source.ok && source.errorKind === 'timeout'));
    assert.equal(board.mode, 'partial');
  });
});

test('the selected country or league is fetched first without dropping the other competitions', () => {
  for (const [country, league, region] of [['Zambia', 'zambia', 'africa'], ['Canada', 'canada-women', 'americas'], ['Switzerland', 'switzerland', 'europe']] as const) {
    const ordered = prioritizeSportsLeagues(ESPN_LEAGUES, { sport: 'football', country, league, region });
    assert.equal(ordered[0].slug, league);
    assert.equal(ordered.length, ESPN_LEAGUES.length);
    assert.deepEqual(new Set(ordered.map(item => item.slug)), new Set(ESPN_LEAGUES.map(item => item.slug)));
  }
});

test('an unfiltered board requests every competition, headline leagues first', () => {
  const all = { sport: 'all', region: 'all', country: 'all', league: 'all' } as const;
  const ordered = prioritizeSportsLeagues(ESPN_LEAGUES, all);
  // Same competitions, reordered: live, upcoming and final matches from the
  // busiest feeds are on screen while the rest of the catalog is still loading.
  assert.equal(ordered.length, ESPN_LEAGUES.length);
  assert.deepEqual(new Set(ordered.map(item => item.slug)), new Set(ESPN_LEAGUES.map(item => item.slug)));
  assert.deepEqual(ordered.slice(0, SPORTS_CORE_LEAGUES.length).map(item => item.slug), [...SPORTS_CORE_LEAGUES]);
  assert.ok(SPORTS_CORE_LEAGUES.every(slug => ESPN_LEAGUES.some(item => item.slug === slug)));
  assert.ok(sportsDirectBudget(ESPN_LEAGUES.length) > 15_000);
  assert.ok(sportsDirectBudget(2) >= 15_000);
  assert.ok(sportsDirectBudget(ESPN_LEAGUES.length) <= 30_000);
});

test('competitions the budget never reached are reported and covered by the server', async () => {
  const serverUrls: string[] = [];
  let calls = 0;
  await withFetch(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/')) {
      serverUrls.push(url);
      return Response.json({ mode: 'partial', predictions: [], events: [], fetchedAt: '', sources: [] });
    }
    // Only the first wave answers; the rest of the catalog never gets a reply.
    if (++calls <= 8) return Response.json(scoreboard(`1${calls}`));
    return await new Promise<Response>((_resolve, reject) => {
      setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 5_000);
    });
  }, async () => {
    const leagues = ESPN_LEAGUES.slice(0, 12);
    const board = await browserSportsBoard(undefined, false, leagues, undefined, 25);
    assert.equal(board.sources.length, 12);
    assert.equal(board.sources.filter(source => source.ok).length, 8);
    assert.ok(board.sources.slice(8).every(source => !source.ok && source.errorKind === 'timeout'));
    assert.equal(board.events.length, 8);
    // Only the four missing competitions are re-requested, not the whole catalog.
    assert.equal(serverUrls.length, 1);
    assert.equal(new URL(`https://hyper.test${serverUrls[0]}`).searchParams.get('leagues'), leagues.slice(8).map(item => item.slug).join(','));
  });
});

test('a transient ESPN response is retried inside the same browser deadline', async () => {
  let attempts = 0;
  await withFetch(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/')) return Response.json({ mode: 'partial', predictions: [], events: [], fetchedAt: '', sources: [] });
    attempts++;
    if (attempts === 1) return new Response('busy', { status: 429, headers: { 'retry-after': '0' } });
    return Response.json(scoreboard('100'));
  }, async () => {
    const board = await browserSportsBoard(undefined, false, [nba]);
    assert.equal(attempts, 2);
    assert.equal(board.mode, 'live');
    assert.deepEqual(board.events.map(event => event.id), ['espn-nba-100']);
  });
});

test('incremental refresh replaces completed leagues and retains untouched previous scores', async () => {
  await withFetch(async input => Response.json(scoreboard(String(input).includes('/nba/') ? '100' : '200')), async () => {
    const previous = await browserSportsBoard(undefined, false, [nba, nfl]);
    const progress = await browserSportsBoard(undefined, false, [nba]);
    const merged = mergeBrowserProgress(previous, { ...progress, events: [] });
    assert.deepEqual(merged.events.map(event => event.id), ['espn-nfl-200']);
    assert.equal(merged.sources.length, 2);
    assert.equal(merged.mode, 'partial');
    assert.equal(previous.events.length, 2);
    assert.deepEqual(mergeBrowserProgress({ ...previous, mode: 'demo' }, progress).events.map(event => event.id), ['espn-nba-100']);
  });
});
