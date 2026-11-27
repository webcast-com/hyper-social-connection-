import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapStandingsRows } from '../../src/app/services/espnTipTable';
import { buildFormStats, buildHeadToHead } from '../../src/app/services/espnTipHistory';
import type { StandingsBoard } from '../../src/lib/espn-standings';
import type { HistoryGame } from '../../src/lib/espn-match-history';

const board = (groups: StandingsBoard['groups']): StandingsBoard => ({
  league: 'epl', requestedSeason: null, season: { year: 2025, label: null }, status: 'ready',
  groups, fetchedAt: new Date().toISOString(), source: { ok: true, url: 'https://site.api.espn.com/x', httpStatus: 200 },
});

test('tip standings rows read provider stats, pick the group with both teams and highlight the sides', () => {
  const rows = mapStandingsRows(board([
    { id: 'a', label: 'Other conference', columns: [], rows: [
      { teamId: '9', team: 'Someone Else', rank: '1', note: null, values: { wins: '5', losses: '1' } },
    ] },
    { id: 'b', label: 'League', columns: [], rows: [
      { teamId: '1', team: 'Arsenal', rank: '1', note: null, values: { gamesPlayed: '12', wins: '9', ties: '2', losses: '1', points: '29' } },
      { teamId: '2', team: 'Chelsea', rank: '2', note: null, values: { gamesPlayed: '12', wins: '8', ties: '1', losses: '3', points: '25' } },
      { teamId: '3', team: 'Everton', rank: '3', note: null, values: { gamesPlayed: '12', wins: '7', ties: '1', losses: '4', points: '22' } },
    ] },
  ]), 'Arsenal', 'chelsea');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { pos: 1, name: 'Arsenal', p: 12, w: 9, d: 2, l: 1, pts: 29, highlight: true });
  assert.equal(rows[1].highlight, true, 'case-insensitive team match');
  assert.equal(rows[2].highlight, false);
});

test('US-sport standings without draws or points stay null instead of invented', () => {
  const rows = mapStandingsRows(board([
    { id: 'a', label: 'NBA', columns: [], rows: [
      { teamId: '1', team: 'Boston Celtics', rank: null, note: null, values: { wins: '15', losses: '3', winPercent: '.833' } },
    ] },
  ]), 'Boston Celtics', 'Miami Heat');
  assert.deepEqual(rows[0], { pos: 1, name: 'Boston Celtics', p: 18, w: 15, d: null, l: 3, pts: null, highlight: true });
});

const game = (id: string, us: string, them: string, winner: boolean | null, oppWinner: boolean | null = null): HistoryGame => ({
  id, kickoff: `2025-11-0${id}T15:00:00.000Z`, status: 'FT',
  teams: [
    { id: '10', name: 'Arsenal', side: 'home', score: us, winner, shootout: null },
    { id: '20', name: 'Chelsea', side: 'away', score: them, winner: oppWinner, shootout: null },
  ],
});

test('form and recent-record stats come only from ESPN-reported completed games', () => {
  const games = [game('1', '2', '0', true), game('2', '1', '1', null), game('3', '0', '3', false, true)];
  const { form, stats } = buildFormStats(games, '10');
  assert.deepEqual(form, ['W', 'D', 'L']);
  assert.deepEqual(stats, { played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 4, cleanSheets: 1 });
  // Non-numeric scores (e.g. cricket innings) contribute nothing.
  const odd = game('4', '189/7', '190/4', false, true);
  assert.deepEqual(buildFormStats([odd], '10').stats, null);
  assert.deepEqual(buildFormStats([], '10'), { form: [], stats: null });
});

test('head-to-head tallies mutual meetings from the home side and never invents a record', () => {
  const meetings = [game('1', '2', '0', true), game('2', '1', '1', null), game('3', '0', '1', false, true)];
  const { text, record } = buildHeadToHead(meetings, '10', 'Arsenal', 'Chelsea');
  assert.deepEqual(record, { games: 3, homeWins: 1, awayWins: 1, draws: 1 });
  assert.match(text!, /Last 3 recorded meetings: Arsenal won 1, 1 drawn, Chelsea won 1\./);
  assert.deepEqual(buildHeadToHead([], '10', 'A', 'B'), { text: null, record: null });
});
