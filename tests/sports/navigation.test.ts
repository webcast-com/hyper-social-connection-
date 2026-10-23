import { test } from 'node:test';
import assert from 'node:assert/strict';
import { competitionCountry, sportsDate, statisticShare } from '../../src/lib/sports-navigation';
import { SPORTS_COMPETITIONS } from '../../src/lib/sports-catalog';
import { filterSportsEvents, type SportsEvent } from '../../src/lib/sports';

const events: SportsEvent[] = SPORTS_COMPETITIONS.map((item) => ({
  id: item.slug, source: 'espn', league: item.slug, leagueName: item.name, sport: item.kind,
  home: { name: 'Home Club' }, away: { name: 'Away Club' }, status: item.slug === 'epl' ? 'live' : 'upcoming', startAt: '2026-10-22T22:30:00Z',
}));
test('all configured competitions have a geographic area without assigning international leagues to one country', () => {
  assert.ok(SPORTS_COMPETITIONS.every((item) => typeof competitionCountry(item.slug) === 'string'));
  for (const slug of ['ucl', 'caf', 'afc', 'f1', 'super-rugby']) assert.equal(competitionCountry(slug), 'International / multi-country');
  assert.equal(competitionCountry('nba'), 'United States & Canada');
  assert.equal(competitionCountry('mls'), 'United States & Canada');
  assert.equal(competitionCountry('aleague'), 'Australia & New Zealand');
  assert.equal(competitionCountry('unknown'), undefined);
  assert.equal(competitionCountry('constructor'), undefined);
});
test('country, sport, region, competition, status, date and search combine without changing input fixtures', () => {
  const found = filterSportsEvents(events, 'all', { country: 'England', sport: 'football', region: 'europe', league: 'epl', status: 'live', query: 'Premier', date: '2026-10-23' });
  assert.deepEqual(found.map((item) => item.id), ['epl']);
  assert.equal(filterSportsEvents(events, 'all', { country: 'Japan', region: 'europe' }).length, 0);
  assert.equal(events.length, SPORTS_COMPETITIONS.length);
});
test('country search and country grouping preserve domestic versus multi-country coverage', () => {
  assert.deepEqual(filterSportsEvents(events, 'all', { sport: 'football', country: 'England' }).map((item) => item.id), ['epl', 'championship', 'wsl']);
  assert.ok(filterSportsEvents(events, 'all', { query: 'England' }).every((item) => competitionCountry(item.league) === 'England'));
  assert.equal(filterSportsEvents(events, 'all', { country: 'International / multi-country', sport: 'motorsport' })[0].id, 'f1');
});
test('loaded-date filtering uses EAT across UTC midnight and rejects invalid dates', () => {
  assert.equal(sportsDate('2026-10-22T22:30:00Z'), '2026-10-23');
  assert.equal(sportsDate('not a date'), '');
  assert.equal(filterSportsEvents(events, 'all', { date: '2026-10-22' }).length, 0);
  assert.equal(filterSportsEvents(events, 'all', { date: '2026-10-23' }).length, events.length);
});
test('visual stat comparisons require two true reported scalar values of the same unit', () => {
  assert.equal(statisticShare(['0', '5']), 0);
  assert.equal(statisticShare(['51%', '49%']), 51);
  assert.equal(statisticShare(['4', '4']), 50);
  for (const values of [[null, '5'], ['0', '0'], ['4-12', '3-8'], ['51%', '49'], ['-1', '5'], ['', '5'], ['N/A', '5'], ['3']]) assert.equal(statisticShare(values), null);
});
