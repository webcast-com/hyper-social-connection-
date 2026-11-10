import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardHeadTags } from '../../src/lib/dashboard-document';
import {
  DASHBOARD_BASKETBALL, DASHBOARD_BASKETBALL_PLAYERS, DASHBOARD_BASKETBALL_TEAMS, DASHBOARD_COMPETITIONS,
  DASHBOARD_NFL, DASHBOARD_NFL_PLAYERS, DASHBOARD_NFL_TEAMS, DASHBOARD_PLAYERS, DASHBOARD_ROOT, DASHBOARD_TEAMS,
  dashboardSeoFor, dashboardSitemapRoutes,
} from '../../src/lib/dashboard-seo';
import { slugify } from '../../vendor/nfl-nba/src/utils/entities';
import { getSiteUrl } from '../../src/lib/site-url';

test('every dashboard route gets its own indexable title, description and canonical', () => {
  for (const path of [
    DASHBOARD_ROOT, DASHBOARD_BASKETBALL, DASHBOARD_NFL,
    `${DASHBOARD_BASKETBALL}/upcoming`, `${DASHBOARD_NFL}/top-scorers`, `${DASHBOARD_BASKETBALL}/news`,
    `${DASHBOARD_NFL}/team/kansas-city-chiefs`, `${DASHBOARD_BASKETBALL}/team/duke-blue-devils`,
    `${DASHBOARD_BASKETBALL}/player/luka-doncic`, `${DASHBOARD_BASKETBALL}/match/401234567`,
  ]) {
    const seo = dashboardSeoFor(path);
    assert.equal(seo.index, true, `${path} is indexable`);
    // The dashboard root canonicalises to the basketball hub, which is the
    // default view the document shows.
    const expectedCanonical = path === DASHBOARD_ROOT ? getSiteUrl() + DASHBOARD_BASKETBALL : getSiteUrl() + path;
    assert.equal(seo.canonical, expectedCanonical, `${path} canonical`);
    assert.ok(seo.title.length > 0 && seo.title.length < 80, `${path} title length`);
    assert.ok(seo.description.length > 50, `${path} description`);
    assert.ok(seo.keywords.length > 20, `${path} keywords`);
    assert.ok(seo.jsonLd.length >= 1, `${path} structured data`);
  }
});

test('a team or player resolves on the sport that has it, not on the other hub', () => {
  assert.ok(DASHBOARD_NFL_TEAMS.includes('Kansas City Chiefs'), 'the Chiefs are an NFL team');
  assert.ok(!DASHBOARD_BASKETBALL_TEAMS.includes('Kansas City Chiefs'));
  const chiefs = dashboardSeoFor(`${DASHBOARD_NFL}/team/kansas-city-chiefs`);
  assert.match(chiefs.title, /Kansas City Chiefs/);
  assert.ok(chiefs.description.includes('NFL football'), 'the NFL page says NFL football');
  // The basketball hub has no Chiefs page, so it falls back to the hub SEO.
  const wrongSport = dashboardSeoFor(`${DASHBOARD_BASKETBALL}/team/kansas-city-chiefs`);
  assert.equal(wrongSport.canonical, getSiteUrl() + DASHBOARD_BASKETBALL);
  assert.equal(wrongSport.title, dashboardSeoFor(DASHBOARD_BASKETBALL).title);
  const duke = dashboardSeoFor(`${DASHBOARD_BASKETBALL}/team/duke-blue-devils`);
  assert.match(duke.title, /Duke Blue Devils/);
  assert.ok(duke.description.includes('basketball'));
  assert.equal(dashboardSeoFor(`${DASHBOARD_NFL}/team/duke-blue-devils`).canonical, getSiteUrl() + DASHBOARD_NFL);
  assert.equal(dashboardSeoFor(`${DASHBOARD_NFL}/player/luka-doncic`).canonical, getSiteUrl() + DASHBOARD_NFL);
  assert.match(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/player/luka-doncic`).title, /Luka Dončić/);
});

test('hub, team, player and match routes are distinct from each other', () => {
  const titles = [DASHBOARD_BASKETBALL, DASHBOARD_NFL].map((path) => dashboardSeoFor(path).title);
  assert.equal(new Set(titles).size, 2);
  assert.match(dashboardSeoFor(DASHBOARD_BASKETBALL).title, /Basketball/i);
  assert.match(dashboardSeoFor(DASHBOARD_NFL).title, /NFL/i);
  assert.equal(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/team/duke-blue-devils`).title, dashboardSeoFor(`${DASHBOARD_NFL}/team/kansas-city-chiefs`).title.replace('Kansas City Chiefs', 'Duke Blue Devils'));
  assert.notEqual(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/team/duke-blue-devils`).description, dashboardSeoFor(`${DASHBOARD_NFL}/team/kansas-city-chiefs`).description);
  assert.match(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/player/luka-doncic`).title, /Luka Dončić/);
  assert.match(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/match/401234567`).title, /match|scores/i);
  assert.equal(dashboardSeoFor(`${DASHBOARD_ROOT}/unknown-route`).canonical, getSiteUrl() + DASHBOARD_BASKETBALL);
});

test('keywords are built from the competitions, teams and players the dashboard renders', () => {
  const basketball = dashboardSeoFor(DASHBOARD_BASKETBALL).keywords;
  assert.ok(basketball.includes('NBA') && basketball.includes('EuroLeague'));
  assert.ok(DASHBOARD_COMPETITIONS.length > 40);
  assert.ok(DASHBOARD_TEAMS.length > 50);
  assert.ok(DASHBOARD_PLAYERS.length >= 8);
  assert.ok(DASHBOARD_BASKETBALL_TEAMS.length > 10 && DASHBOARD_NFL_TEAMS.length > 10);
  const teams = ['Kansas City Chiefs', 'Boston Celtics', 'Duke Blue Devils'].filter((team) => DASHBOARD_TEAMS.includes(team));
  for (const team of teams) assert.ok(basketball.includes(team), `${team} appears in keywords`);
  assert.ok(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/player/luka-doncic`).keywords.includes('Luka Dončić'));
});

test('head tags carry title, description, keywords, canonical, OG/Twitter and JSON-LD', () => {
  const seo = dashboardSeoFor(DASHBOARD_BASKETBALL);
  const html = dashboardHeadTags(seo);
  assert.match(html, new RegExp(`<title>${seo.title.replace(/&/g, '&amp;')}</title>`));
  assert.match(html, /<meta name="description" content="/);
  assert.match(html, /<meta name="keywords" content="/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${seo.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" />`));
  assert.match(html, /<meta property="og:type" content="website" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.equal((html.match(/application\/ld\+json/g) || []).length, seo.jsonLd.length);
  assert.ok(seo.jsonLd.length >= 3, 'hub pages publish WebPage, breadcrumb and a sports entity');
  for (const entry of seo.jsonLd) assert.ok(!JSON.stringify(entry).includes('<'), 'structured data is escaped');
});

test('sitemap routes are unique, absolute-free and cover both hubs', () => {
  const routes = dashboardSitemapRoutes();
  const paths = routes.map((route) => route.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes(DASHBOARD_BASKETBALL) && paths.includes(DASHBOARD_NFL));
  assert.ok(paths.some((path) => path === `${DASHBOARD_BASKETBALL}/upcoming`));
  assert.ok(paths.some((path) => path.startsWith(`${DASHBOARD_BASKETBALL}/team/`)));
  assert.ok(paths.some((path) => path.startsWith(`${DASHBOARD_NFL}/team/`)));
  // A team or player URL is only listed for the sport that actually has it.
  for (const path of paths.filter((entry) => entry.includes('/team/'))) {
    const key = path.split('/team/')[1];
    assert.ok(path.startsWith(DASHBOARD_BASKETBALL)
      ? DASHBOARD_BASKETBALL_TEAMS.some((team) => slugify(team) === key)
      : DASHBOARD_NFL_TEAMS.some((team) => slugify(team) === key), `${path} belongs to its sport`);
  }
  for (const path of paths.filter((entry) => entry.includes('/player/'))) {
    const key = path.split('/player/')[1];
    assert.ok(path.startsWith(DASHBOARD_BASKETBALL)
      ? DASHBOARD_BASKETBALL_PLAYERS.some((player) => slugify(player) === key)
      : DASHBOARD_NFL_PLAYERS.some((player) => slugify(player) === key), `${path} belongs to its sport`);
  }
  assert.ok(paths.every((path) => path.startsWith(DASHBOARD_ROOT)));
  for (const route of routes) {
    assert.ok(['hourly', 'daily'].includes(route.changeFrequency));
    assert.ok(route.priority > 0 && route.priority <= 1);
  }
});
