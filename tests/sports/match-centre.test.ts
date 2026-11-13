import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_CENTRE_ROWS, MATCH_CENTRE_ROWS_COMPACT, MAX_CENTRE_ROWS,
  liveFixtureCount, orderCentreEvents, pickableEvents, selectMatchCentreRows, summariseLiveCards,
} from '../../src/lib/match-centre';
import type { SportsEvent } from '../../src/lib/sports';

/**
 * The homepage's match centre: which fixtures it shows, and in what order.
 *
 * This is the rule that replaced two components each fetching their own board,
 * and the two things it has to keep are the ones a reader would notice: a rail
 * of four rows reads as four competitions rather than four games from one, and a
 * fixture the feed already carries as a card is deprioritised rather than
 * repeated — but never dropped, because on a quiet day those two or three
 * fixtures are the only ones there are, and an empty centre is not deduplication.
 */

const event = (over: Partial<SportsEvent> & { id: string }): SportsEvent => ({
  source: 'espn',
  sport: 'football',
  league: 'epl',
  leagueName: 'Premier League',
  status: 'upcoming',
  startAt: '2026-11-10T18:00:00.000Z',
  home: { name: 'Home Club', score: null },
  away: { name: 'Away Club', score: null },
  ...over,
});

/** Four Premier League games and one from each of three other competitions. */
const busyBoard = (): SportsEvent[] => [
  event({ id: 'epl-1', status: 'final', home: { name: 'Arsenal', score: 2 }, away: { name: 'Chelsea', score: 0 } }),
  event({ id: 'epl-2' }),
  event({ id: 'epl-3' }),
  event({ id: 'epl-4' }),
  event({ id: 'nba-1', sport: 'basketball', league: 'nba', leagueName: 'NBA', status: 'live', home: { name: 'Lakers', score: 88 }, away: { name: 'Nuggets', score: 90 } }),
  event({ id: 'nfl-1', sport: 'american-football', league: 'nfl', leagueName: 'NFL' }),
  event({ id: 'ucl-1', league: 'uefa.champions', leagueName: 'UEFA Champions League' }),
];

test('live fixtures come first, then upcoming, then results, keeping the board order within a state', () => {
  const ordered = orderCentreEvents(busyBoard());
  assert.deepEqual(ordered.map((item) => item.id), ['nba-1', 'epl-2', 'epl-3', 'epl-4', 'nfl-1', 'ucl-1', 'epl-1']);
});

test('a rail of four rows is four competitions, not four games from one', () => {
  const rows = selectMatchCentreRows(busyBoard(), { limit: 4 });
  assert.deepEqual(rows.map((row) => row.id), ['nba-1', 'epl-2', 'nfl-1', 'ucl-1']);
  assert.equal(new Set(rows.map((row) => row.league)).size, 4, 'every row is a different competition');
});

test('the same competition fills the remaining rows once the others are shown', () => {
  const rows = selectMatchCentreRows(busyBoard(), { limit: 6 });
  assert.deepEqual(rows.map((row) => row.id), ['nba-1', 'epl-2', 'nfl-1', 'ucl-1', 'epl-3', 'epl-4']);
});

test('a fixture the feed already shows as a card is deprioritised, not dropped', () => {
  const board = busyBoard();
  // The feed's two featured cards are the live NBA game and one Premier League
  // match, which is what `featuredSportsEvents` picks from this board.
  const shown = ['nba-1', 'epl-2'];

  const rows = selectMatchCentreRows(board, { limit: 4, shownEventIds: shown });
  assert.equal(rows[0]!.id, 'nba-1', 'a live fixture is never treated as a repeat');
  assert.deepEqual(rows.slice(1).map((row) => row.id), ['epl-3', 'nfl-1', 'ucl-1'],
    'the rows after it are fixtures the reader has not just seen, one per competition');
  assert.ok(!rows.some((row) => row.id === 'epl-2'),
    'the fixture already on the feed as a card gives its slot to a fresh one');
});

test('a quiet day still fills its rows even when every fixture is already a card', () => {
  const board = [
    event({ id: 'epl-1', status: 'live', home: { name: 'Arsenal', score: 1 }, away: { name: 'Chelsea', score: 1 } }),
    event({ id: 'nba-1', sport: 'basketball', league: 'nba', leagueName: 'NBA', status: 'final', home: { name: 'Warriors', score: 184 }, away: { name: 'Nuggets', score: 183 } }),
  ];

  const rows = selectMatchCentreRows(board, { limit: 3, shownEventIds: ['epl-1', 'nba-1'] });
  assert.deepEqual(rows.map((row) => row.id), ['epl-1', 'nba-1'],
    'a centre that showed nothing here would be a hole, not a deduplication');
});

test('an empty board produces no rows, and the caller renders nothing', () => {
  assert.deepEqual(selectMatchCentreRows([], { limit: 4 }), []);
  assert.deepEqual(selectMatchCentreRows([], {}), []);
});

test('the limit is clamped, so a caller cannot ask for the whole board', () => {
  const board = Array.from({ length: 40 }, (_, index) => event({ id: `epl-${index}`, league: `league-${index}`, leagueName: `League ${index}` }));
  assert.equal(selectMatchCentreRows(board, { limit: 999 }).length, MAX_CENTRE_ROWS);
  assert.equal(selectMatchCentreRows(board, { limit: 0 }).length, 1);
  assert.equal(selectMatchCentreRows(board, { limit: -5 }).length, 1);
  assert.equal(selectMatchCentreRows(board, { limit: 2.7 }).length, 2);
});

test('the two centre surfaces share one rule at their own bounds', () => {
  const board = busyBoard();
  const compact = selectMatchCentreRows(board, { limit: MATCH_CENTRE_ROWS_COMPACT });
  const rail = selectMatchCentreRows(board, { limit: MATCH_CENTRE_ROWS });

  assert.equal(compact.length, 2);
  assert.equal(rail.length, 4);
  assert.deepEqual(compact, rail.slice(0, 2), 'the compact summary is the rail, shorter');
});

test('the Live tab lists every fixture, in the centre\u2019s own order and with nothing left out', () => {
  const board = busyBoard();
  const listed = orderCentreEvents(board);

  assert.equal(listed.length, board.length, 'a tab that lists everything drops nothing');
  assert.deepEqual(listed.map((event) => event.id), ['nba-1', 'epl-2', 'epl-3', 'epl-4', 'nfl-1', 'ucl-1', 'epl-1'],
    'live first, then upcoming, then results — the board\u2019s own order, not re-ranked');
  assert.deepEqual(selectMatchCentreRows(board, { limit: MATCH_CENTRE_ROWS }), listed.slice(0, 1).concat(
    selectMatchCentreRows(board, { limit: MATCH_CENTRE_ROWS }).slice(1)),
    'the rail still spends its four scarce rows on four competitions');
});

test('a board of a thousand fixtures is listed whole by the tab and still bounded in the rail', () => {
  const huge = Array.from({ length: 1000 }, (_, index) => event({
    id: `evt-${index}`, sourceId: String(401200000 + index),
    league: `league-${index % 40}`, leagueName: `League ${index % 40}`,
    status: index % 7 === 0 ? 'live' : index % 3 === 0 ? 'final' : 'upcoming',
  }));

  assert.equal(orderCentreEvents(huge).length, 1000, 'nothing is capped on the way to the tab');
  assert.equal(orderCentreEvents(huge)[0]!.status, 'live', 'and the live ones come first');
  assert.equal(selectMatchCentreRows(huge, { limit: MATCH_CENTRE_ROWS }).length, 4, 'the rail stays four rows');
});

test('a live count describes fixtures ESPN reports as in play, never samples', () => {
  assert.equal(liveFixtureCount(busyBoard()), 1);
  assert.equal(liveFixtureCount([event({ id: 'demo-1', source: 'demo', status: 'live' })]), 0,
    'a sample fixture is not a live sport');
  assert.equal(liveFixtureCount([event({ id: 'epl-1', status: 'final' })]), 0);
});

test('only fixtures that are ESPN-reported, not yet started and addressable can be picked', () => {
  const board = [
    event({ id: 'pick-1', sourceId: '401234567' }),
    event({ id: 'live-1', sourceId: '401234568', status: 'live' }),
    event({ id: 'final-1', sourceId: '401234569', status: 'final' }),
    event({ id: 'demo-1', source: 'demo', status: 'upcoming' }),
    event({ id: 'no-id', status: 'upcoming' }),
  ];
  assert.deepEqual(pickableEvents(board).map((item) => item.id), ['pick-1'],
    'a live or finished fixture is too late, a sample has no result to grade, and a fixture with no ESPN id cannot be addressed later');
});

test('the Live tab counts what it may claim, and never counts a sample as live', () => {
  assert.deepEqual(summariseLiveCards([]), { live: 0, fixtures: 0 });
  assert.deepEqual(summariseLiveCards([
    { type: 'sports', event: { status: 'live', source: 'espn' } },
    { type: 'sports', event: { status: 'upcoming', source: 'espn' } },
    { type: 'sports', event: { status: 'final', source: 'espn' } },
  ]), { live: 1, fixtures: 3 });
  assert.deepEqual(summariseLiveCards([
    { type: 'sports', event: { status: 'live', source: 'demo' } },
  ]), { live: 0, fixtures: 1 }, 'a fixture this site invented is listed but not live');
  assert.deepEqual(summariseLiveCards([
    { type: 'video-news', event: null },
    { type: 'prediction', event: null },
    { type: 'post' },
  ]), { live: 0, fixtures: 0 }, 'a card that is not a fixture never counts as one');
  assert.deepEqual(summariseLiveCards([{ type: 'sports' }]), { live: 0, fixtures: 0 },
    'a sports card with no event is not a fixture');
});

test('the input list is not mutated', () => {
  const board = busyBoard();
  const before = board.map((item) => item.id);
  selectMatchCentreRows(board, { limit: 4 });
  orderCentreEvents(board);
  assert.deepEqual(board.map((item) => item.id), before);
});
