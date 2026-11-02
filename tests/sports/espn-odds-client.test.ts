import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshEspnOdds, fetchEspnInsights, SportsRequestError } from '../../src/lib/espn-odds-client';
import { mapOddsEvent, ODDS_LEAGUES } from '../../src/lib/espn-odds';
import { oddsEvent } from './odds-fixture';
import { insightsBoard } from './insights-fixture';

const board = () => ({
  matches: [mapOddsEvent(oddsEvent(), ODDS_LEAGUES.find((league) => league.slug === 'epl')!)!],
  sources: [{ path: 'soccer/eng.1', date: null, ok: true, count: 1 }],
  fetchedAt: new Date().toISOString(), truncated: false, status: 'ready',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('odds reads coalesce canonical parameters and use only the existing same-origin API', async () => {
  const original = globalThis.fetch; const reply = deferred<Response>(); let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, '/api/sports/predictions?refresh=1');
    assert.equal(init?.method, 'POST'); assert.equal(init?.credentials, 'omit');
    assert.equal(new Headers(init?.headers).get('Accept'), 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), { sports: ['basketball', 'football'], perLeague: 2, days: 3 });
    return (await reply.promise).clone();
  };
  try {
    const first = refreshEspnOdds({ sports: ['football', 'basketball'], perLeague: 2, days: 3 });
    const second = refreshEspnOdds({ sports: ['basketball', 'football', 'football'], perLeague: '2', days: 3 });
    assert.equal(calls, 1); reply.resolve(Response.json(board()));
    assert.deepEqual(await first, await second);
    await refreshEspnOdds({ sports: ['football', 'basketball'], perLeague: 2, days: 3 });
    assert.equal(calls, 2); // No settled data cache hiding a manual refresh.
  } finally { globalThis.fetch = original; }
});

test('different filter sets do not share odds reads', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(board()); };
  try {
    await Promise.all([refreshEspnOdds({ sports: ['football'] }), refreshEspnOdds({ sports: ['basketball'] })]);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test('one cancelled subscriber cannot abort another; the last cancelled subscriber releases the shared read', async () => {
  const original = globalThis.fetch; const reply = deferred<Response>(); let sharedSignal: AbortSignal | undefined;
  globalThis.fetch = async (_, init) => { sharedSignal = init?.signal ?? undefined; return (await reply.promise).clone(); };
  try {
    const a = new AbortController(); const b = new AbortController();
    const first = refreshEspnOdds({}, a.signal); const second = refreshEspnOdds({}, b.signal);
    const aborted = assert.rejects(first, { name: 'AbortError' });
    a.abort(); await aborted; assert.equal(sharedSignal?.aborted, false);
    reply.resolve(Response.json(board())); await second;
    const c = new AbortController();
    const cancelled = refreshEspnOdds({}, c.signal);
    const check = assert.rejects(cancelled, { name: 'AbortError' }); c.abort(); await check;
    assert.equal(sharedSignal?.aborted, true);
    await refreshEspnOdds({}); // Retry after cancellation is a new read.
  } finally { globalThis.fetch = original; }
});

test('HTTP failures win over success-shaped bodies and retain the app status for deployment warnings', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [403, 404, 503]) {
      globalThis.fetch = async () => Response.json({ ...board(), success: true }, { status });
      await assert.rejects(refreshEspnOdds({}), (error: unknown) => error instanceof SportsRequestError && error.httpStatus === status);
    }
  } finally { globalThis.fetch = original; }
});

test('invalid JSON, oversized bodies, invalid nested rows and failed reads never become a successful board', async () => {
  const original = globalThis.fetch;
  try {
    const bad = board(); Object.assign(bad.matches[0].odds, { home: { unsafe: true } });
    for (const response of [new Response('<html>upstream</html>'), new Response('x'.repeat(2 * 1024 * 1024 + 1)), Response.json(bad)]) {
      globalThis.fetch = async () => response;
      await assert.rejects(refreshEspnOdds({}));
    }
    globalThis.fetch = async () => { throw new TypeError('network reset'); };
    await assert.rejects(refreshEspnOdds({}), /network reset/);
    globalThis.fetch = async () => Response.json(board());
    assert.equal((await refreshEspnOdds({})).status, 'ready');
  } finally { globalThis.fetch = original; }
});

test('the shared odds deadline rejects even when a transport ignores abort, then allows retry', async (t) => {
  const original = globalThis.fetch; let signal: AbortSignal | undefined;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (_, init) => { signal = init?.signal ?? undefined; return new Promise(() => {}); };
  try {
    const waiting = refreshEspnOdds({}); const check = assert.rejects(waiting, /timed out/);
    t.mock.timers.tick(35_000); await check; assert.equal(signal?.aborted, true);
    globalThis.fetch = async () => Response.json(board());
    assert.equal((await refreshEspnOdds({})).status, 'ready');
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});

test('Core insight reads share matching refs but keep refresh intent and game identity distinct', async () => {
  const original = globalThis.fetch; const reply = deferred<Response>(); let calls = 0;
  globalThis.fetch = async (url) => {
    calls++; assert.match(String(url), /^\/api\/sports\/matches\/epl\/401234567\/insights/);
    return (await reply.promise).clone();
  };
  try {
    const reference = { league: 'epl', eventId: '401234567' };
    const first = fetchEspnInsights(reference); const second = fetchEspnInsights(reference);
    const refresh = fetchEspnInsights(reference, true);
    assert.equal(calls, 2); reply.resolve(Response.json(insightsBoard()));
    const settled = await Promise.allSettled([first, second, refresh]);
    assert.ok(settled.every((result) => result.status === 'fulfilled'));
    assert.throws(() => fetchEspnInsights({ league: 'https://example.test', eventId: '1' }));
  } finally { globalThis.fetch = original; }
});

test('Core insight responses reject foreign-game envelopes and have a 20 second deadline', async (t) => {
  const original = globalThis.fetch;
  const reference = { league: 'epl', eventId: '401234567' };
  try {
    globalThis.fetch = async () => Response.json(insightsBoard('epl', '999'));
    await assert.rejects(fetchEspnInsights(reference), /Invalid sports response/);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    globalThis.fetch = async () => new Promise(() => {});
    const check = assert.rejects(fetchEspnInsights(reference), /timed out/);
    t.mock.timers.tick(20_000); await check;
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});
