import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEspnOdds } from '../../src/lib/espn-odds-feed';
import { BATCH_SIZE, FREE_MATCHES, MAX_MATCHES, ODDS_LEAGUES } from '../../src/lib/espn-odds';
import { oddsEvent } from './odds-fixture';

async function withFetch(respond: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('default odds requests use primary ESPN leagues, share work and cache normalized results', async () => {
  const urls: string[] = [];
  await withFetch(async (input, init) => {
    urls.push(String(input));
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal);
    return Response.json({ events: [oddsEvent(`event-${urls.length}`)] });
  }, async () => {
    const first = getEspnOdds({}, { bypassCache: true });
    const second = getEspnOdds({}, { bypassCache: true });
    assert.equal(first, second);
    const board = await first;
    assert.equal(board.status, 'ready');
    assert.equal(board.matches.length, ODDS_LEAGUES.filter((league) => !league.secondary).length);
    assert.equal(urls.length, board.matches.length);
    assert.ok(urls.every((url) => new URL(url).hostname === 'site.api.espn.com' && !url.includes('?')));
    assert.equal(board.matches.filter((match) => !match.is_premium).length, FREE_MATCHES);
    assert.equal(await getEspnOdds(), board);
    assert.equal(urls.length, board.matches.length);
  });
});
test('global sort, 48-match cap and premium flags apply after aggregation', async () => {
  await withFetch(async (input) => Response.json({ events: Array.from({ length: 12 }, (_, i) => oddsEvent(`${String(input)}-game-${i}`, 12 - i)) }), async () => {
    const board = await getEspnOdds({}, { bypassCache: true });
    assert.equal(board.matches.length, MAX_MATCHES);
    assert.equal(board.matches.filter((match) => !match.is_premium).length, 6);
    assert.ok(board.matches.every((match, i) => !i || match.kickoff >= board.matches[i - 1].kickoff));
    assert.ok(board.matches.slice(6).every((match) => match.is_premium));
  });
});
test('per-league limits stop future-day fetching once each selected league reaches its cap', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return Response.json({ events: [oddsEvent(`${calls}-first`), oddsEvent(`${calls}-second`)] }); }, async () => {
    const board = await getEspnOdds({ sports: ['basketball'], perLeague: 2, days: 10 }, { bypassCache: true });
    const leagues = ODDS_LEAGUES.filter((league) => league.sport === 'basketball');
    assert.equal(calls, leagues.length);
    assert.equal(board.matches.length, leagues.length * 2);
  });
});
test('multi-day searches use date queries, deduplicate repeated events and preserve per-league caps', async () => {
  const urls: string[] = [];
  await withFetch(async (input) => {
    const url = String(input); urls.push(url);
    return Response.json({ events: url.includes('?') ? [oddsEvent('same'), oddsEvent('new')] : [oddsEvent('same')] });
  }, async () => {
    const board = await getEspnOdds({ sports: ['baseball'], perLeague: 2, days: 3 }, { bypassCache: true });
    assert.equal(urls.length, 2);
    assert.match(urls[1], /\?dates=\d{8}&limit=100$/);
    assert.equal(board.matches.length, 2);
    assert.equal(new Set(board.matches.map((match) => match.id)).size, 2);
  });
});
test('sport fan-out is at most 20 concurrent requests', async () => {
  let active = 0, maximum = 0;
  await withFetch(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--; return Response.json({ events: [] });
  }, async () => {
    const board = await getEspnOdds({ sports: ['football'] }, { bypassCache: true });
    assert.equal(board.status, 'empty');
    assert.ok(maximum > 1 && maximum <= BATCH_SIZE);
  });
});
test('partial, successful empty, invalid and failed feeds have distinct reports and never sample prices', async () => {
  await withFetch(async (input) => String(input).includes('soccer/eng.1') ? new Response('', { status: 404 }) : Response.json({ events: [] }), async () => {
    const board = await getEspnOdds({}, { bypassCache: true });
    assert.equal(board.status, 'partial');
    assert.deepEqual(board.matches, []);
    assert.equal(board.sources.find((source) => source.path === 'soccer/eng.1')?.error, 'ESPN HTTP 404');
  });
  for (const body of [{ events: [] }, { error: 'unsupported' }]) {
    await withFetch(async () => Response.json(body), async () => {
      const board = await getEspnOdds({}, { bypassCache: true });
      assert.equal(board.status, 'events' in body ? 'empty' : 'unavailable');
      assert.deepEqual(board.matches, []);
    });
  }
  await withFetch(async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); }, async () => {
    const board = await getEspnOdds({}, { bypassCache: true });
    assert.equal(board.status, 'unavailable');
    assert.ok(board.sources.every((source) => !source.ok && source.error?.includes('ECONNRESET')));
    assert.deepEqual(board.matches, []);
  });
});
test('the total search budget bounds multi-day work and marks incomplete results', async () => {
  const original = Date.now;
  let clock = original();
  let calls = 0;
  Date.now = () => clock;
  try {
    await withFetch(async () => { calls++; clock += 26_000; return Response.json({ events: [] }); }, async () => {
      const board = await getEspnOdds({ sports: ['football'], perLeague: 1, days: 10 }, { bypassCache: true });
      assert.equal(calls, BATCH_SIZE);
      assert.equal(board.truncated, true);
      assert.equal(board.status, 'partial');
    });
  } finally { Date.now = original; }
});

test('stalled odds requests use abort signals and never generate sample results', async () => {
  const timeout = AbortSignal.timeout;
  const budgets: number[] = [];
  AbortSignal.timeout = (milliseconds) => { budgets.push(milliseconds); return timeout(5); };
  try {
    await withFetch(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException('Request timed out', 'TimeoutError'));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener('abort', abort, { once: true });
      // Keep a referenced timer while Node's AbortSignal timeout is unref'd.
      setTimeout(() => reject(new Error('Abort signal was not honored')), 25);
    }), async () => {
      const board = await getEspnOdds({}, { bypassCache: true });
      assert.equal(board.status, 'unavailable');
      assert.deepEqual(board.matches, []);
      assert.ok(budgets.length > 0 && budgets.every((budget) => budget > 0 && budget <= 10_000));
    });
  } finally { AbortSignal.timeout = timeout; }
});


test('the same ESPN event appearing in multiple league feeds is shown only once', async () => {
  await withFetch(async () => Response.json({ events: [oddsEvent('globally-shared')] }), async () => {
    const board = await getEspnOdds({}, { bypassCache: true });
    assert.equal(board.matches.length, 1);
    assert.equal(board.matches[0].id, 'espn-odds:globally-shared');
  });
});

for (const sport of ['football', 'basketball', 'american-football', 'baseball', 'ice-hockey', 'rugby']) {
  test(`${sport} odds report exact today/future scoreboard URLs and true HTTP 404 failures`, async () => {
    await withFetch(async () => new Response('', { status: 404 }), async () => {
      const board = await getEspnOdds({ sports: [sport], perLeague: 1, days: 2 }, { bypassCache: true });
      assert.equal(board.status, 'unavailable');
      assert.deepEqual(board.matches, []);
      const leagues = ODDS_LEAGUES.filter((league) => league.sport === sport);
      assert.equal(board.sources.length, leagues.length * 2);
      assert.ok(board.sources.every((source) => source.httpStatus === 404 && source.errorKind === 'http'));
      for (const source of board.sources) {
        const base = `https://site.api.espn.com/apis/site/v2/sports/${source.path}/scoreboard`;
        assert.equal(source.url, base + (source.date ? `?dates=${source.date}&limit=100` : ''));
      }
    });
  });
}

test('odds propagate HTTP 403 metadata, with no sample prices and no same-request retry', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++; return new Response('test-private-body', { status: 403, headers: {
      server: 'example-proxy', via: '1.1 example-proxy', 'content-type': 'text/plain',
      'x-mitmproxy-blocked-reason': 'OUTBOUND_HOST_DENIED', 'set-cookie': 'test-private-cookie',
    } });
  }, async () => {
    const board = await getEspnOdds({ sports: ['baseball'] }, { bypassCache: true });
    assert.equal(calls, 1);
    assert.equal(board.status, 'unavailable');
    assert.deepEqual(board.matches, []);
    const source = board.sources[0];
    assert.equal(source.httpStatus, 403);
    assert.equal(source.responseMetadata?.server, 'example-proxy');
    assert.equal(source.responseMetadata?.proxyBlockReason, 'OUTBOUND_HOST_DENIED');
    assert.ok(!JSON.stringify(board).includes('test-private'));
  });
});
