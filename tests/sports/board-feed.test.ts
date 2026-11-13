import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featuredSportsEvents, matchPollOptions, type SportsEvent } from '../../src/lib/sports';
import { SPORTS_BOARD_LEAGUES, SPORTS_BOARD_SPORTS } from '../../src/lib/sports-catalog';

/**
 * Basketball shares the sports board with every other sport, so its matches
 * appear in the feed and on the board in the same cards football uses.
 */

const event = (over: Partial<SportsEvent> & { league: string; sport: SportsEvent['sport'] }): SportsEvent => ({
  id: `${over.league}-1`,
  source: 'espn',
  leagueName: over.league.toUpperCase(),
  status: 'upcoming',
  startAt: '2026-11-09T18:00:00Z',
  home: { name: 'Home', short: 'HOM' },
  away: { name: 'Away', short: 'AWY' },
  ...over,
});

const football = (league: string, kickoff: string) => event({ league, sport: 'football', startAt: kickoff });
const basketball = (league: string, kickoff: string) => event({ league, sport: 'basketball', startAt: kickoff });

test('the board catalog lists basketball alongside every other sport', () => {
  for (const slug of ['nba', 'wnba', 'ncaam', 'ncaaw']) {
    assert.ok(SPORTS_BOARD_LEAGUES.some((league) => league.slug === slug), `${slug} is on the board`);
  }
  assert.ok(SPORTS_BOARD_SPORTS.includes('basketball'), 'the sport filter offers Basketball');
});

test('asking for every fixture returns every fixture, one per sport first', () => {
  // The For You feed carries every match the board reports rather than two, so
  // the same function is asked for as many as exist. What has to hold is that it
  // returns all of them, that the ones landing in the feed's first slots are
  // still spread across the sports actually playing, and that the rest keep the
  // board's own order rather than being re-ranked here.
  const events = [
    football('epl', '2026-11-09T18:00:00Z'),
    football('laliga', '2026-11-09T18:30:00Z'),
    basketball('nba', '2026-11-09T19:00:00Z'),
    football('mls', '2026-11-09T19:30:00Z'),
    basketball('wnba', '2026-11-09T20:00:00Z'),
  ];

  const all = featuredSportsEvents(events, events.length);
  assert.equal(all.length, events.length, 'nothing is dropped by asking for all of them');
  assert.deepEqual(new Set(all.map((entry) => entry.id)).size, events.length, 'and nothing is duplicated');
  assert.deepEqual(all.slice(0, 2).map((entry) => entry.sport), ['football', 'basketball'],
    'the two that land in the feed\u2019s first slots are still one per sport');
  assert.deepEqual(all.slice(2).map((entry) => entry.league), ['laliga', 'mls', 'wnba'],
    'the rest follow in the board\u2019s own order');

  assert.equal(featuredSportsEvents([], 0).length, 0, 'an empty board yields an empty feed, not a placeholder');
  assert.equal(featuredSportsEvents(events, 99).length, events.length, 'asking for more than exist returns what exists');
});

test('a feed with football and basketball playing shows both', () => {
  const events = [
    football('epl', '2026-11-09T18:00:00Z'),
    football('laliga', '2026-11-09T18:30:00Z'),
    basketball('nba', '2026-11-09T19:00:00Z'),
  ];
  const featured = featuredSportsEvents(events);
  assert.equal(featured.length, 2);
  assert.deepEqual(featured.map((entry) => entry.sport), ['football', 'basketball']);
  // The card for each is the board's own, so nothing new is rendered for it.
  assert.equal(featured[1].league, 'nba');
});

test('a live basketball match leads a feed of upcoming football matches', () => {
  // The board orders live first, so a live game outranks a later kickoff.
  const live = [
    { ...basketball('nba', '2026-11-09T17:00:00Z'), status: 'live' as const },
    football('epl', '2026-11-09T18:00:00Z'),
  ];
  const featured = featuredSportsEvents(live);
  assert.equal(featured[0].league, 'nba');
  assert.equal(featured[0].status, 'live');
  assert.deepEqual(featured.map((entry) => entry.sport), ['basketball', 'football']);
});

test('a feed with only football playing keeps the board order', () => {
  // The board is already ordered live first, then by kickoff; the selection
  // keeps that order and only spreads the slots across sports.
  const events = [
    football('epl', '2026-11-09T18:00:00Z'),
    football('laliga', '2026-11-09T19:00:00Z'),
    football('bundesliga', '2026-11-09T20:00:00Z'),
  ];
  assert.deepEqual(featuredSportsEvents(events).map((entry) => entry.league), ['epl', 'laliga']);
  // A second football match fills the slot no other sport is playing for.
  assert.deepEqual(featuredSportsEvents([football('epl', '2026-11-09T18:00:00Z')], 2).map((e) => e.league), ['epl']);
});

test('a feed with one sport and one slot is not padded', () => {
  assert.deepEqual(featuredSportsEvents([football('epl', '2026-11-09T18:00:00Z')], 3).map((e) => e.league), ['epl']);
  assert.deepEqual(featuredSportsEvents([], 2), []);
});

test('a basketball poll has no draw', () => {
  assert.deepEqual(matchPollOptions(basketball('nba', '2026-11-09T18:00:00Z')), ['AWY', 'HOM']);
  assert.deepEqual(matchPollOptions(football('epl', '2026-11-09T18:00:00Z')), ['AWY', 'Draw', 'HOM']);
});

test('a race poll still offers its entries and an escape hatch', () => {
  const race = event({
    league: 'f1', sport: 'motorsport',
    race: { title: 'Italian Grand Prix', entries: [{ name: 'Leading Driver', position: 1 }, { name: 'Second Driver', position: 2 }] },
  });
  assert.deepEqual(matchPollOptions(race), ['Leading Driver', 'Second Driver', 'Other']);
});
