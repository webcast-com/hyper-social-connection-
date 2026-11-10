import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';
import { ODDS_LEAGUES } from '../../src/lib/espn-odds';
import { EspnEndpointError, espnFailureDetails, espnScoreboardUrl } from '../../src/lib/espn-endpoints';

// Provider namespaces differ from UI labels. Never use football (UI soccer) as an ESPN sport.
const providers = { football: 'soccer', basketball: 'basketball', 'american-football': 'football', baseball: 'baseball', 'ice-hockey': 'hockey', rugby: 'rugby', motorsport: 'racing' };
test('all seven sports and all configured scoreboard routes use the correct Site v2 namespace', () => {
  assert.ok(ESPN_LEAGUES.length > 38);
  assert.equal(new Set(ESPN_LEAGUES.map((league) => league.slug)).size, ESPN_LEAGUES.length);
  assert.equal(new Set(ESPN_LEAGUES.map((league) => `${league.sport}/${league.league}`)).size, ESPN_LEAGUES.length);
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

test('denial metadata is allowlisted, bounded and never includes cookies or arbitrary headers', async () => {
  const { espnResponseMetadata } = await import('../../src/lib/espn-endpoints');
  const headers = new Headers({
    server: 'example\tedge', via: 'v'.repeat(500), 'content-type': 'text/html',
    'x-mitmproxy-blocked-reason': 'OUTBOUND_HOST_DENIED',
    'set-cookie': 'test-private-session', authorization: 'test-private-authorization', 'x-internal-secret': 'test-private-value',
  });
  const metadata = espnResponseMetadata(headers);
  assert.deepEqual(Object.keys(metadata).sort(), ['contentType', 'proxyBlockReason', 'server', 'via']);
  assert.equal(metadata.server, 'example edge');
  assert.equal(metadata.via?.length, 160);
  assert.equal(metadata.proxyBlockReason, 'OUTBOUND_HOST_DENIED');
  assert.ok(!JSON.stringify(metadata).includes('test-private'));
});

test('Sports board requests broader NCAA basketball coverage without changing other scoreboards or odds URLs', async () => {
  const { espnSportsScoreboardUrl } = await import('../../src/lib/espn-endpoints');
  for (const slug of ['ncaam', 'ncaaw']) {
    const league = ESPN_LEAGUES.find((item) => item.slug === slug)!;
    assert.equal(espnSportsScoreboardUrl(league), `${espnScoreboardUrl(league)}?groups=50&limit=500`);
  }
  for (const league of ESPN_LEAGUES.filter((item) => item.slug !== 'ncaam' && item.slug !== 'ncaaw')) {
    assert.equal(espnSportsScoreboardUrl(league), espnScoreboardUrl(league));
  }
});

test('expanded football countries use ESPN identifiers and match/standings allowlists', async () => {
  const { resolveMatch } = await import('../../src/lib/espn-match');
  const { resolveStandings } = await import('../../src/lib/espn-standings');
  const { competitionCountry } = await import('../../src/lib/sports-navigation');
  const { normalizeSportsFilters, sportsFilterSearch, readSportsFilters } = await import('../../src/lib/sports-filters');
  for (const [slug, provider, country, region] of [
    ['kenya', 'ken.1', 'Kenya', 'africa'], ['uganda', 'uga.1', 'Uganda', 'africa'],
    ['nigeria', 'nga.1', 'Nigeria', 'africa'], ['ghana', 'gha.1', 'Ghana', 'africa'],
    ['belgium', 'bel.1', 'Belgium', 'europe'], ['colombia', 'col.1', 'Colombia', 'americas'],
    ['india', 'ind.1', 'India', 'asia'], ['afcon-qualifying', 'caf.nations_qual', 'International / multi-country', 'africa'],
  ]) {
    const item = ESPN_LEAGUES.find((league) => league.slug === slug)!;
    assert.equal(item.league, provider);
    assert.equal(item.region, region);
    assert.equal(competitionCountry(slug), country);
    assert.equal(espnScoreboardUrl(item), `https://site.api.espn.com/apis/site/v2/sports/soccer/${provider}/scoreboard`);
    assert.match(resolveMatch(slug, '123').url, new RegExp(`/soccer/${provider.replaceAll('.', '\\.')}/summary\\?event=123$`));
    assert.ok(resolveStandings(slug).url.includes(`/soccer/${provider}/standings`));
    const filters = normalizeSportsFilters({ sport: 'football', region, country, league: slug });
    assert.equal(filters.league, slug);
    assert.deepEqual(readSportsFilters(new URLSearchParams(sportsFilterSearch(filters))), filters);
    assert.ok(!ODDS_LEAGUES.some((league) => league.slug === slug));
  }
  assert.throws(() => resolveMatch('made-up-league', '123'));
  assert.throws(() => resolveStandings('made-up-league'));
});

test('additional global competitions map to ESPN paths and appropriate country filters', async () => {
  const { resolveMatch } = await import('../../src/lib/espn-match');
  const { resolveStandings } = await import('../../src/lib/espn-standings');
  const { competitionCountry } = await import('../../src/lib/sports-navigation');
  const { normalizeSportsFilters, sportsFilterSearch, readSportsFilters } = await import('../../src/lib/sports-filters');
  const fixtures = [
    ['zambia', 'zam.1', 'Zambia', 'africa'], ['zimbabwe', 'zim.1', 'Zimbabwe', 'africa'],
    ['african-nations-championship', 'caf.championship', 'International / multi-country', 'africa'],
    ['switzerland', 'sui.1', 'Switzerland', 'europe'], ['cyprus', 'cyp.1', 'Cyprus', 'europe'],
    ['german-cup', 'ger.dfb_pokal', 'Germany', 'europe'], ['france-women', 'fra.w.1', 'France', 'europe'],
    ['costa-rica', 'crc.1', 'Costa Rica', 'americas'], ['guatemala', 'gua.1', 'Guatemala', 'americas'],
    ['honduras', 'hon.1', 'Honduras', 'americas'], ['el-salvador', 'slv.1', 'El Salvador', 'americas'],
    ['jamaica', 'jam.1', 'Jamaica', 'americas'], ['bolivia', 'bol.1', 'Bolivia', 'americas'], ['paraguay', 'par.1', 'Paraguay', 'americas'],
    ['venezuela', 'ven.1', 'Venezuela', 'americas'], ['canada-women', 'can.w.nsl', 'Canada', 'americas'],
    ['saudi-kings-cup', 'ksa.kings.cup', 'Saudi Arabia', 'asia'],
    ['asian-cup', 'afc.asian.cup', 'International / multi-country', 'asia'],
    ['aleague-women', 'aus.w.1', 'Australia & New Zealand', 'oceania'],
    ['womens-world-cup', 'fifa.wwc', 'International / multi-country', 'global'],
    ['world-cup-qualifying-ofc', 'fifa.worldq.ofc', 'International / multi-country', 'oceania'],
  ];
  for (const [slug, provider, country, region] of fixtures) {
    const meta = ESPN_LEAGUES.find((item) => item.slug === slug)!;
    assert.equal(meta.league, provider);
    assert.equal(meta.region, region);
    assert.equal(competitionCountry(slug), country);
    assert.equal(espnScoreboardUrl(meta), `https://site.api.espn.com/apis/site/v2/sports/soccer/${provider}/scoreboard`);
    assert.ok(resolveMatch(slug, '123').url.includes(`/soccer/${provider}/summary?event=123`));
    assert.ok(resolveStandings(slug).url.includes(`/soccer/${provider}/standings`));
    const filter = normalizeSportsFilters({ sport: 'football', region, country, league: slug });
    assert.equal(filter.league, slug);
    assert.deepEqual(readSportsFilters(new URLSearchParams(sportsFilterSearch(filter))), filter);
    assert.ok(!ODDS_LEAGUES.some((item) => item.slug === slug));
  }
});
