import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/sports/standings/[league]/route';
import { getStandings } from '../../src/lib/espn-standings-feed';
import { standingsFixture } from './standings-fixture';
async function withFetch(respond: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch; globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}
test('standings API is public, no-store, minimal-header, season-scoped, cached and coalesced', async () => {
  let calls = 0;
  await withFetch(async (url, init) => {
    calls++; assert.equal(String(url), 'https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings?season=2026');
    assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), { accept: 'application/json' });
    assert.equal(init?.cache, 'no-store'); assert.ok(init?.signal);
    return Response.json(standingsFixture());
  }, async () => {
    const one = getStandings('epl', '2026', true);
    assert.equal(getStandings('epl', '2026', true), one);
    const board = await one; assert.equal(board.status, 'ready');
    assert.equal(await getStandings('epl', '2026'), board);
    const response = await GET(new NextRequest('https://hyper.test/api/sports/standings/epl?season=2026'), { params: Promise.resolve({ league: 'epl' }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).groups.length, 2); assert.equal(calls, 1);
    await getStandings('epl', '2026', true); assert.equal(calls, 2);
  });
});
test('API rejects unknown competitions, F1 and malformed seasons without provider calls', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return Response.json({}); }, async () => {
    for (const [league, query, status] of [['bad', '', 404], ['f1', '', 404], ['epl', '?season=', 400], ['epl', '?season=26', 400], ['epl', '?season=2026%26x', 400]] as const) {
      const response = await GET(new NextRequest(`https://hyper.test/api/sports/standings/${league}${query}`), { params: Promise.resolve({ league }) });
      assert.equal(response.status, status);
    }
    assert.equal(calls, 0);
  });
});
test('upstream HTTP errors, invalid JSON and season mismatch remain unavailable, not empty', async () => {
  for (const response of [new Response('private-body', { status: 403, headers: { server: 'edge', 'set-cookie': 'private-cookie' } }), new Response('bad JSON'), Response.json({}), Response.json(standingsFixture(2025))]) {
    let calls = 0;
    await withFetch(async () => { calls++; return response; }, async () => {
      const board = await getStandings('epl', '2026', true);
      assert.equal(board.status, 'unavailable'); assert.deepEqual(board.groups, []); assert.equal(calls, 1);
      assert.equal(board.source.errorKind, response.status === 403 ? 'http' : 'invalid-response');
      assert.equal(board.source.httpStatus, response.status);
      assert.equal(JSON.stringify(board).includes('private-'), false);
    });
  }
});
test('valid empty/cup tables are distinct from provider failure; current season is explicit', async () => {
  await withFetch(async (url) => {
    assert.equal(new URL(String(url)).searchParams.has('season'), false);
    return Response.json({ season: { year: 2026 }, children: [] });
  }, async () => {
    const board = await getStandings('epl', undefined, true);
    assert.equal(board.status, 'empty'); assert.equal(board.requestedSeason, null); assert.equal(board.source.ok, true);
  });
});
test('network failures do not retry; request deadline is eight seconds', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); }, async () => {
    const board = await getStandings('epl', '2026', true);
    assert.equal(board.source.errorKind, 'network'); assert.equal(board.source.httpStatus, null); assert.equal(calls, 1);
  });
  const original = AbortSignal.timeout; let deadline = 0;
  AbortSignal.timeout = (ms) => { deadline = ms; return original(5); };
  try {
    await withFetch(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException('Timeout', 'TimeoutError'));
      if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true });
      setTimeout(() => reject(new Error('Missing abort')), 30);
    }), async () => { const board = await getStandings('epl', '2026', true); assert.equal(deadline, 8000); assert.equal(board.source.errorKind, 'timeout'); });
  } finally { AbortSignal.timeout = original; }
});
test('eight distinct standings jobs are bounded; cache keys separate historical seasons', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withFetch(async (url) => { await gate; return Response.json(standingsFixture(Number(new URL(String(url)).searchParams.get('season')))); }, async () => {
    const jobs = Array.from({ length: 8 }, (_, i) => getStandings('epl', String(2000 + i), true));
    await assert.rejects(getStandings('epl', '2008', true), /busy/);
    const response = await GET(new NextRequest('https://hyper.test/api/sports/standings/epl?season=2009'), { params: Promise.resolve({ league: 'epl' }) });
    assert.equal(response.status, 503);
    release(); const boards = await Promise.all(jobs);
    assert.deepEqual(boards.map((b) => b.season?.year), [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007]);
    assert.equal((await getStandings('epl', '2008', true)).status, 'ready');
  });
});
test('table cache expires successes after five minutes and failures after fifteen seconds', async () => {
  const originalNow = Date.now; let now = 1_000_000; Date.now = () => now;
  let calls = 0; let failing = false;
  try {
    await withFetch(async () => { calls++; return failing ? new Response('', { status: 503 }) : Response.json(standingsFixture(2030)); }, async () => {
      await getStandings('epl', '2030', true);
      now += 299_999; await getStandings('epl', '2030'); assert.equal(calls, 1);
      now++; await getStandings('epl', '2030'); assert.equal(calls, 2);
      failing = true; await getStandings('epl', '2030', true); assert.equal(calls, 3);
      now += 14_999; await getStandings('epl', '2030'); assert.equal(calls, 3);
      now++; await getStandings('epl', '2030'); assert.equal(calls, 4);
    });
  } finally { Date.now = originalNow; }
});
test('standings cache evicts older keys rather than growing without bound', async () => {
  let calls = 0;
  await withFetch(async (url) => { calls++; return Response.json(standingsFixture(Number(new URL(String(url)).searchParams.get('season')))); }, async () => {
    for (let year = 1900; year <= 2001; year++) await getStandings('epl', String(year), true);
    assert.equal(calls, 102);
    await getStandings('epl', '2001'); assert.equal(calls, 102);
    await getStandings('epl', '1900'); assert.equal(calls, 103);
  });
});
