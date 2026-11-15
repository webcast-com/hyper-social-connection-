import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSportsLeaders } from '../../src/lib/espn-leaders-feed';
import { siteV3Leaders } from './leaders-v3-fixture';

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
    // The site API's v3 path. `site.web.api.espn.com/apis/common/v3/.../leaders`
    // answers 404, so asking it would leave the board permanently empty.
    assert.equal(String(input), 'https://site.api.espn.com/apis/site/v3/sports/basketball/nba/leaders?limit=1');
    return Response.json(livePayload);
  });
});

test('the payload ESPN serves today is read: categories under `leaders`, team beside the athlete', async () => {
  await withFetch(async () => {
    const board = await getSportsLeaders('basketball', true);
    assert.equal(board.status, 'live');
    assert.deepEqual(board.rows.map((row) => [row.name, row.metric, row.value]), [
      ['Luka Doncic', 'Points Per Game', '38.6'],
      ['Nikola Jokic', 'Rebounds Per Game', '13.4'],
    ]);
    const [luka] = board.rows;
    assert.equal(luka.athleteId, '3945274');
    assert.equal(luka.team, 'Los Angeles Lakers', 'the team sits on the entry, not inside the athlete');
    assert.equal(luka.teamAbbr, 'LAL');
    assert.equal(luka.teamId, '13');
    assert.equal(luka.teamLogo, 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png');
    assert.equal(luka.position, 'G');
    assert.equal(luka.jersey, '77');
    assert.equal(luka.headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
  }, async () => Response.json(siteV3Leaders));
});

test('an unreachable feed is marked unavailable and shows no players: there is no sample board', async () => {
  await withFetch(async () => {
    const board = await getSportsLeaders('football', true);
    assert.equal(board.status, 'unavailable');
    assert.equal(board.source.ok, false);
    assert.equal(board.source.errorKind, 'network');
    assert.equal(board.league, 'nfl');
    assert.deepEqual(board.rows, [], 'nothing stands in for players ESPN did not report');
    assert.equal(board.source.url, 'https://site.api.espn.com/apis/site/v3/sports/football/nfl/leaders?limit=1');
  }, async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); });
});

test('an HTTP error or an empty payload is reported as unavailable, with no invented players', async () => {
  await withFetch(async () => {
    const blocked = await getSportsLeaders('basketball', true);
    assert.equal(blocked.status, 'unavailable');
    assert.equal(blocked.source.httpStatus, 403);
    assert.deepEqual(blocked.rows, []);
  }, async () => new Response('forbidden', { status: 403 }));
  await withFetch(async () => {
    const empty = await getSportsLeaders('basketball', true);
    assert.equal(empty.status, 'unavailable');
    assert.equal(empty.source.errorKind, 'invalid-response');
    assert.deepEqual(empty.rows, []);
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

test('top-scorer boards return every player per statistic, and no sample ladder when ESPN fails', async () => {
  const { getSportsTopScorers } = await import('../../src/lib/espn-leaders-feed');
  const ladder = {
    categories: [
      { displayName: 'Points Per Game Leaders', leaders: [
        { athlete: { id: '3945274', displayName: 'Luka Dončić', team: { displayName: 'Dallas Mavericks', abbreviation: 'DAL' } }, displayValue: '33.9' },
        { athlete: { id: '1', displayName: 'Shai Gilgeous-Alexander', team: { abbreviation: 'OKC' } }, displayValue: '31.4' },
        { athlete: { id: '2', displayName: 'Giannis Antetokounmpo', team: { abbreviation: 'MIL' } }, displayValue: '30.8' },
      ] },
      { displayName: 'Rebounds Per Game Leaders', leaders: [
        { athlete: { id: '3202', displayName: 'Nikola Jokić', team: { abbreviation: 'DEN' } }, displayValue: '12.4' },
        { athlete: { id: '4', displayName: 'Domantas Sabonis', team: { abbreviation: 'SAC' } }, displayValue: '12.1' },
      ] },
    ],
  };
  await withFetch(async () => {
    const board = await getSportsTopScorers('basketball', true);
    assert.equal(board.status, 'live');
    assert.equal(board.groups.length, 2);
    assert.deepEqual(board.groups.map((group) => group.metric), ['Points Per Game', 'Rebounds Per Game']);
    assert.equal(board.groups[0].entries.length, 3, 'the whole ladder is returned, not only the leader');
    assert.deepEqual(board.groups[0].entries.map((row) => row.key), ['luka-doncic', 'shai-gilgeous-alexander', 'giannis-antetokounmpo']);
    assert.equal(board.groups[0].entries[0].headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
    assert.equal(board.groups[0].entries[1].headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/1.png');
  }, async (input) => {
    assert.equal(String(input), 'https://site.api.espn.com/apis/site/v3/sports/basketball/nba/leaders?limit=5');
    return Response.json(ladder);
  });
  await withFetch(async () => {
    const board = await getSportsTopScorers('basketball', true);
    assert.equal(board.status, 'live');
    assert.deepEqual(board.groups.map((group) => group.metric), ['Points Per Game', 'Rebounds Per Game']);
    assert.deepEqual(board.groups[0].entries.map((row) => [row.name, row.teamAbbr, row.value]), [
      ['Luka Doncic', 'LAL', '38.6'],
      ['Shai Gilgeous-Alexander', 'OKC', '33.1'],
    ], 'today\u2019s ESPN shape: every listed player, with the team read from the entry');
  }, async () => Response.json(siteV3Leaders));
  await withFetch(async () => {
    const board = await getSportsTopScorers('football', true);
    assert.equal(board.status, 'unavailable');
    assert.deepEqual(board.groups, [], 'no bundled ladder stands in for a feed ESPN did not answer');
    assert.equal(board.source.errorKind, 'network');
  }, async () => { throw new TypeError('fetch failed'); });
});
