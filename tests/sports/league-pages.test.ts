import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS_LEAGUE_PAGES, scopeLeagueBoard } from '../../src/lib/sports-league-pages';
import { readSportsFilters, scopeLeagueFilters, sportsFilterHref, safeSportsReturnPath } from '../../src/lib/sports-filters';
import type { SportsBoard } from '../../src/lib/sports';

test('NBA/NFL route filters lock the competition but preserve validated display controls', () => {
  for (const league of ['nba', 'nfl'] as const) {
    const filters = scopeLeagueFilters(readSportsFilters(new URLSearchParams('sport=football&league=epl&country=England&region=europe&status=final&date=2026-10-23&q=Home&view=cards')), league);
    assert.equal(filters.league, league); assert.equal(filters.sport, SPORTS_LEAGUE_PAGES[league].sport);
    assert.equal(filters.country, 'all'); assert.equal(filters.region, 'all');
    assert.equal(sportsFilterHref(filters, league), `/sports/${league}?status=final&date=2026-10-23&q=Home&view=cards`);
    assert.equal(sportsFilterHref(scopeLeagueFilters(readSportsFilters(new URLSearchParams()), league), league), `/sports/${league}`);
  }
});
test('dedicated-page return links permit only exact known paths and normalized filters', () => {
  assert.equal(safeSportsReturnPath('/sports/nba?league=nfl&sport=football&status=live&view=cards&evil=x#fragment'), '/sports/nba?status=live&view=cards');
  assert.equal(safeSportsReturnPath('/sports/nfl?q=Home&date=2026-10-23'), '/sports/nfl?date=2026-10-23&q=Home');
  for (const path of ['/sports/nba/secret', '/sports/nfl/', '/sports/nhl', '//evil.test/sports/nba', '/sports/nba%2f..', '/sports/nba\n']) assert.equal(safeSportsReturnPath(path), '/sports');
});
test('league scoping isolates fixtures, live status and diagnostics without changing the shared board', () => {
  const board: SportsBoard = { mode: 'partial', fetchedAt: '2026-10-23T18:00:00Z', predictions: [],
    sources: [{ id: 'espn:nba', ok: true, count: 0 }, { id: 'espn:nfl', ok: false, count: 0, httpStatus: 403 }],
    events: [{ id: '1', sport: 'basketball', league: 'nba', leagueName: 'NBA', status: 'live', source: 'espn', startAt: '2026-10-23T18:00:00Z', home: { name: 'Home' }, away: { name: 'Away' } }] };
  const nba = scopeLeagueBoard(board, 'nba'); assert.equal(nba.mode, 'live'); assert.equal(nba.events.length, 1); assert.equal(nba.sources.length, 1);
  const nfl = scopeLeagueBoard(board, 'nfl'); assert.equal(nfl.mode, 'partial'); assert.equal(nfl.events.length, 0); assert.equal(nfl.sources[0].httpStatus, 403);
  assert.equal(board.events.length, 1); assert.equal(board.sources.length, 2);
  assert.equal(scopeLeagueBoard({ ...board, mode: 'demo' }, 'nba').mode, 'demo');
  assert.equal(scopeLeagueBoard({ ...board, sources: [] }, 'nba').mode, 'partial');
});
