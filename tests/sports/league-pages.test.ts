import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS_LEAGUE_PAGES } from '../../src/lib/sports-league-pages';
import { readSportsFilters, scopeLeagueFilters, sportsFilterHref, safeSportsReturnPath } from '../../src/lib/sports-filters';

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

test('the retired league routes point at the dashboard route that owns the competition', () => {
  assert.equal(SPORTS_LEAGUE_PAGES.nba.dashboardPath, '/nfl-basketball/basketball');
  assert.equal(SPORTS_LEAGUE_PAGES.nfl.dashboardPath, '/nfl-basketball/nfl');
  for (const league of ['nba', 'nfl'] as const) {
    const page = SPORTS_LEAGUE_PAGES[league];
    assert.equal(page.path, `/sports/${league}`);
    assert.ok(page.description.includes(league === 'nba' ? 'basketball' : 'football'), `${league} description mentions its sport`);
    assert.ok(page.description.includes('dashboard'), `${league} description mentions the dashboard`);
  }
});
