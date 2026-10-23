import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStandings, resolveStandings, isStandingsBoard } from '../../src/lib/espn-standings';
import { parseMatchDetails } from '../../src/lib/espn-match';
import { summaryFixture } from './match-fixture';
import { standingsFixture } from './standings-fixture';

test('standings URL is catalog-only, uses the full v2 endpoint and validates seasons', () => {
  assert.deepEqual(resolveStandings('epl', '2026'), { year: 2026, url: 'https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings?season=2026' });
  assert.equal(resolveStandings('nba').url, 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings');
  for (const league of ['../eng.1', 'https://attacker.test', 'f1', '']) assert.throws(() => resolveStandings(league));
  for (const season of ['', '26', '2026&limit=999', '2026.0', '1899', '2101', '-2026']) assert.throws(() => resolveStandings('epl', season));
});
test('tables preserve groups, reported ranks/order, missing values, zero and provider labels', () => {
  const parsed = parseStandings(standingsFixture(), 2026);
  assert.equal(parsed.status, 'ready'); assert.equal(parsed.season?.label, '2025/2026');
  assert.deepEqual(parsed.groups.map((g) => g.label), ['Group A', 'Group B']);
  const table = parsed.groups[1];
  assert.deepEqual(table.rows.map((r) => r.teamId), ['100', '200']);
  assert.equal(table.rows[0].rank, '3'); assert.equal(table.rows[1].rank, null);
  assert.equal(table.rows[0].values.wins, '0'); assert.equal(table.rows[1].values.wins, undefined);
  assert.equal(table.rows[0].note, 'Qualified for next stage');
  assert.equal(table.columns.find((c) => c.name === 'wins')?.label, 'W');
  assert.equal(table.columns.find((c) => c.name === 'wins')?.description, 'Wins');
  assert.equal(table.columns.some((c) => c.name === 'rank'), false);
});
test('conference tables retain sport-specific columns, including percentages and streaks', () => {
  const result = parseStandings({ season: { year: 2026 }, children: [{ name: 'Eastern Conference', children: [{ name: 'Atlantic', standings: { entries: [
    { team: { id: '2', displayName: 'Boston Celtics' }, stats: [{ name: 'winPercent', displayValue: '.788', displayName: 'PCT' }, { name: 'streak', displayValue: 'W3', displayName: 'Strk' }] },
  ] } }] }] }, 2026);
  assert.equal(result.groups[0].label, 'Eastern Conference / Atlantic');
  assert.deepEqual(result.groups[0].columns.map((c) => c.label), ['PCT', 'Strk']);
  assert.equal(result.groups[0].rows[0].values.winPercent, '.788');
});
test('root tables and numeric seasons work; a requested historical season must be confirmed', () => {
  const root = { season: 2025, standings: standingsFixture(2025).children[0].standings };
  assert.equal(parseStandings(root, 2025).season?.year, 2025);
  assert.throws(() => parseStandings(root, 2024), /season not confirmed/);
  assert.throws(() => parseStandings({ standings: root.standings }, 2025), /season not confirmed/);
  assert.equal(parseStandings({ standings: root.standings }, null).season, null);
  assert.equal(parseStandings({ season: { year: 2026 }, children: [] }, 2026).status, 'empty');
  assert.throws(() => parseStandings({}, null), /Invalid ESPN/);
});
test('parser ignores references, unnamed teams, duplicates and hostile statistic keys', () => {
  const data = standingsFixture();
  const entries = data.children[0].standings.entries;
  const duplicateEntries = [...entries, entries[0]];
  const parsed = parseStandings({ standings: { entries: [...duplicateEntries, { $ref: 'https://attacker.test', team: { id: '999' } }, { team: { id: '1', name: 'Safe Club' }, stats: [{ name: '__proto__', displayValue: 'bad' }] }] } }, null);
  assert.equal(parsed.groups[0].rows.length, 2);
  assert.deepEqual(parsed.groups[0].rows.map((r) => r.team), ['Other Club', 'Safe Club']);
  assert.equal(Object.keys(parsed.groups[0].rows[1].values).length, 0);
});
test('client guard rejects wrong competition/season and invalid nested cells', () => {
  const board = { league: 'epl', requestedSeason: 2026, ...parseStandings(standingsFixture(), 2026), fetchedAt: '2026-10-23T18:00:00Z', source: { ok: true, url: resolveStandings('epl').url, httpStatus: 200 } };
  assert.equal(isStandingsBoard(board, 'epl', 2026), true);
  assert.equal(isStandingsBoard(board, 'nba', 2026), false);
  assert.equal(isStandingsBoard(board, 'epl', 2025), false);
  const broken = JSON.parse(JSON.stringify(board)); broken.groups[0].rows[0].values.wins = {};
  assert.equal(isStandingsBoard(broken, 'epl', 2026), false);
  assert.equal(isStandingsBoard({ ...board, status: 'unavailable' }, 'epl', 2026), false);
});
test('match summary extracts supplied season without inferring it from kickoff', () => {
  const fixture = summaryFixture();
  assert.equal(parseMatchDetails(fixture, { league: 'epl', eventId: '401234567' }).season, null);
  const season = { year: 2025, displayName: '2024/25' };
  assert.deepEqual(parseMatchDetails({ ...fixture, header: { ...fixture.header, season } }, { league: 'epl', eventId: '401234567' }).season, { year: 2025, label: '2024/25' });
});
