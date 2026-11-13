import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADE_PER_PASS, LEADERBOARD_DAYS, LEADERBOARD_ROWS, MAX_LEADERBOARD_DAYS, MAX_LEADERBOARD_ROWS,
  PICKS_UNAVAILABLE, clampLeaderboardDays, clampLeaderboardRows, gradePick, indexPicksByEvent,
  normalisePrice, ordinal, pickEventKey, pickFromFixture, pickIsLocked, pickSidesFor, pickedName,
  type MatchPick, type PickSide,
} from '../../src/lib/sports-picks';
import { gradePicksFromBoard, reportedResults, type GradingPass } from '../../src/lib/sports-picks-grader';
import type { PicksStore } from '../../src/lib/sports-picks-store';
import type { SportsBoard, SportsEvent } from '../../src/lib/sports';

/**
 * Graded match picks.
 *
 * A pick used to become a post — free text with the odds pasted in — which no
 * surface could ever answer. These specs pin the three rules that make an answer
 * possible and keep it honest: a pick is addressed by the league slug and ESPN's
 * event id, never by a team name; it locks at kickoff, decided from the kickoff
 * the feed reported rather than a browser clock; and it is graded only from a
 * result ESPN reported, so a fixture with no score stays awaiting one instead of
 * being settled by a guess.
 */

const pick = (over: Partial<MatchPick> = {}): MatchPick => ({
  id: 1, userId: 7, league: 'epl', eventId: '401234567', side: 'home',
  home: 'Arsenal', away: 'Chelsea', price: 1.8, kickoffAt: '2026-11-14T18:00:00.000Z',
  createdAt: '2026-11-10T09:00:00.000Z', gradedAt: null, outcome: null, points: null,
  homeScore: null, awayScore: null,
  ...over,
});

const event = (over: Partial<SportsEvent> & { id: string }): SportsEvent => ({
  source: 'espn', sport: 'football', league: 'epl', leagueName: 'Premier League',
  status: 'final', startAt: '2026-11-14T18:00:00.000Z',
  home: { name: 'Arsenal', score: 2 }, away: { name: 'Chelsea', score: 0 },
  ...over,
});

const board = (events: SportsEvent[]): SportsBoard => ({
  events, predictions: [], sources: [], fetchedAt: '2026-11-15T09:00:00.000Z', mode: 'live',
});

/** A store that records what a pass asked for and what it wrote. */
function fakeStore(picks: MatchPick[], available = true) {
  const written: { id: number; outcome: string; points: number; homeScore: number; awayScore: number }[] = [];
  const limits: number[] = [];
  const remaining = new Map(picks.map((row) => [row.id, row]));
  const store: PicksStore = {
    available: () => available,
    place: async () => ({ ok: false, reason: 'no-database' }),
    forViewer: async () => [],
    ungraded: async (limit = GRADE_PER_PASS) => {
      limits.push(limit);
      // The statement reads `WHERE "graded_at" IS NULL`, so a graded row is not
      // offered to a later pass. The fake has to behave the same way or a
      // re-run would look like work the database would never return.
      return [...remaining.values()].filter((row) => !row.gradedAt).slice(0, limit);
    },
    grade: async (entries) => {
      for (const entry of entries) {
        // The statement only writes to rows still ungraded, so a re-run cannot
        // change an outcome; the fake behaves the same way.
        const row = remaining.get(entry.id);
        if (!row || row.gradedAt) continue;
        written.push(entry);
        remaining.set(entry.id, {
          ...row, gradedAt: '2026-11-15T09:00:00.000Z', outcome: entry.outcome, points: entry.points,
          homeScore: entry.homeScore, awayScore: entry.awayScore,
        });
      }
      return written.length;
    },
    leaderboard: async () => PICKS_UNAVAILABLE,
  };
  return { store, written, limits, remaining };
}

/* ── The sides a fixture may be picked on ───────────────────────────────── */

test('football may be picked home, draw or away; a sport that cannot draw is not offered one', () => {
  assert.deepEqual(pickSidesFor('football'), ['home', 'draw', 'away']);
  for (const sport of ['basketball', 'american-football', 'rugby', 'baseball', 'ice-hockey', 'motorsport']) {
    assert.deepEqual(pickSidesFor(sport), ['home', 'away'], `${sport} has no draw to pick`);
  }
  assert.deepEqual(pickSidesFor(null), ['home', 'away'], 'an unreported sport is not offered a third outcome');
});

test('a pick reads as the team ESPN reported, and a draw as a draw', () => {
  assert.equal(pickedName(pick({ side: 'home' })), 'Arsenal');
  assert.equal(pickedName(pick({ side: 'away' })), 'Chelsea');
  assert.equal(pickedName(pick({ side: 'draw' })), 'The draw');
});

test('a rank reads as English, not as arithmetic', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
  assert.equal(ordinal(0), '—', 'a rank that is not a rank is not invented');
  assert.equal(ordinal(Number.NaN), '—');
});

/* ── Grading one pick ───────────────────────────────────────────────────── */

test('a pick is graded from the reported score, and only from it', () => {
  assert.deepEqual(gradePick('home', 2, 0), { outcome: 'won', points: 1 });
  assert.deepEqual(gradePick('away', 2, 0), { outcome: 'lost', points: 0 });
  assert.deepEqual(gradePick('draw', 1, 1), { outcome: 'won', points: 1 });
  assert.deepEqual(gradePick('home', 1, 1), { outcome: 'lost', points: 0 });
  assert.deepEqual(gradePick('away', 0, 3), { outcome: 'won', points: 1 });
  assert.deepEqual(gradePick('draw', 0, 0), { outcome: 'won', points: 1 }, 'a goalless draw is a draw');
});

test('a fixture with no reported score leaves the pick ungraded rather than guessing', () => {
  assert.equal(gradePick('home', null, 0), null);
  assert.equal(gradePick('home', 2, null), null);
  assert.equal(gradePick('home', undefined, undefined), null);
  assert.equal(gradePick('draw', Number.NaN, 1), null);
  assert.equal(gradePick('home', -1, 0), null, 'a negative score is not a score');
  assert.equal(gradePick('home', 1.5, 0), null, 'a fractional score is not a football score');
});

test('a price is stored as reported, and a price that cannot be read is stored as none', () => {
  assert.equal(normalisePrice(1.8), 1.8);
  assert.equal(normalisePrice('2.75'), 2.75);
  assert.equal(normalisePrice(1.833), 1.83, 'rounded to what a bookmaker would show');
  assert.equal(normalisePrice(1.007), null, 'a price below the range quoted is refused, not rounded up into one');
  assert.equal(normalisePrice(null), null);
  assert.equal(normalisePrice(undefined), null);
  assert.equal(normalisePrice(1), null, 'a decimal price below 1.01 is not one');
  assert.equal(normalisePrice(0), null);
  assert.equal(normalisePrice(-2), null);
  assert.equal(normalisePrice(1001), null);
  assert.equal(normalisePrice(Number.NaN), null);
  assert.equal(normalisePrice('soon'), null);
});

/* ── The kickoff lock ───────────────────────────────────────────────────── */

test('a pick locks at kickoff, decided from the reported kickoff', () => {
  const kickoff = '2026-11-14T18:00:00.000Z';
  const before = Date.parse(kickoff) - 1;
  assert.equal(pickIsLocked(kickoff, before), false);
  assert.equal(pickIsLocked(kickoff, Date.parse(kickoff)), true, 'kickoff itself is too late');
  assert.equal(pickIsLocked(kickoff, Date.parse(kickoff) + 60_000), true);
});

test('a kickoff this site cannot read is treated as locked, not as open', () => {
  assert.equal(pickIsLocked(null, Date.now()), true);
  assert.equal(pickIsLocked(undefined, Date.now()), true);
  assert.equal(pickIsLocked('tomorrow evening', Date.now()), true);
});

/* ── Turning a click into something that may be stored ──────────────────── */

const candidate = (over: Record<string, unknown> = {}) => ({
  league: 'epl', eventId: '401234567', side: 'home', sport: 'football',
  home: 'Arsenal', away: 'Chelsea', kickoff: '2026-11-14T18:00:00.000Z', price: 1.8,
  ...over,
});

test('a pick on a listed fixture is taken with the reported price and kickoff', () => {
  const now = Date.parse('2026-11-10T09:00:00.000Z');
  const result = pickFromFixture(candidate(), now);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.pick, {
    league: 'epl', eventId: '401234567', side: 'home', home: 'Arsenal', away: 'Chelsea',
    price: 1.8, kickoffAt: '2026-11-14T18:00:00.000Z',
  });
});

test('a fixture that is not in the catalog, or has no ESPN match id, cannot be picked', () => {
  const now = Date.parse('2026-11-10T09:00:00.000Z');
  for (const over of [
    { league: 'not-a-league' }, { league: '' }, { league: null },
    { eventId: 'not-numeric' }, { eventId: '../../etc/passwd' }, { eventId: '' }, { eventId: null },
    { home: '' }, { away: '   ' },
  ]) {
    const result = pickFromFixture(candidate(over), now);
    assert.equal(result.ok, false, `${JSON.stringify(over)} must be refused`);
    if (!result.ok) assert.equal(result.reason, 'no-fixture');
  }
});

test('a side the fixture cannot produce is refused with the sides it can', () => {
  const now = Date.parse('2026-11-10T09:00:00.000Z');
  const draw = pickFromFixture(candidate({ side: 'draw', sport: 'basketball' }), now);
  assert.equal(draw.ok, false);
  if (!draw.ok) {
    assert.equal(draw.reason, 'unknown-side');
    assert.match(draw.message, /cannot end in a draw/);
  }
  const invented = pickFromFixture(candidate({ side: 'both' }), now);
  assert.equal(invented.ok, false);
  if (!invented.ok) assert.equal(invented.reason, 'unknown-side');
  assert.equal(pickFromFixture(candidate({ side: 'draw', sport: 'football' }), now).ok, true,
    'football may still be picked as a draw');
});

test('a pick after kickoff is refused, and so is one whose kickoff was never reported', () => {
  const afterKickoff = Date.parse('2026-11-14T19:00:00.000Z');
  const late = pickFromFixture(candidate(), afterKickoff);
  assert.equal(late.ok, false);
  if (!late.ok) {
    assert.equal(late.reason, 'locked');
    assert.match(late.message, /lock at kickoff/);
  }

  const unreported = pickFromFixture(candidate({ kickoff: null }), Date.parse('2026-11-10T09:00:00.000Z'));
  assert.equal(unreported.ok, false);
  if (!unreported.ok) assert.equal(unreported.reason, 'locked', 'an unverifiable kickoff does not open the pick');
});

test('a pick with no reported price is stored without one, not with a plausible one', () => {
  const now = Date.parse('2026-11-10T09:00:00.000Z');
  const result = pickFromFixture(candidate({ price: null }), now);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.pick.price, null);
});

test('picks are indexed by the fixture they were made on', () => {
  const index = indexPicksByEvent([pick({ id: 1 }), pick({ id: 2, eventId: '401234568' }), pick({ id: 3, league: 'nba' })]);
  assert.equal(index.size, 3);
  assert.equal(index.get(pickEventKey('epl', '401234567'))?.id, 1);
  assert.equal(index.get(pickEventKey('nba', '401234567'))?.id, 3, 'the same event id in another competition is another fixture');
  assert.equal(index.get('epl:409999999'), undefined);
});

test('the leaderboard window and length are clamped', () => {
  assert.equal(clampLeaderboardDays(30), 30);
  assert.equal(clampLeaderboardDays(0), LEADERBOARD_DAYS, 'a window of no days falls back to the default');
  assert.equal(clampLeaderboardDays(-5), LEADERBOARD_DAYS);
  assert.equal(clampLeaderboardDays('nonsense'), LEADERBOARD_DAYS);
  assert.equal(clampLeaderboardDays(9999), MAX_LEADERBOARD_DAYS);
  assert.equal(clampLeaderboardRows(0), LEADERBOARD_ROWS);
  assert.equal(clampLeaderboardRows(9999), MAX_LEADERBOARD_ROWS);
});

/* ── What a pass may grade against ──────────────────────────────────────── */

test('only fixtures ESPN reports as finished, with both scores, can grade a pick', () => {
  const results = reportedResults(board([
    event({ id: 'a', sourceId: '401234567' }),
    event({ id: 'b', sourceId: '401234568', league: 'nba', sport: 'basketball', home: { name: 'Lakers', score: 100 }, away: { name: 'Nuggets', score: 102 } }),
    event({ id: 'c', sourceId: '401234569', status: 'live', home: { name: 'Live', score: 1 }, away: { name: 'Club', score: 0 } }),
    event({ id: 'd', sourceId: '401234570', status: 'upcoming', home: { name: 'Soon', score: null }, away: { name: 'Club', score: null } }),
    event({ id: 'e', sourceId: '401234571', home: { name: 'No score', score: null }, away: { name: 'Club', score: 2 } }),
    event({ id: 'f', sourceId: 'not-numeric' }),
    event({ id: 'g', sourceId: '401234572' , source: 'demo', status: 'final' }),
    event({ id: 'h' }),
  ]));

  assert.deepEqual([...results.keys()], ['epl:401234567', 'nba:401234568'],
    'a live or upcoming fixture is not a result, a fixture with no score is not a result, a sample is not a result, and a fixture without an ESPN id cannot be addressed');
  assert.deepEqual(results.get('epl:401234567'), { home: 2, away: 0 });
  assert.equal(reportedResults(null).size, 0);
  assert.equal(reportedResults(undefined).size, 0);
});

/* ── The pass ───────────────────────────────────────────────────────────── */

test('a pass writes the outcome the reported score decides, and nothing else', async () => {
  const picks = [
    pick({ id: 1, side: 'home' }),
    pick({ id: 2, side: 'draw' }),
    pick({ id: 3, side: 'away' }),
    pick({ id: 4, eventId: '409999999' }),
  ];
  const fake = fakeStore(picks);
  const pass = await gradePicksFromBoard({ board: board([event({ id: 'a', sourceId: '401234567' })]), store: fake.store });

  assert.deepEqual(pass, { ok: true, examined: 4, graded: 3, awaiting: 1 } satisfies GradingPass);
  assert.deepEqual(fake.written, [
    { id: 1, outcome: 'won', points: 1, homeScore: 2, awayScore: 0 },
    { id: 2, outcome: 'lost', points: 0, homeScore: 2, awayScore: 0 },
    { id: 3, outcome: 'lost', points: 0, homeScore: 2, awayScore: 0 },
  ]);
  assert.equal(fake.remaining.get(4)!.gradedAt, null, 'a fixture the board does not report stays awaiting a result');
});

test('a pass over a board with no results grades nothing and says why', async () => {
  const fake = fakeStore([pick()]);
  const pass = await gradePicksFromBoard({ board: board([]), store: fake.store });
  assert.deepEqual(pass, { ok: true, reason: 'no-board', examined: 1, graded: 0, awaiting: 1 });
  assert.deepEqual(fake.written, []);
});

test('a pass is bounded, so it cannot chase the whole table', async () => {
  const many = Array.from({ length: 40 }, (_, index) => pick({ id: index + 1, eventId: String(401234567 + index) }));
  const fake = fakeStore(many);
  const pass = await gradePicksFromBoard({ board: board([]), store: fake.store });
  assert.deepEqual(fake.limits, [GRADE_PER_PASS], 'the pass asks for one bounded page');
  assert.equal(pass.examined, GRADE_PER_PASS);

  const narrower = fakeStore(many);
  await gradePicksFromBoard({ board: board([]), store: narrower.store, limit: 3 });
  assert.deepEqual(narrower.limits, [3]);
});

test('grading twice changes nothing the second time', async () => {
  const fake = fakeStore([pick({ id: 1, side: 'home' })]);
  const scoreboard = board([event({ id: 'a', sourceId: '401234567' })]);

  const first = await gradePicksFromBoard({ board: scoreboard, store: fake.store });
  assert.equal(first.graded, 1);

  // The statement only writes where `graded_at` is still null, and the read that
  // feeds it only returns rows still null, so the second pass finds no work.
  const second = await gradePicksFromBoard({ board: scoreboard, store: fake.store });
  assert.deepEqual(second, { ok: true, examined: 0, graded: 0, awaiting: 0 });
  assert.equal(fake.remaining.get(1)!.outcome, 'won');
  assert.equal(fake.written.length, 1, 'one write in total, not one per pass');
});

test('a pass with no database does no work at all', async () => {
  const fake = fakeStore([pick()], false);
  const pass = await gradePicksFromBoard({ board: board([event({ id: 'a', sourceId: '401234567' })]), store: fake.store });
  assert.deepEqual(pass, { ok: false, reason: 'no-database', examined: 0, graded: 0, awaiting: 0 });
  assert.deepEqual(fake.limits, [], 'it never even asked the store');
});

test('a pass with nothing awaiting a result costs nothing', async () => {
  const fake = fakeStore([]);
  const pass = await gradePicksFromBoard({ store: fake.store });
  assert.deepEqual(pass, { ok: true, examined: 0, graded: 0, awaiting: 0 });
});

test('a sample fixture on the board grades nothing', async () => {
  const fake = fakeStore([pick({ id: 1, side: 'home' })]);
  const pass = await gradePicksFromBoard({
    board: board([event({ id: 'a', sourceId: '401234567', source: 'demo' })]),
    store: fake.store,
  });
  assert.equal(pass.graded, 0);
  assert.deepEqual(fake.written, [], 'a fixture this site invented has no result to grade against');
});

test('a pick on a side the fixture could not produce is still graded from the score', async () => {
  // A basketball pick can only be home or away; if a row somehow held a draw it
  // is graded against the reported score, which decides it lost.
  const fake = fakeStore([pick({ id: 1, side: 'draw' as PickSide, league: 'nba', eventId: '401234568' })]);
  const pass = await gradePicksFromBoard({
    board: board([event({ id: 'b', sourceId: '401234568', league: 'nba', sport: 'basketball', home: { name: 'Lakers', score: 100 }, away: { name: 'Nuggets', score: 90 } })]),
    store: fake.store,
  });
  assert.equal(pass.graded, 1);
  assert.deepEqual(fake.written[0], { id: 1, outcome: 'lost', points: 0, homeScore: 100, awayScore: 90 });
});
