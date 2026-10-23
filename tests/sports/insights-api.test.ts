import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/sports/matches/[league]/[eventId]/insights/route';
import { getEspnInsights } from '../../src/lib/espn-insights-feed';
import { insightSummary, insightPayload } from './insights-fixture';
import { INSIGHT_KINDS } from '../../src/lib/espn-insights';
async function withFetch(respond: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch; globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}
const context = (eventId = '401234567', league = 'epl') => ({ params: Promise.resolve({ league, eventId }) });
const request = () => new NextRequest('https://hyper.test/api/sports/matches/epl/401234567/insights');
function respond(input: string) {
  const url = new URL(input);
  return url.pathname.endsWith('/summary') ? Response.json(insightSummary(url.searchParams.get('event')!)) : Response.json(insightPayload(url.pathname.split('/').at(-1)!, url.searchParams.get('eventId') ?? url.pathname.split('/events/')[1]?.split('/')[0]));
}
test('insights route is public/no-store, calls five sources only on request, caches and coalesces', async () => {
  const urls: string[] = [];
  await withFetch(async (input, init) => {
    urls.push(String(input)); assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), { accept: 'application/json' });
    assert.equal(init?.cache, 'no-store'); assert.ok(init?.signal);
    if (String(input).startsWith('https://sports.core.')) assert.equal(init?.redirect, 'error');
    return respond(String(input));
  }, async () => {
    const one = getEspnInsights('epl', '401234567', true); assert.equal(getEspnInsights('epl', '401234567', true), one);
    const board = await one; assert.equal(board.status, 'ready'); assert.equal(urls.length, 6); assert.equal(board.sections.length, 5);
    assert.equal(await getEspnInsights('epl', '401234567'), board);
    const response = await GET(request(), context()); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal((await response.json()).sections.length, 5);
    assert.equal(urls.length, 6);
    await getEspnInsights('epl', '401234567', true); assert.equal(urls.length, 11);
  });
});
test('route input is catalog-only and does not permit arbitrary IDs or motorsport home/away projections', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return Response.json({}); }, async () => {
    for (const [league, id, expected] of [['bad', '1', 404], ['f1', '1', 404], ['epl', '../bad', 400], ['epl', '0', 400]] as const) assert.equal((await GET(request(), context(id, league))).status, expected);
    assert.equal(calls, 0);
  });
});
test('HTTP denial/404 retain real source status and safe metadata, without retries or private bodies', async () => {
  for (const status of [403, 404]) {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response('private-body', { status, headers: { server: 'edge', 'set-cookie': 'private-cookie' } }); }, async () => {
      const board = await getEspnInsights('epl', '401234567', true);
      assert.equal(calls, 5); assert.equal(board.status, 'unavailable');
      for (const source of board.sections) { assert.equal(source.httpStatus, status); assert.equal(source.errorKind, 'http'); assert.equal(source.responseMetadata?.server, 'edge'); assert.deepEqual(source.values, []); }
      assert.equal(JSON.stringify(board).includes('private-'), false);
    });
  }
});
test('a failed source is independent; unknown/reference-only schemas stay unsupported', async () => {
  await withFetch(async (input) => String(input).includes('/powerindex') ? new Response('', { status: 503 }) : respond(String(input)), async () => {
    const board = await getEspnInsights('epl', '401234567', true); assert.equal(board.status, 'partial'); assert.equal(board.sections.filter((s) => s.status === 'ready').length, 4);
  });
  let calls = 0;
  await withFetch(async () => { calls++; return Response.json({ items: [{ $ref: 'https://attacker.test/secret' }] }); }, async () => {
    const board = await getEspnInsights('epl', '401234567', true); assert.equal(calls, 5); assert.ok(board.sections.every((s) => s.status === 'unsupported'));
  });
});
test('invalid JSON, identity mismatch, oversize bodies and network failures do not fabricate data', async () => {
  for (const reply of [() => new Response('not JSON'), () => Response.json({ eventId: 'wrong' }), () => new Response('x'.repeat(2 * 1024 * 1024 + 1))]) {
    await withFetch(async () => reply(), async () => {
      const board = await getEspnInsights('epl', '401234567', true); assert.equal(board.status, 'unavailable'); assert.ok(board.sections.every((s) => s.errorKind === 'invalid-response' && s.httpStatus === 200));
    });
  }
  let calls = 0;
  await withFetch(async () => { calls++; throw new Error('network failure'); }, async () => {
    const board = await getEspnInsights('epl', '401234567', true); assert.equal(calls, 5); assert.ok(board.sections.every((s) => s.errorKind === 'network' && s.httpStatus === null));
  });
});
test('a missing competition ID requests league predictions only and never substitutes the event ID', async () => {
  const id = '401234568'; const urls: string[] = [];
  await withFetch(async (input) => {
    const url = String(input); urls.push(url);
    if (url.includes('/summary')) { const value = insightSummary(id); const { id: _competitionId, ...competition } = value.header.competitions[0]; return Response.json({ ...value, header: { ...value.header, competitions: [competition] } }); }
    return respond(url);
  }, async () => {
    const board = await getEspnInsights('epl', id, true); assert.equal(urls.length, 2); assert.equal(board.status, 'partial'); assert.equal(board.sections[0].status, 'ready');
    assert.ok(board.sections.slice(1).every((s) => s.status === 'skipped' && s.url === null));
  });
});
test('unavailable summary prevents all five endpoint requests', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return new Response('', { status: 403 }); }, async () => {
    const board = await getEspnInsights('epl', '401234569', true); assert.equal(calls, 1); assert.ok(board.sections.every((s) => s.status === 'skipped'));
  });
});
test('all Core calls share one eight-second deadline, with no retries', async () => {
  const original = AbortSignal.timeout; let timeout = 0; let calls = 0;
  AbortSignal.timeout = (ms) => { timeout = ms; return original(5); };
  try {
    await withFetch(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      calls++; const abort = () => reject(new DOMException('Timeout', 'TimeoutError'));
      if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true });
      setTimeout(() => reject(new Error('Missing abort')), 30);
    }), async () => {
      const board = await getEspnInsights('epl', '401234567', true); assert.equal(timeout, 8000); assert.equal(calls, 5); assert.ok(board.sections.every((s) => s.errorKind === 'timeout'));
    });
  } finally { AbortSignal.timeout = original; }
});
test('two distinct jobs bound Core concurrency to ten and return retryable 503 when busy', async () => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let active = 0; let maximum = 0;
  await withFetch(async (input) => {
    if (String(input).startsWith('https://sports.core.')) { active++; maximum = Math.max(maximum, active); await gate; active--; }
    return respond(String(input));
  }, async () => {
    const jobs = ['401234570', '401234571'].map((id) => getEspnInsights('epl', id, true));
    await assert.rejects(getEspnInsights('epl', '401234572', true), /busy/);
    assert.equal((await GET(request(), context('401234573'))).status, 503);
    await new Promise((resolve) => setImmediate(resolve)); assert.equal(maximum, 10);
    release(); assert.ok((await Promise.all(jobs)).every((b) => b.sections.length === INSIGHT_KINDS.length));
    assert.equal((await getEspnInsights('epl', '401234572', true)).status, 'ready');
  });
});
test('ready cache expires after one minute; unavailable cache expires after fifteen seconds', async () => {
  const original = Date.now; let now = original(); Date.now = () => now; let calls = 0; let failing = false;
  try {
    await withFetch(async (input) => {
      if (String(input).startsWith('https://sports.core.')) { calls++; if (failing) return new Response('', { status: 503 }); }
      return respond(String(input));
    }, async () => {
      await getEspnInsights('epl', '401234567', true); const initial = calls;
      now += 59_999; await getEspnInsights('epl', '401234567'); assert.equal(calls, initial);
      now++; await getEspnInsights('epl', '401234567'); assert.equal(calls, initial + 5);
      failing = true; await getEspnInsights('epl', '401234567', true); const failed = calls;
      now += 14_999; await getEspnInsights('epl', '401234567'); assert.equal(calls, failed);
      now++; await getEspnInsights('epl', '401234567'); assert.equal(calls, failed + 5);
    });
  } finally { Date.now = original; }
});
