import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/sports/matches/[league]/[eventId]/route';
import { getMatchDetails } from '../../src/lib/espn-match-feed';
import { summaryFixture } from './match-fixture';

async function withFetch(respond: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch; globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}
test('match requests use minimal headers, eight-second aborts, shared cache and coalescing', async () => {
  let calls = 0;
  await withFetch(async (input, init) => {
    calls++; assert.equal(String(input), 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=401234567');
    assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), { accept: 'application/json' });
    assert.equal(init?.cache, 'no-store'); assert.ok(init?.signal);
    return Response.json(summaryFixture());
  }, async () => {
    const first = getMatchDetails('epl', '401234567', true);
    assert.equal(getMatchDetails('epl', '401234567', true), first);
    const board = await first; assert.equal(board.status, 'ready');
    assert.equal(await getMatchDetails('epl', '401234567'), board);
    assert.equal(calls, 1);
    await getMatchDetails('epl', '401234567', true); assert.equal(calls, 2);
  });
});
test('match API is public, uses no-store and validates routes before any provider request', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return Response.json(summaryFixture()); }, async () => {
    const request = new NextRequest('https://hyper.test/api/sports/matches/epl/401234567?refresh=1');
    const response = await GET(request, { params: Promise.resolve({ league: 'epl', eventId: '401234567' }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await response.json()).match.lineups[0].formation, '4-3-3');
    for (const [league, eventId, expected] of [['bad', '123', 404], ['epl', '../secret', 400]] as const) {
      const invalid = await GET(request, { params: Promise.resolve({ league, eventId }) }); assert.equal(invalid.status, expected);
    }
    assert.equal(calls, 1);
  });
});
test('match 403/404 and connection resets preserve true source status without retries or fake stats', async () => {
  for (const status of [403, 404]) {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response('private-denial-body', { status, headers: { server: 'example-edge', 'set-cookie': 'private-cookie' } }); }, async () => {
      const board = await getMatchDetails('epl', '401234567', true);
      assert.equal(board.status, 'unavailable'); assert.equal(board.match, null);
      assert.equal(board.source.httpStatus, status); assert.equal(board.source.responseMetadata?.server, 'example-edge');
      assert.ok(!JSON.stringify(board).includes('private-')); assert.equal(calls, 1);
    });
  }
  await withFetch(async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); }, async () => {
    const board = await getMatchDetails('epl', '401234567', true);
    assert.equal(board.source.httpStatus, null); assert.equal(board.source.errorKind, 'network');
  });
});
test('invalid summary JSON/schema is distinguished from an empty statistics section', async () => {
  await withFetch(async () => Response.json({ header: { id: 'wrong-event' } }), async () => {
    const board = await getMatchDetails('epl', '401234567', true);
    assert.equal(board.match, null); assert.equal(board.source.errorKind, 'invalid-response'); assert.equal(board.source.httpStatus, 200);
  });
});

test('match requests abort on deadline with no repeated request or fabricated data', async () => {
  const original = AbortSignal.timeout;
  let timeout = 0;
  AbortSignal.timeout = (ms) => { timeout = ms; return original(5); };
  try {
    await withFetch(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'TimeoutError'));
      if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true });
      setTimeout(() => reject(new Error('Missing abort')), 30);
    }), async () => {
      const board = await getMatchDetails('epl', '401234567', true);
      assert.equal(timeout, 8000); assert.equal(board.match, null);
      assert.equal(board.source.errorKind, 'timeout'); assert.equal(board.source.httpStatus, null);
    });
  } finally { AbortSignal.timeout = original; }
});

test('distinct match work is bounded at eight requests and releases slots after completion', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withFetch(async (input) => {
    await gate;
    return Response.json(summaryFixture('football', new URL(String(input)).searchParams.get('event')!));
  }, async () => {
    const requests = Array.from({ length: 8 }, (_, i) => getMatchDetails('epl', String(500000000 + i), true));
    try { await assert.rejects(getMatchDetails('epl', '600000000', true), /busy/); }
    finally { release(); await Promise.all(requests); }
    assert.equal((await getMatchDetails('epl', '600000000', true)).status, 'ready');
  });
});

test('malformed successful responses never leak provider body snippets into diagnostics', async () => {
  await withFetch(async () => new Response('<html>private-response-body</html>', { status: 200 }), async () => {
    const board = await getMatchDetails('epl', '401234567', true);
    assert.equal(board.source.errorKind, 'invalid-response'); assert.equal(board.source.httpStatus, 200);
    assert.ok(!JSON.stringify(board).includes('private-response-body'));
    assert.equal(board.source.error, 'ESPN returned invalid match details');
  });
});
