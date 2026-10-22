import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';
import { ODDS_LEAGUES } from '../../src/lib/espn-odds';
import { EspnEndpointError, espnFailureDetails, espnScoreboardUrl } from '../../src/lib/espn-endpoints';

// Provider namespaces differ from UI labels. Never use football (UI soccer) as an ESPN sport.
const providers = { football: 'soccer', basketball: 'basketball', 'american-football': 'football', baseball: 'baseball', 'ice-hockey': 'hockey', rugby: 'rugby', motorsport: 'racing' };
test('all seven sports and all 38 scoreboard routes use the correct Site v2 namespace', () => {
  assert.equal(ESPN_LEAGUES.length, 38);
  for (const league of ESPN_LEAGUES) {
    assert.equal(league.sport, providers[league.kind as keyof typeof providers]);
    assert.equal(espnScoreboardUrl(league), `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard`);
  }
});
test('rugby labels use their documented competition IDs, not Six Nations/World Cup IDs', () => {
  assert.equal(ESPN_LEAGUES.find((league) => league.slug === 'prem-rugby')?.league, '267979');
  assert.equal(ESPN_LEAGUES.find((league) => league.slug === 'super-rugby')?.league, '242041');
});
test('all 37 odds routes reuse scoreboard URLs for the matching competition, including dated searches', () => {
  assert.equal(ODDS_LEAGUES.length, 37);
  for (const league of ODDS_LEAGUES) {
    const source = ESPN_LEAGUES.find((item) => `${item.sport}/${item.league}` === league.path)!;
    assert.ok(source);
    assert.equal(espnScoreboardUrl(league), espnScoreboardUrl(source));
    assert.equal(espnScoreboardUrl(league, '20261023'), `${espnScoreboardUrl(source)}?dates=20261023&limit=100`);
  }
});
test('invalid paths/dates cannot turn scoreboard construction into arbitrary endpoint requests', () => {
  for (const path of ['https://attacker.test/path', '../basketball/nba', 'football/nfl/../../other', 'basketball/nba?bad=1']) {
    assert.throws(() => espnScoreboardUrl({ path }), /Invalid ESPN scoreboard path/);
  }
  assert.throws(() => espnScoreboardUrl({ path: 'soccer/eng.1' }, '2026-10-23'), /YYYYMMDD/);
});
test('HTTP 404 is reported separately from failures without any HTTP response', () => {
  const url = espnScoreboardUrl(ESPN_LEAGUES[0]);
  const http = espnFailureDetails(new EspnEndpointError('ESPN HTTP 404', url, 'http', 404), url);
  assert.equal(http.httpStatus, 404);
  assert.equal(http.errorKind, 'http');
  assert.equal(http.url, url);
  const reset = espnFailureDetails(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }), url);
  assert.equal(reset.httpStatus, null);
  assert.equal(reset.errorKind, 'network');
  assert.match(reset.error, /ECONNRESET/);
  assert.equal(espnFailureDetails(new DOMException('Aborted', 'TimeoutError'), url).errorKind, 'timeout');
});
