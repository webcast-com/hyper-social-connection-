import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPORTS_FILTERS, normalizeSportsFilters, readSportsFilters, safeSportsReturnPath, sportsFilterHref, sportsFilterSearch, sportsFiltersFromRecord } from '../../src/lib/sports-filters';

test('full filter and layout state round-trips through a compact shareable URL', () => {
  const filters = normalizeSportsFilters({ sport: 'football', region: 'europe', country: 'England', league: 'epl', status: 'live', date: '2026-10-23', query: 'Home & Away', view: 'cards' });
  const href = sportsFilterHref(filters);
  assert.equal(href, '/sports?sport=football&region=europe&country=England&league=epl&status=live&date=2026-10-23&q=Home+%26+Away&view=cards');
  assert.deepEqual(readSportsFilters(new URL(href, 'https://hyper.co.ke').searchParams), filters);
  assert.equal(sportsFilterSearch(DEFAULT_SPORTS_FILTERS), '');
});
test('compatible country and league selections survive changing sport or region', () => {
  const england = normalizeSportsFilters({ country: 'England', league: 'epl' });
  assert.equal(normalizeSportsFilters({ ...england, sport: 'football' }).country, 'England');
  assert.equal(normalizeSportsFilters({ ...england, sport: 'football' }).league, 'epl');
  const rugby = normalizeSportsFilters({ ...england, sport: 'rugby', region: 'europe' });
  assert.equal(rugby.country, 'England'); assert.equal(rugby.league, 'all');
  const basketball = normalizeSportsFilters({ ...england, sport: 'basketball' });
  assert.equal(basketball.country, 'all'); assert.equal(basketball.league, 'all');
});
test('invalid and incompatible URL filters cannot expose unsupported competitions or remote URLs', () => {
  const filters = readSportsFilters(new URLSearchParams('sport=unknown&region=invalid&country=Neverland&league=https://private.test&status=anything&view=invalid&date=2026-02-30'));
  assert.deepEqual(filters, DEFAULT_SPORTS_FILTERS);
  assert.equal(normalizeSportsFilters({ sport: 'football', region: 'asia', country: 'England', league: 'epl' }).league, 'all');
});
test('removing an individual filter preserves unrelated and compatible filters', () => {
  const filters = normalizeSportsFilters({ sport: 'football', country: 'England', league: 'epl', status: 'live', query: 'Premier', view: 'cards' });
  const next = normalizeSportsFilters({ ...filters, country: 'all' });
  assert.equal(next.country, 'all'); assert.equal(next.league, 'epl');
  assert.equal(next.status, 'live'); assert.equal(next.query, 'Premier'); assert.equal(next.view, 'cards');
});
test('calendar dates are validated and search input is bounded without destroying typing spaces', () => {
  assert.equal(normalizeSportsFilters({ date: '2024-02-29' }).date, '2024-02-29');
  for (const date of ['2026-02-29', '2026-13-01', 'not-a-date', '2026-1-1']) assert.equal(normalizeSportsFilters({ date }).date, 'all');
  assert.equal(normalizeSportsFilters({ query: 'New ' }).query, 'New ');
  assert.equal(normalizeSportsFilters({ query: '\u0000private\n' }).query, 'private');
  assert.equal(normalizeSportsFilters({ query: 'a'.repeat(2000) }).query.length, 160);
});
test('return paths preserve only known, validated local scoreboard context', () => {
  assert.equal(safeSportsReturnPath('/sports?league=epl&view=cards&evil=https://private.test#anything'), '/sports?league=epl&view=cards');
  assert.equal(safeSportsReturnPath('/sports?country=England&sport=football'), '/sports?sport=football&country=England');
  for (const value of [undefined, null, [], '//evil.test/sports', 'https://evil.test/sports', 'javascript:alert(1)', '/settings', '/sports/../settings', '/sports-extra', '/sports\\evil', '/spo\nrts', '/sports?' + 'x'.repeat(2100)]) assert.equal(safeSportsReturnPath(value), '/sports');
});
test('international country names and URL-encoded query text remain safe literal state', () => {
  const filters = readSportsFilters(new URLSearchParams('sport=football&country=International+%2F+multi-country&league=ucl&q=%3Cscript%3E'));
  assert.equal(filters.league, 'ucl'); assert.equal(filters.query, '<script>');
  assert.ok(sportsFilterHref(filters).includes('q=%3Cscript%3E'));
});

test('SSR record parsing and browser URLs use the same first-value rule for repeated parameters', () => {
  const server = sportsFiltersFromRecord({ sport: ['football', 'basketball'], league: ['epl', 'nba'], q: ['Premier', 'Away'], unknown: 'ignored', status: undefined });
  assert.deepEqual(server, readSportsFilters(new URLSearchParams('sport=football&sport=basketball&league=epl&league=nba&q=Premier&q=Away&unknown=ignored')));
  assert.equal(server.league, 'epl');
});
