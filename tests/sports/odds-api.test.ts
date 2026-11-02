import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET, POST } from '../../src/app/api/sports/predictions/route';
import { isOddsBoard } from '../../src/lib/espn-odds';
import { oddsEvent } from './odds-fixture';

test('odds GET and POST return normalized matches through the app API, with no-store responses', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ events: [oddsEvent()] });
  try {
    const response = await GET(new NextRequest('https://hyper.test/api/sports/predictions?refresh=1'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const board = await response.json();
    assert.ok(board.matches.length > 0);
    assert.equal(board.matches[0].odds.home, 1.8);
    const filtered = await POST(new NextRequest('https://hyper.test/api/sports/predictions?refresh=1', {
      method: 'POST', body: JSON.stringify({ sports: ['baseball'], perLeague: 1, days: 2 }),
    }));
    assert.equal((await filtered.json()).matches.length, 1);
  } finally { globalThis.fetch = original; }
});
test('invalid JSON and unsupported sports return 400 without making upstream requests', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected request'); };
  try {
    for (const body of ['{', JSON.stringify({ sports: ['invalid'] }), JSON.stringify({ perLeague: 'abc' })]) {
      const response = await POST(new NextRequest('https://hyper.test/api/sports/predictions', { method: 'POST', body }));
      assert.equal(response.status, 400);
      assert.deepEqual((await response.json()).matches, []);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('odds API serializes safe HTTP 403 source metadata, not raw denial content', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('test-private-body', { status: 403, headers: { server: 'example-edge', 'set-cookie': 'test-private-cookie' } });
  try {
    const response = await POST(new NextRequest('https://hyper.test/api/sports/predictions?refresh=1', {
      method: 'POST', body: JSON.stringify({ sports: ['baseball'] }),
    }));
    assert.equal(response.status, 200);
    const board = await response.json();
    assert.equal(board.status, 'unavailable');
    assert.equal(board.sources[0].httpStatus, 403);
    assert.equal(board.sources[0].responseMetadata.server, 'example-edge');
    assert.ok(!JSON.stringify(board).includes('test-private'));
  } finally { globalThis.fetch = original; }
});

test('odds API preserves isolated markets and enriched prices in a browser-valid board', async () => {
  const original = globalThis.fetch;
  const markets = [{ drawOdds: 250 }, { spread: 0 }, { overOdds: -125 }];
  globalThis.fetch = async () => Response.json({ events: markets.map((odds, i) => {
    const event = oddsEvent(String(101 + i));
    return { ...event, competitions: [{ ...event.competitions[0], odds: [{ ...odds, provider: { id: 37 } }] }] };
  }) });
  try {
    const response = await POST(new NextRequest('https://hyper.test/api/sports/predictions?refresh=1', {
      method: 'POST', body: JSON.stringify({ sports: ['baseball'], perLeague: 3, days: 1 }),
    }));
    assert.equal(response.status, 200);
    const board = await response.json();
    assert.equal(isOddsBoard(board), true);
    assert.equal(board.matches.length, 3);
    assert.equal(board.matches[0].odds.draw, 3.5);
    assert.equal(board.matches[1].odds.spread, 0);
    assert.equal(board.matches[2].odds.over_odds, 1.8);
    assert.ok(board.matches.every((match: { odds: { provider: string; home: null; away: null } }) => match.odds.provider === 'FanDuel' && match.odds.home === null && match.odds.away === null));
  } finally { globalThis.fetch = original; }
});
