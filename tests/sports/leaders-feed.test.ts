import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSportsLeaders } from '../../src/lib/espn-leaders-feed';
import { basketballLeaders, nflLeaders } from '../../vendor/nfl-nba/src/data/sportsData';

const livePayload = {
  categories: [
    { displayName: 'Points Per Game Leaders', leaders: [{ athlete: { id: '3945274', displayName: 'Luka Dončić', team: { displayName: 'Dallas Mavericks', abbreviation: 'DAL' } }, displayValue: '33.9' }] },
    { displayName: 'Rebounds Per Game Leaders', leaders: [{ athlete: { id: '3202', displayName: 'Nikola Jokić', team: { abbreviation: 'DEN' } }, displayValue: '12.4' }] },
  ],
};

async function withFetch(run: () => Promise<void>, respond: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('a live leaders feed becomes the homepage board with ESPN headshots', async () => {
  await withFetch(async () => {
    const board = await getSportsLeaders('basketball', true);
    assert.equal(board.status, 'live');
    assert.equal(board.source.ok, true);
    assert.equal(board.league, 'nba');
    assert.deepEqual(board.rows.map((row) => row.name), ['Luka Dončić', 'Nikola Jokić']);
    assert.equal(board.rows[0].headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
  }, async (input) => {
    assert.match(String(input), /^https:\/\/site\.web\.api\.espn\.com\/apis\/common\/v3\/sports\/basketball\/nba\/leaders$/);
    return Response.json(livePayload);
  });
});

test('an unreachable feed falls back to the bundled leaders board and is marked unavailable', async () => {
  await withFetch(async () => {
    const board = await getSportsLeaders('football', true);
    assert.equal(board.status, 'unavailable');
    assert.equal(board.source.ok, false);
    assert.equal(board.source.errorKind, 'network');
    assert.equal(board.league, 'nfl');
    assert.ok(board.rows.length >= 4);
    assert.deepEqual(board.rows.map((row) => row.name), (nflLeaders as unknown as { name: string }[]).slice(0, 6).map((entry) => entry.name));
    assert.ok(board.rows.every((row) => row.headshot === null), 'sample rows carry no headshot so the portrait art is used');
  }, async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); });
});

test('an HTTP error or an empty payload also falls back instead of emptying the board', async () => {
  await withFetch(async () => {
    const blocked = await getSportsLeaders('basketball', true);
    assert.equal(blocked.status, 'unavailable');
    assert.equal(blocked.source.httpStatus, 403);
    assert.equal(blocked.rows.length, (basketballLeaders as unknown as unknown[]).length > 6 ? 6 : (basketballLeaders as unknown as unknown[]).length);
  }, async () => new Response('forbidden', { status: 403 }));
  await withFetch(async () => {
    const empty = await getSportsLeaders('basketball', true);
    assert.equal(empty.status, 'unavailable');
    assert.equal(empty.source.errorKind, 'invalid-response');
    assert.ok(empty.rows.length > 0);
  }, async () => Response.json({ categories: [] }));
});

test('a successful board is cached and shared by concurrent callers', async () => {
  let calls = 0;
  await withFetch(async () => {
    const [first, second] = await Promise.all([getSportsLeaders('basketball', true), getSportsLeaders('basketball', true)]);
    assert.equal(first, second);
    assert.equal(calls, 1, 'concurrent callers share one request');
    const again = await getSportsLeaders('basketball');
    assert.equal(again, first);
    assert.equal(calls, 1, 'a fresh board is served from cache');
  }, async () => { calls += 1; return Response.json(livePayload); });
});
