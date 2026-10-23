import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/sports/matches/[league]/[eventId]/history/route';
import { getMatchHistory } from '../../src/lib/espn-match-history-feed';
import { summaryFixture } from './match-fixture';
import { scheduleFixture } from './history-fixture';
async function withFetch(respond: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch; globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}
function summary(id: string, season = true) {
  const value = summaryFixture('football', id);
  return { ...value, header: { ...value.header, ...(season ? { season: { year: 2026 } } : {}) } };
}
function responseFor(input: string) {
  const url = new URL(input);
  if (url.pathname.endsWith('/summary')) return Response.json(summary(url.searchParams.get('event')!));
  return Response.json(scheduleFixture(url.pathname.split('/').at(-2)!, Number(url.searchParams.get('season'))));
}
test('history is public, catalog-only, lazy, cached and coalesced; schedules use minimal headers', async () => {
  const urls: string[] = [];
  await withFetch(async (input, init) => {
    urls.push(String(input));
    assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), { accept: 'application/json' });
    assert.equal(init?.cache, 'no-store'); assert.ok(init?.signal);
    return responseFor(String(input));
  }, async () => {
    const one = getMatchHistory('epl', '401234567', true);
    assert.equal(getMatchHistory('epl', '401234567', true), one);
    const board = await one;
    assert.equal(board.status, 'ready'); assert.deepEqual(board.seasonYears, [2026, 2025]);
    assert.equal(board.headToHead.length, 2); assert.equal(board.teams[0].games.length, 2);
    assert.equal(await getMatchHistory('epl', '401234567'), board);
    assert.equal(urls.length, 5); // one shared match summary plus four bounded schedules
    const schedules = urls.filter((url) => url.includes('/schedule'));
    assert.deepEqual(schedules.sort(), ['100', '200'].flatMap((team) => [2026, 2025].map((year) => `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${team}/schedule?season=${year}`)).sort());
    const result = await GET(new NextRequest('https://hyper.test/api/sports/matches/epl/401234567/history'), { params: Promise.resolve({ league: 'epl', eventId: '401234567' }) });
    assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal((await result.json()).headToHead.length, 2);
    await getMatchHistory('epl', '401234567', true); assert.equal(urls.length, 9); // summary cache untouched
  });
});
test('history route validation rejects arbitrary IDs/competitions before any fetch', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return Response.json({}); }, async () => {
    for (const [league, eventId, status] of [['bad', '1', 404], ['f1', '1', 404], ['epl', '../secret', 400], ['epl', '0', 400]] as const) {
      const result = await GET(new NextRequest('https://hyper.test/api/history'), { params: Promise.resolve({ league, eventId }) }); assert.equal(result.status, status);
    }
    assert.equal(calls, 0);
  });
});
test('unknown season, missing kickoff and unsafe team IDs never request schedules', async () => {
  for (const [id, kind] of [['401234568', 'season'], ['401234569', 'date'], ['401234570', 'team']] as const) {
    let calls = 0;
    await withFetch(async () => {
      calls++; const value = summary(id, kind !== 'season');
      if (kind === 'date') value.header.competitions[0].date = 'invalid';
      if (kind === 'team') value.header.competitions[0].competitors[0].team.id = '../secret';
      return Response.json(value);
    }, async () => {
      const board = await getMatchHistory('epl', id, true); assert.equal(board.status, 'unavailable'); assert.deepEqual(board.teams, []); assert.equal(calls, 1);
    });
  }
});
test('one failed season produces partial history with safe source metadata, not fake records', async () => {
  let calls = 0;
  await withFetch(async (input) => {
    calls++; const url = new URL(String(input));
    if (url.pathname.includes('/teams/100/') && url.searchParams.get('season') === '2025') return new Response('private-denial-body', { status: 403, headers: { server: 'edge', 'set-cookie': 'private-cookie' } });
    return responseFor(String(input));
  }, async () => {
    const board = await getMatchHistory('epl', '401234567', true);
    assert.equal(board.status, 'partial'); assert.equal(calls, 4);
    const team = board.teams.find((team) => team.teamId === '100')!;
    assert.equal(team.games.length, 1); assert.equal(team.sources[1].httpStatus, 403); assert.equal(team.sources[1].errorKind, 'http');
    assert.equal(team.sources[1].responseMetadata?.server, 'edge');
    assert.equal(JSON.stringify(board).includes('private-'), false);
  });
});
test('bad schemas and wrong-season/team responses are unavailable rather than empty', async () => {
  for (const payload of [{}, scheduleFixture('999', 2026), scheduleFixture('100', 2024)]) {
    let calls = 0;
    await withFetch(async () => { calls++; return Response.json(payload); }, async () => {
      const board = await getMatchHistory('epl', '401234567', true);
      assert.equal(board.status, 'unavailable'); assert.equal(calls, 4); assert.equal(board.headToHead.length, 0);
      assert.ok(board.teams.every((team) => team.games.length === 0 && team.sources.every((source) => source.errorKind === 'invalid-response')));
    });
  }
});
test('empty successful schedules are honest empty history; network failures do not retry', async () => {
  await withFetch(async (input) => {
    const url = new URL(String(input)); return Response.json(scheduleFixture(url.pathname.split('/').at(-2)!, Number(url.searchParams.get('season')), []));
  }, async () => { const board = await getMatchHistory('epl', '401234567', true); assert.equal(board.status, 'ready'); assert.deepEqual(board.headToHead, []); });
  let calls = 0;
  await withFetch(async () => { calls++; throw new Error('network failed'); }, async () => {
    const board = await getMatchHistory('epl', '401234567', true); assert.equal(calls, 4); assert.equal(board.status, 'unavailable');
    assert.ok(board.teams.every((team) => team.sources.every((source) => source.errorKind === 'network' && source.httpStatus === null)));
  });
});
test('schedule requests share an eight-second deadline and have no retry loop', async () => {
  const original = AbortSignal.timeout; let deadline = 0;
  AbortSignal.timeout = (ms) => { deadline = ms; return original(5); };
  let calls = 0;
  try {
    await withFetch(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      calls++; const abort = () => reject(new DOMException('Timeout', 'TimeoutError'));
      if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true });
      setTimeout(() => reject(new Error('No deadline')), 30);
    }), async () => {
      const board = await getMatchHistory('epl', '401234567', true); assert.equal(calls, 4); assert.equal(deadline, 8000);
      assert.equal(board.status, 'unavailable'); assert.ok(board.teams.every((team) => team.sources.every((source) => source.errorKind === 'timeout')));
    });
  } finally { AbortSignal.timeout = original; }
});
test('two jobs bound upstream schedule concurrency to eight and release capacity', async () => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let active = 0; let max = 0;
  await withFetch(async (input) => {
    if (String(input).includes('/schedule')) { active++; max = Math.max(max, active); await gate; active--; }
    return responseFor(String(input));
  }, async () => {
    const jobs = ['401234571', '401234572'].map((id) => getMatchHistory('epl', id, true));
    await assert.rejects(getMatchHistory('epl', '401234573', true), /busy/);
    const result = await GET(new NextRequest('https://hyper.test/api/history'), { params: Promise.resolve({ league: 'epl', eventId: '401234574' }) }); assert.equal(result.status, 503);
    // Let the two summary jobs finish so all eight schedule calls reach their gate.
    await new Promise((resolve) => setImmediate(resolve)); assert.equal(max, 8);
    release(); assert.ok((await Promise.all(jobs)).every((board) => board.status === 'ready'));
    assert.equal((await getMatchHistory('epl', '401234573', true)).status, 'ready');
  });
});
test('history cache expires ready results at five minutes and incomplete results at fifteen seconds', async () => {
  const original = Date.now; let now = original(); Date.now = () => now;
  let calls = 0; let failing = false;
  try {
    await withFetch(async (input) => { calls++; return failing && String(input).includes('/schedule') ? new Response('', { status: 503 }) : responseFor(String(input)); }, async () => {
      await getMatchHistory('epl', '401234567', true); const initial = calls;
      now += 299_999; await getMatchHistory('epl', '401234567'); assert.equal(calls, initial);
      now++; await getMatchHistory('epl', '401234567'); assert.ok(calls > initial);
      failing = true; await getMatchHistory('epl', '401234567', true); const failed = calls;
      now += 14_999; await getMatchHistory('epl', '401234567'); assert.equal(calls, failed);
      now++; await getMatchHistory('epl', '401234567'); assert.equal(calls, failed + 4);
    });
  } finally { Date.now = original; }
});
