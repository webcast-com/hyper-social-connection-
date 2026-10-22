import { test } from 'node:test';
import assert from 'node:assert/strict';
import { americanToDecimal, dayStamp, mapOdds, mapOddsEvent, normalizeOddsRequest, ODDS_LEAGUES } from '../../src/lib/espn-odds';
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
test('totals-only markets are retained; missing, malformed and spread-only odds are not invented', () => {
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
