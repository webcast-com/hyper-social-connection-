import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTeamNews } from '../../src/lib/espn-team-news-feed';
import { isTeamNewsBoard } from '../../src/lib/espn-team-news';

async function withFetch(respond: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}

const summary = {
  header: {
    id: '401584850',
    competitions: [{ competitors: [
      { homeAway: 'home', team: { id: '2', displayName: 'Boston Celtics' } },
      { homeAway: 'away', team: { id: '14', displayName: 'Miami Heat' } },
    ] }],
  },
  injuries: [{
    team: { id: '2', displayName: 'Boston Celtics' },
    injuries: [{ status: 'Out', athlete: { displayName: 'Jayson Tatum', position: { abbreviation: 'SF' } }, shortComment: 'Out (Achilles).' }],
  }],
};
const news = { articles: [
  { dataSourceIdentifier: 'a1', headline: 'Celtics update ahead of Friday', description: null, links: { web: { href: 'https://www.espn.com/nba/story/a1' } } },
  { dataSourceIdentifier: 'a2', headline: 'Unrelated league memo', description: null, links: { web: { href: 'https://www.espn.com/nba/story/a2' } } },
] };

test('team news board combines summary injuries with team-matched articles and validates', async () => {
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes('/summary?event=')) return Response.json(summary);
    if (url.includes('/news?')) return Response.json(news);
    throw new Error(`Unexpected URL ${url}`);
  }, async () => {
    const board = await getTeamNews('nba', '401584850', true);
    assert.equal(board.status, 'ready');
    assert.equal(board.injuries.length, 1);
    assert.equal(board.injuries[0].players[0].name, 'Jayson Tatum');
    assert.deepEqual(board.articles.map((a) => a.headline), ['Celtics update ahead of Friday']);
    assert.ok(isTeamNewsBoard(board));
  });
});

test('a failed news feed yields partial status and an unreachable ESPN yields unavailable', async () => {
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes('/summary?event=')) return Response.json(summary);
    return new Response('', { status: 503 });
  }, async () => {
    const board = await getTeamNews('nba', '401584850', true);
    assert.equal(board.status, 'partial');
    assert.equal(board.injuries.length, 1);
    assert.deepEqual(board.articles, []);
    assert.ok(board.message);
  });
  await withFetch(async () => { throw new TypeError('fetch failed'); }, async () => {
    const board = await getTeamNews('nba', '401584850', true);
    assert.equal(board.status, 'unavailable');
    assert.deepEqual(board.injuries, []);
    assert.deepEqual(board.articles, []);
    assert.ok(board.sources.every((source) => !source.ok));
  });
});

test('unknown competitions are rejected as input errors', () => {
  assert.throws(() => getTeamNews('made-up-league', '1'), /Unknown match competition/);
});
