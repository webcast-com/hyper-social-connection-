import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchEspnEvents, espnScoreboardUrl } from '../../src/lib/espn-client';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';

const league = ESPN_LEAGUES.find((item) => item.slug === 'epl')!;
async function withFetch(respond: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('ESPN transport uses the configured HTTPS scoreboard, JSON headers and no-store', async () => {
  await withFetch(async (input, init) => {
    assert.equal(String(input), 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard');
    // Only the JSON Accept header is supplied by the app. fetch keeps its
    // genuine runtime identity; no browser/cookie/origin impersonation.
    assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), { accept: 'application/json' });
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal);
    return Response.json({ events: [] });
  }, async () => {
    assert.match(espnScoreboardUrl(league), /^https:\/\/site\.api\.espn\.com\//);
    assert.deepEqual(await fetchEspnEvents(league), []);
  });
});

for (const status of [429, 500, 502, 503, 504]) {
  test(`ESPN HTTP ${status} retries once and recovers`, async () => {
    let calls = 0;
    await withFetch(async () => ++calls === 1 ? new Response('', { status }) : Response.json({ events: [] }), async () => {
      assert.deepEqual(await fetchEspnEvents(league, { retryDelayMs: 0 }), []);
      assert.equal(calls, 2);
    });
  });
}

test('ESPN retries connection resets once and includes the network cause on failure', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++;
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' }) });
  }, async () => {
    await assert.rejects(fetchEspnEvents(league, { retryDelayMs: 0 }), /fetch failed: ECONNRESET/);
    assert.equal(calls, 2);
  });
});

for (const status of [400, 401, 403, 404]) {
  test(`ESPN HTTP ${status} is not retried or presented as an empty successful feed`, async () => {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response('', { status }); }, async () => {
      await assert.rejects(fetchEspnEvents(league), new RegExp(`ESPN HTTP ${status}`));
      assert.equal(calls, 1);
    });
  });
}

test('ESPN malformed JSON/schema errors are not retried', async () => {
  for (const response of [new Response('invalid json'), Response.json({ error: 'unsupported' })]) {
    let calls = 0;
    await withFetch(async () => { calls++; return response; }, async () => {
      await assert.rejects(fetchEspnEvents(league));
      assert.equal(calls, 1);
    });
  }
});

test('Retry-After longer than the shared deadline does not cause an early retry', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '60' } }); }, async () => {
    await assert.rejects(fetchEspnEvents(league), /ESPN HTTP 429/);
    assert.equal(calls, 1);
  });
});

test('a stalled ESPN request aborts at the overall deadline without starting another attempt', async () => {
  let calls = 0;
  await withFetch(async (_input, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  }, async () => {
    await assert.rejects(fetchEspnEvents(league, { timeoutMs: 20 }), /timed out after 20ms/);
    assert.equal(calls, 1);
  });
});

test('a retry shares the first attempt’s abort signal and deadline', async () => {
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  await withFetch(async (_input, init) => {
    calls++;
    if (calls === 1) { signal = init?.signal; return new Response('', { status: 503 }); }
    assert.equal(init?.signal, signal);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  }, async () => {
    await assert.rejects(fetchEspnEvents(league, { timeoutMs: 50, retryDelayMs: 0 }), /timed out after 50ms/);
    assert.equal(calls, 2);
  });
});

test('HTTP 403 keeps safe denial metadata without reading/exposing HTML or retrying', async () => {
  const { espnFailureDetails, espnScoreboardUrl } = await import('../../src/lib/espn-endpoints');
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return new Response('<html>test-private-body</html>', { status: 403, headers: {
      server: 'example-edge', 'content-type': 'text/html', 'set-cookie': 'test-private-cookie',
      'x-mitmproxy-blocked-reason': 'OUTBOUND_HOST_DENIED',
    } });
  }, async () => {
    await assert.rejects(fetchEspnEvents(league), (error: unknown) => {
      const source = espnFailureDetails(error, espnScoreboardUrl(league));
      assert.equal(source.httpStatus, 403);
      assert.equal(source.errorKind, 'http');
      assert.equal(source.responseMetadata?.server, 'example-edge');
      assert.equal(source.responseMetadata?.proxyBlockReason, 'OUTBOUND_HOST_DENIED');
      assert.ok(!JSON.stringify(source).includes('test-private'));
      return true;
    });
    assert.equal(calls, 1);
  });
});
