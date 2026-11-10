import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLeaders } from '../../src/lib/espn-leaders';
import { portraitFor } from '../../src/lib/player-portraits';

const leadersPayload = {
  categories: [
    {
      displayName: 'Points Per Game Leaders',
      leaders: [
        { athlete: { id: '3945274', displayName: 'Luka Dončić', jersey: '77', position: { abbreviation: 'PG' }, team: { displayName: 'Dallas Mavericks', abbreviation: 'DAL', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nba/500/dal.png' }] }, headshot: { href: 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png' } }, displayValue: '33.9' },
        { athlete: { id: '1', displayName: 'Someone Else' }, displayValue: '20.0' },
      ],
    },
    {
      name: 'Rebounds Per Game Leaders',
      leaders: [{ athlete: { id: '3202', displayName: 'Nikola Jokić', position: { name: 'Center' }, team: { displayName: 'Denver Nuggets', abbreviation: 'DEN' } }, displayValue: '12.4' }],
    },
    { displayName: 'Assists Per Game Leaders', leaders: [{ athlete: { displayName: 'Tyrese Haliburton' }, displayValue: '10.9' }] },
    { displayName: 'Empty Leaders', leaders: [] },
  ],
};

test('leaders keep the top player of each statistic in ESPN order, one row per metric', () => {
  const rows = normalizeLeaders(leadersPayload, 'basketball');
  assert.deepEqual(rows.map((row) => row.metric), ['Points Per Game', 'Rebounds Per Game', 'Assists Per Game']);
  assert.deepEqual(rows.map((row) => row.name), ['Luka Dončić', 'Nikola Jokić', 'Tyrese Haliburton']);
  assert.deepEqual(rows.map((row) => row.value), ['33.9', '12.4', '10.9']);
  assert.equal(rows[1].initials, 'NJ');
  assert.equal(rows[0].jersey, '77');
  assert.equal(rows[0].position, 'PG');
  assert.equal(rows[1].position, 'Center');
  assert.equal(rows[0].teamLogo, 'https://a.espncdn.com/i/teamlogos/nba/500/dal.png');
});

test('headshots come from the feed, or from the ESPN CDN when only an athlete id is present', () => {
  const [first, second, third] = normalizeLeaders(leadersPayload, 'basketball');
  assert.equal(first.headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
  assert.equal(second.headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/3202.png');
  assert.equal(third.headshot, null);
});

test('the NFL feed builds NFL headshot URLs, not NBA ones', () => {
  const [row] = normalizeLeaders({
    categories: [{ displayName: 'Passing Yards Leaders', leaders: [{ athlete: { id: '3916387', displayName: 'Lamar Jackson', team: { abbreviation: 'BAL' } }, displayValue: '3,678' }] }],
  }, 'football');
  assert.equal(row.headshot, 'https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png');
  assert.equal(row.metric, 'Passing Yards');
});

test('missing athletes, values and malformed payloads produce no rows', () => {
  assert.deepEqual(normalizeLeaders({}, 'basketball'), []);
  assert.deepEqual(normalizeLeaders(null, 'basketball'), []);
  assert.deepEqual(normalizeLeaders({ categories: [{ leaders: [{ athlete: {}, displayValue: '1' }] }] }, 'basketball'), []);
  assert.deepEqual(normalizeLeaders({ categories: [{ leaders: [{ athlete: { displayName: 'No Value' } }] }] }, 'basketball'), []);
  assert.deepEqual(normalizeLeaders({ categories: 'not-an-array' }, 'basketball'), []);
});

test('the limit caps the board without dropping a metric twice', () => {
  const rows = normalizeLeaders(leadersPayload, 'basketball', 2);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.metric), ['Points Per Game', 'Rebounds Per Game']);
  const duplicated = normalizeLeaders({
    categories: [{ displayName: 'Points Per Game Leaders', leaders: [{ athlete: { displayName: 'A' }, displayValue: '1' }] }, { displayName: 'Points Per Game Leaders', leaders: [{ athlete: { displayName: 'B' }, displayValue: '2' }] }],
  }, 'basketball');
  assert.equal(duplicated.length, 1);
});

test('player keys are stable slugs the dashboard player pages resolve', () => {
  const [row] = normalizeLeaders(leadersPayload, 'basketball');
  assert.equal(row.key, 'luka-doncic');
  const [nfl] = normalizeLeaders({
    categories: [{ leaders: [{ athlete: { displayName: 'Lamar Jackson' }, displayValue: '1' }] }],
  }, 'football');
  assert.equal(nfl.key, 'lamar-jackson');
});

test('portraits are deterministic per player and differ between sports', () => {
  assert.equal(portraitFor('basketball', 'Luka Dončić'), portraitFor('basketball', 'Luka Dončić'));
  assert.notEqual(portraitFor('basketball', 'Luka Dončić'), portraitFor('football', 'Luka Dončić'));
  assert.match(portraitFor('basketball', 'Anyone'), /^\/sports\/players\/nba-portrait-[1-5]\.jpg$/);
  assert.match(portraitFor('football', 'Anyone'), /^\/sports\/players\/nfl-portrait-[1-5]\.jpg$/);
});

test('the full board keeps every player per statistic, not just the leader', async () => {
  const { normalizeTopScorers, bundledTopScorers } = await import('../../src/lib/sports-top-scorers');
  const groups = normalizeTopScorers(leadersPayload, 'basketball', 5);
  assert.deepEqual(groups.map((group) => group.metric), ['Points Per Game', 'Rebounds Per Game', 'Assists Per Game']);
  const points = groups[0];
  assert.equal(points.entries.length, 2, 'every reported entry is kept, capped at the limit');
  assert.deepEqual(points.entries.map((row) => row.name), ['Luka Dončić', 'Someone Else']);
  assert.equal(points.short, 'POINT');
  assert.equal(points.entries[1].key, 'someone-else');

  const capped = normalizeTopScorers(leadersPayload, 'basketball', 1);
  assert.deepEqual(capped.map((group) => group.entries.length), [1, 1, 1]);

  const bundled = bundledTopScorers('basketball');
  assert.ok(bundled.length >= 3);
  assert.ok(bundled.every((group) => group.entries.length > 1), 'the bundled boards list the whole ladder');
  assert.ok(bundled.some((group) => group.entries.some((row) => row.name === 'Luka Dončić')));
  assert.ok(bundledTopScorers('football').every((group) => group.entries.every((row) => row.headshot === null)));
});

test('duplicate statistics and malformed entries never repeat a player twice', async () => {
  const { normalizeTopScorers } = await import('../../src/lib/sports-top-scorers');
  const groups = normalizeTopScorers({
    categories: [
      { displayName: 'Points Per Game Leaders', leaders: [{ athlete: { displayName: 'A' }, displayValue: '1' }] },
      { displayName: 'Points Per Game Leaders', leaders: [{ athlete: { displayName: 'B' }, displayValue: '2' }] },
      { displayName: 'Broken', leaders: [{ athlete: {} }, { athlete: { displayName: 'No Value' } }, null] },
    ],
  }, 'basketball');
  assert.deepEqual(groups.map((group) => group.metric), ['Points Per Game']);
  assert.deepEqual(groups[0].entries.map((row) => row.name), ['A']);
});
