import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardEspnProxy, dashboardEspnUrl } from '../../src/lib/nfl-basketball-proxy';
import nextConfig from '../../next.config';

const parts = (path: string) => path.split('/');
test('only documented dashboard leagues and endpoints reach the correct fixed ESPN hosts', () => {
  const url = dashboardEspnUrl('site', parts('apis/site/v2/sports/basketball/nba/scoreboard'), new URLSearchParams('limit=100&dates=20261001'));
  assert.equal(url, 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=100&dates=20261001');
  assert.equal(dashboardEspnUrl('web', parts('apis/common/v3/sports/football/nfl/athletes/123'), new URLSearchParams()), 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/123');
  for (const path of ['apis/site/v2/sports/soccer/eng-1/scoreboard', 'apis/site/v2/sports/football/nfl/anything', 'apis/site/v2/sports/football/nfl/teams/../news', 'apis/common/v3/sports/football/nfl/leaders']) {
    assert.equal(dashboardEspnUrl('site', parts(path), new URLSearchParams()), null);
  }
  for (const query of ['limit=1000', 'limit=1&limit=2', 'url=https://evil.test', 'event=../../test', 'toString=x', 'groups=50']) {
    assert.equal(dashboardEspnUrl('site', parts('apis/site/v2/sports/football/nfl/scoreboard'), new URLSearchParams(query)), null);
  }
  // group parameters stay limited to the Division I college scoreboards
  assert.equal(
    dashboardEspnUrl('site', parts('apis/site/v2/sports/basketball/mens-college-basketball/scoreboard'), new URLSearchParams('limit=500&dates=20261110&groups=50')),
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?limit=500&dates=20261110&groups=50'
  );
  assert.equal(
    dashboardEspnUrl('site', parts('apis/site/v2/sports/basketball/womens-college-basketball/scoreboard'), new URLSearchParams('limit=500&groups=50')),
    'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard?limit=500&groups=50'
  );
  for (const query of ['limit=500', 'limit=100&groups=50', 'limit=100&groups=abc']) {
    assert.equal(dashboardEspnUrl('site', parts('apis/site/v2/sports/basketball/nba/scoreboard'), new URLSearchParams(query)), null);
  }
});

test('proxy forwards bounded valid JSON, rejects unexpected paths and handles provider failure', async () => {
  const original = globalThis.fetch;
  const path = parts('apis/site/v2/sports/basketball/nba/scoreboard');
  const request = new Request('https://hyper.co.ke/espn/apis/site/v2/sports/basketball/nba/scoreboard?limit=100');
  try {
    let called = false;
    globalThis.fetch = async (input, init) => {
      called = true;
      assert.match(String(input), /^https:\/\/site\.api\.espn\.com\//);
      assert.equal(init?.redirect, 'error');
      return new Response('{"events":[]}');
    };
    const response = await dashboardEspnProxy(request, 'site', path);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { events: [] }); assert.ok(called);
    called = false;
    assert.equal((await dashboardEspnProxy(request, 'site', ['bad'])).status, 400); assert.equal(called, false);
    globalThis.fetch = async () => new Response('forbidden', { status: 403 });
    assert.equal((await dashboardEspnProxy(request, 'site', path)).status, 403);
    globalThis.fetch = async () => new Response('<html>blocked</html>');
    assert.equal((await dashboardEspnProxy(request, 'site', path)).status, 502);
    globalThis.fetch = async () => new Response('x'.repeat(4 * 1024 * 1024 + 1));
    assert.equal((await dashboardEspnProxy(request, 'site', path)).status, 502);
  } finally { globalThis.fetch = original; }
});

test('nested SPA routes fall back after public assets and sample pages are noindex', async () => {
  const rewrites = await nextConfig.rewrites!();
  assert.ok(!Array.isArray(rewrites));
  assert.ok(rewrites.fallback?.some((rule) => rule.source === '/nfl-basketball/:path*' && rule.destination === '/nfl-basketball/index.html'));
  const headers = await nextConfig.headers!();
  assert.ok(headers.some((rule) => rule.source === '/nfl-basketball/:path*' && rule.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow')));
});
