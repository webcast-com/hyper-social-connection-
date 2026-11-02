import { test } from 'node:test';
import assert from 'node:assert/strict';
import { americanToDecimal, decimalToAmerican, hasOdds, isOddsBoard, dayStamp, mapOdds, mapOddsEvent, normalizeOddsRequest, ODDS_LEAGUES } from '../../src/lib/espn-odds';
import { oddsEvent } from './odds-fixture';

const league = ODDS_LEAGUES.find((item) => item.path === 'soccer/eng.1')!;

test('ESPN odds use decimal prices converted from American money lines', () => {
  assert.equal(americanToDecimal(-125), 1.8);
  assert.equal(americanToDecimal('+120'), 2.2);
  assert.equal(americanToDecimal(100), 2);
  for (const value of [null, '', 'OFF', false, 0, 1.8, -20, Infinity]) assert.equal(americanToDecimal(value), null);
  const odds = mapOdds(oddsEvent().competitions[0]);
  assert.deepEqual(odds, { home: 1.8, away: 2.2, draw: null, over_under: 2.5, spread: null, provider: 'Review bookmaker' });
});
test('explicit decimal odds and nested close/open money lines are supported without mixing providers', () => {
  const odds = mapOdds({ odds: [{
    provider: { name: 'First provider' }, homeTeamOdds: { decimalOdds: '1.91' },
    moneyline: { away: { close: { odds: '+150' } }, draw: { open: { odds: '+250' } } },
  }, { homeTeamOdds: { moneyLine: 200 }, overUnder: 9.5 }] });
  assert.equal(odds.home, 1.91);
  assert.equal(odds.away, 2.5);
  assert.equal(odds.draw, 3.5);
  assert.equal(odds.over_under, null);
  assert.equal(odds.provider, 'First provider');
});
test('totals-only markets are retained; missing and malformed prices are not invented', () => {
  assert.equal(mapOdds({ odds: [{ overUnder: '225.5', spread: 0 }] }).over_under, 225.5);
  for (const odds of [undefined, [], [null], [{ details: 'OFF', spread: -2.5 }], [{ overUnder: 0 }]]) {
    assert.equal(mapOdds({ odds }).home, null);
    assert.equal(mapOdds({ odds }).over_under, null);
  }
});
test('normalization keeps only future pre-game home/away fixtures with reported odds', () => {
  const event = oddsEvent();
  const match = mapOddsEvent(event, league)!;
  assert.equal(match.home_team, 'Home Club');
  assert.equal(match.away_team, 'Away Club');
  assert.equal(match.odds.home, 1.8);
  assert.equal(match.venue, 'Review Stadium');
  for (const state of ['in', 'post']) {
    const row = oddsEvent(); row.competitions[0].status.type.state = state;
    assert.equal(mapOddsEvent(row, league), null);
  }
  const old = oddsEvent('old', -2);
  assert.equal(mapOddsEvent(old, league), null);
  assert.equal(mapOddsEvent({ ...event, date: 'invalid' }, league), null);
  assert.equal(mapOddsEvent({ ...event, id: '' }, league), null);
  assert.equal(mapOddsEvent({ ...event, competitions: [] }, league), null);
  const noTeams = oddsEvent(); noTeams.competitions[0].competitors = [];
  assert.equal(mapOddsEvent(noTeams, league), null);
  const noOdds = oddsEvent(); noOdds.competitions[0].odds = [];
  assert.equal(mapOddsEvent(noOdds, league), null);
});
test('request parameters have bounded work, deterministic keys and no user-supplied endpoint paths', () => {
  assert.deepEqual(normalizeOddsRequest({}), { sports: [], perLeague: 0, days: 1 });
  assert.deepEqual(normalizeOddsRequest({ sports: ['football', 'football'], perLeague: '50', days: 30 }), { sports: ['football'], perLeague: 12, days: 10 });
  assert.equal(normalizeOddsRequest({ perLeague: 0, days: 10 }).days, 1);
  assert.throws(() => normalizeOddsRequest({ sports: ['https://attacker.test'] }), /Supported sports/);
  assert.throws(() => normalizeOddsRequest({ sports: 'football' }), /array/);
  assert.throws(() => normalizeOddsRequest({ perLeague: Infinity }), /finite/);
  assert.throws(() => normalizeOddsRequest({ perLeague: 1, days: 'abc' }), /finite/);
  assert.ok(ODDS_LEAGUES.every((item) => item.sport !== 'motorsport'));
  assert.equal(dayStamp(1, new Date('2026-12-31T12:00:00Z')), '20270101');
});

test('legacy drawOdds variants are normalized and overflow prices never become Infinity', () => {
  for (const drawOdds of [250, { moneyLine: '+250' }]) {
    const odds = mapOdds({ odds: [{ homeTeamOdds: { moneyLine: -100 }, drawOdds }] });
    assert.equal(odds.draw, 3.5);
  }
  assert.equal(americanToDecimal(1e308), null);
});

// These fixtures exercise the owner-supplied directory, not live ESPN coverage.
for (const [id, name] of [[38, 'Caesars'], [37, 'FanDuel'], [41, 'DraftKings'], [58, 'BetMGM'], [68, 'ESPN BET'], [2000, 'Bet365']] as const) {
  test(`provider ID ${id} falls back to ${name} for numeric and string IDs`, () => {
    for (const value of [id, String(id), ` ${id} `]) {
      const odds = mapOdds({ odds: [{ provider: { id: value }, homeTeamOdds: { moneyLine: -125 } }] });
      assert.equal(odds.provider, name);
      assert.equal(odds.home, 1.8);
    }
  });
}

test('reported provider names take precedence over supplied ID branding', () => {
  for (const id of [68, '999', null, { unexpected: true }]) {
    const odds = mapOdds({ odds: [{ provider: { id, name: '  Current ESPN branding  ' }, overUnder: 225.5 }] });
    assert.equal(odds.provider, 'Current ESPN branding');
  }
  for (const name of ['', '  ', null, 123, {}]) {
    assert.equal(mapOdds({ odds: [{ provider: { id: 37, name }, overUnder: 225.5 }] }).provider, 'FanDuel');
  }
});

test('unknown provider IDs are neutral and malformed IDs are never guessed', () => {
  for (const id of [999, '999']) {
    assert.equal(mapOdds({ odds: [{ provider: { id }, overUnder: 225.5 }] }).provider, 'Provider ID 999');
  }
  for (const provider of [undefined, null, 'FanDuel', {}, { $ref: 'https://example.test/37' }]) {
    assert.equal(mapOdds({ odds: [{ provider, overUnder: 225.5 }] }).provider, null);
  }
  for (const id of [undefined, null, '', ' ', 0, -37, 37.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, {}, [], '037', '37x', '3.7e1', 'constructor', '__proto__', '123456789012345678901']) {
    const odds = mapOdds({ odds: [{ provider: { id }, homeTeamOdds: { moneyLine: 120 } }] });
    assert.equal(odds.provider, null);
    assert.equal(odds.home, 2.2);
  }
});

test('provider ID fallback never mixes bookmaker prices or selects an empty provider row', () => {
  const odds = mapOdds({ odds: [
    { provider: { id: 38 } },
    { provider: { id: 37 }, homeTeamOdds: { moneyLine: -125 } },
    { provider: { id: 41 }, awayTeamOdds: { moneyLine: 120 }, overUnder: 225.5 },
  ] });
  assert.deepEqual(odds, { home: 1.8, away: null, draw: null, spread: null, over_under: null, provider: 'FanDuel' });
  assert.equal(mapOdds({ odds: [{ provider: { id: 37 } }] }).provider, null);
});

test('scoreboard event odds use the shared provider ID fallback', () => {
  const event = oddsEvent();
  const competition = { ...event.competitions[0], odds: [{ provider: { id: '41' }, homeTeamOdds: { moneyLine: -125 } }] };
  assert.equal(mapOddsEvent({ ...event, competitions: [competition] }, league)?.odds.provider, 'DraftKings');
});

test('derived American prices are finite, signed, rounded and never inferred from absent prices', () => {
  for (const [decimal, american] of [[1.8, '-125'], [2, '+100'], [2.2, '+120'], [3.5, '+250'], [1.91, '-110']] as const) {
    assert.equal(decimalToAmerican(decimal), american);
  }
  for (const value of [null, undefined, '2', false, NaN, Infinity, 0, 1, -2, 1 + Number.EPSILON, 1e308]) {
    assert.equal(decimalToAmerican(value), null);
  }
});

test('legacy spread and total prices are kept with the selected bookmaker only', () => {
  const odds = mapOdds({ odds: [
    { provider: { id: 37 }, spread: 0, homeTeamOdds: { spreadOdds: -125 }, awayTeamOdds: { spreadOdds: '+120' }, overUnder: 225.5, overOdds: -110, underOdds: 100 },
    { provider: { id: 41 }, homeTeamOdds: { moneyLine: -200 } },
  ] });
  assert.equal(odds.provider, 'FanDuel');
  assert.equal(odds.spread, 0);
  assert.equal(odds.spread_home_odds, 1.8);
  assert.equal(odds.spread_away_odds, 2.2);
  assert.equal(odds.over_odds, 1.9091);
  assert.equal(odds.under_odds, 2);
  assert.equal(odds.home, null);
});

test('nested spread and total quote phases are not combined with each other', () => {
  const odds = mapOdds({ odds: [{
    pointSpread: { home: { close: { line: '-2.5', odds: '-110' }, open: { line: -1.5, odds: -125 } }, away: { open: { odds: 120 } } },
    total: { over: { open: { line: '225.5', decimalOdds: 1.9 } }, under: { open: { odds: '+110' } } },
  }] });
  assert.equal(odds.spread, -2.5);
  assert.equal(odds.spread_home_odds, 1.9091);
  assert.equal(odds.spread_away_odds, undefined); // No opening price added to a closing quote.
  assert.equal(odds.over_under, 225.5);
  assert.equal(odds.over_odds, 1.9);
  assert.equal(odds.under_odds, 2.1);
});

test('draw-only, spread-only and price-only fixtures survive without invented opposing prices or lines', () => {
  for (const raw of [{ spread: 0 }, { drawOdds: 250 }, { homeTeamOdds: { spreadOdds: -110 } }, { overOdds: 120 }]) {
    const odds = mapOdds({ odds: [raw] });
    assert.equal(hasOdds(odds), true);
    const event = oddsEvent();
    assert.ok(mapOddsEvent({ ...event, competitions: [{ ...event.competitions[0], odds: [raw] }] }, league));
    assert.equal(odds.home, null);
    assert.equal(odds.away, null);
  }
  for (const raw of [{ overOdds: 'OFF' }, { overUnder: -1 }, { homeTeamOdds: { spreadOdds: false } }, { pointSpread: { home: { close: { odds: Infinity } } } }]) {
    assert.equal(hasOdds(mapOdds({ odds: [raw] })), false);
  }
});

function validBoard() {
  return {
    matches: [mapOddsEvent(oddsEvent(), league)!],
    sources: [{ path: league.path, date: null, ok: true, count: 1 }],
    status: 'ready', truncated: false, fetchedAt: new Date().toISOString(),
  };
}

test('browser odds validator accepts current and older boards with optional market prices', () => {
  assert.equal(isOddsBoard(validBoard()), true);
  const board = validBoard();
  board.matches[0].odds.over_odds = 1.9;
  assert.equal(isOddsBoard(board), true);
  board.matches[0].odds.over_odds = null;
  assert.equal(isOddsBoard(board), true);
});

test('browser odds validator rejects malformed nested render values, unsafe links and duplicate IDs', () => {
  const change = (fn: (board: ReturnType<typeof validBoard>) => void) => {
    const board = validBoard(); fn(board); assert.equal(isOddsBoard(board), false);
  };
  change((board) => { Object.assign(board.matches[0].odds, { home: '1.8' }); });
  change((board) => { board.matches[0].odds.home = NaN; });
  change((board) => { board.matches[0].odds.over_odds = 1; });
  change((board) => { Object.assign(board.matches[0].odds, { provider: {} }); });
  change((board) => { Object.assign(board.matches[0], { home_team: {} }); });
  change((board) => { board.matches[0].home_logo = 'javascript:alert(1)'; });
  change((board) => { board.matches[0].away_logo = 'https://user:password@example.test/img.png'; });
  change((board) => { board.matches[0].kickoff = 'invalid'; });
  change((board) => { Object.assign(board.sources[0], { responseMetadata: { server: {} } }); });
  change((board) => { Object.assign(board.sources[0], { url: 'https://example.test' }); });
  change((board) => { Object.assign(board.sources[0], { date: [] }); });
  change((board) => { Object.assign(board.sources[0], { count: -1 }); });
  change((board) => { board.matches[0].details = { league: 'epl', eventId: '../bad' }; });
  change((board) => { board.matches.push(board.matches[0]); });
  for (const value of [null, {}, [], { ...validBoard(), matches: [null] }, { ...validBoard(), sources: [null] }]) {
    assert.equal(isOddsBoard(value), false);
  }
});
