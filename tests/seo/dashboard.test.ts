import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardBodyContent, dashboardDocumentHeaders, dashboardHeadTags } from '../../src/lib/dashboard-document';
import {
  DASHBOARD_BASKETBALL, DASHBOARD_BASKETBALL_TEAMS, DASHBOARD_COMPETITIONS, DASHBOARD_KEYWORDS,
  DASHBOARD_NFL, DASHBOARD_NFL_TEAMS, DASHBOARD_PLAYERS, DASHBOARD_ROOT, DASHBOARD_TEAMS,
  dashboardRobots, dashboardSeoFor, dashboardSitemapRoutes,
} from '../../src/lib/dashboard-seo';
import { getSiteUrl } from '../../src/lib/site-url';

const site = getSiteUrl();
const INDEXED = [
  DASHBOARD_BASKETBALL, DASHBOARD_NFL,
  `${DASHBOARD_BASKETBALL}/upcoming`, `${DASHBOARD_BASKETBALL}/top-scorers`, `${DASHBOARD_BASKETBALL}/news`,
  `${DASHBOARD_NFL}/upcoming`, `${DASHBOARD_NFL}/top-scorers`, `${DASHBOARD_NFL}/news`,
  `${DASHBOARD_NFL}/team/kansas-city-chiefs`, `${DASHBOARD_BASKETBALL}/team/duke-blue-devils`,
  `${DASHBOARD_BASKETBALL}/team/milwaukee-bucks`, `${DASHBOARD_BASKETBALL}/match/401234567`,
];

test('every page of the dashboard has a title, description and canonical of its own', () => {
  const pages = INDEXED.map((path) => ({ path, seo: dashboardSeoFor(path) }));
  for (const { path, seo } of pages) {
    assert.equal(seo.status, 200, `${path} is served`);
    assert.equal(seo.index, true, `${path} is indexable`);
    assert.equal(seo.canonical, site + path, `${path} names itself as canonical`);
    assert.ok(seo.title.endsWith(' | Hyper'), `${path} title carries the site name`);
    assert.ok(seo.title.length <= 75, `${path} title length (${seo.title.length})`);
    assert.ok(seo.description.length >= 70 && seo.description.length <= 170, `${path} description length (${seo.description.length})`);
    assert.ok(seo.jsonLd.length >= 2, `${path} structured data`);
  }
  for (const field of ['title', 'description', 'canonical', 'heading'] as const) {
    assert.equal(new Set(pages.map(({ seo }) => seo[field])).size, pages.length, `every ${field} is different`);
  }
});

test('keywords are a short list about the page, not the whole catalogue', () => {
  // Every page used to carry the same 2,600 characters naming every team.
  for (const path of INDEXED) {
    const keywords = dashboardSeoFor(path).keywords.split(', ');
    assert.ok(keywords.length >= 3 && keywords.length <= 12, `${path} has ${keywords.length} keywords`);
    assert.equal(new Set(keywords).size, keywords.length, `${path} repeats no keyword`);
  }
  assert.ok(dashboardSeoFor(`${DASHBOARD_NFL}/team/kansas-city-chiefs`).keywords.includes('Kansas City Chiefs'));
  assert.ok(!dashboardSeoFor(`${DASHBOARD_NFL}/team/kansas-city-chiefs`).keywords.includes('Boston Celtics'));
  // The name lists the rest of the site builds its own keywords from are unchanged.
  assert.ok(DASHBOARD_COMPETITIONS.length > 40 && DASHBOARD_TEAMS.length > 50 && DASHBOARD_PLAYERS.length >= 8);
  assert.ok(DASHBOARD_BASKETBALL_TEAMS.includes('Duke Blue Devils') && DASHBOARD_NFL_TEAMS.includes('Kansas City Chiefs'));
  assert.ok(DASHBOARD_KEYWORDS.includes('NBA') && DASHBOARD_KEYWORDS.includes('Kansas City Chiefs'));
});

test('an address the dashboard has no page for is a 404 with no canonical', () => {
  for (const path of [
    `${DASHBOARD_ROOT}/unknown-route`,
    `${DASHBOARD_BASKETBALL}/team/kansas-city-chiefs`, // a team of the other sport
    `${DASHBOARD_NFL}/team/duke-blue-devils`,
    `${DASHBOARD_NFL}/player/luka-doncic`,
    `${DASHBOARD_BASKETBALL}/team/not-a-team`,
    `${DASHBOARD_BASKETBALL}/match/not-an-id`,
    `${DASHBOARD_BASKETBALL}/standings`,
    '/somewhere-else',
  ]) {
    const seo = dashboardSeoFor(path);
    assert.equal(seo.status, 404, `${path} is not found`);
    assert.equal(seo.index, false, `${path} is not indexable`);
    assert.equal(seo.canonical, null, `${path} names no canonical`);
    assert.deepEqual(seo.jsonLd, [], `${path} publishes no structured data`);
    assert.equal(seo.keywords, '');
    assert.match(seo.title, /not found/i);
    assert.equal(dashboardRobots(seo), 'noindex, follow');
    assert.equal(dashboardDocumentHeaders(seo)['x-robots-tag'], 'noindex, follow');
    assert.match(dashboardHeadTags(seo), /<meta name="robots" content="noindex, follow" data-route-meta \/>/);
    assert.ok(!dashboardHeadTags(seo).includes('rel="canonical"'));
    assert.ok(!dashboardHeadTags(seo).includes('og:url'));
    // It still leads somewhere.
    assert.ok(seo.links.some((link) => link.href === DASHBOARD_BASKETBALL || link.href === DASHBOARD_NFL), `${path} links to a hub`);
  }
});

test('a page that exists but can only show sample data is served and kept out of the index', () => {
  for (const path of [
    `${DASHBOARD_BASKETBALL}/match/1`, // a bundled sample fixture with an invented score
    `${DASHBOARD_BASKETBALL}/team/nairobi-city-thunder`, // a league with no data feed
    `${DASHBOARD_BASKETBALL}/player/luka-doncic`, // no ESPN profile to load
    `${DASHBOARD_ROOT}/cricket`, // a "coming soon" screen
  ]) {
    const seo = dashboardSeoFor(path);
    assert.equal(seo.status, 200, `${path} is served`);
    assert.equal(seo.index, false, `${path} is not indexable`);
    assert.equal(seo.canonical, site + path, `${path} still names itself`);
    assert.deepEqual(seo.jsonLd, []);
    assert.equal(dashboardDocumentHeaders(seo)['x-robots-tag'], 'noindex, follow');
  }
  assert.match(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/player/luka-doncic`).title, /^Luka Dončić — /);
});

test('other addresses of a page point at the one that is the page', () => {
  const celtics = `${site}${DASHBOARD_BASKETBALL}/team/boston-celtics`;
  assert.equal(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/team/BOS`).canonical, celtics);
  assert.equal(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/team/boston-celtics/`).canonical, celtics);
  // The entry URL shows the basketball hub (and the route handler redirects there).
  assert.equal(dashboardSeoFor(DASHBOARD_ROOT).canonical, site + DASHBOARD_BASKETBALL);
  assert.equal(dashboardSeoFor(`${DASHBOARD_ROOT}/`).canonical, site + DASHBOARD_BASKETBALL);
  // Tracking parameters never reach a canonical; a competition does only when it
  // changes which game the page shows.
  const match = `${DASHBOARD_BASKETBALL}/match/401234567`;
  assert.equal(dashboardSeoFor(match, '?utm_source=x&competition=nba').canonical, site + match);
  assert.equal(dashboardSeoFor(match, '?competition=ncaam&utm_source=x').canonical, `${site}${match}?competition=ncaam`);
  assert.equal(dashboardSeoFor(match, '?competition=ncaam').path, `${match}?competition=ncaam`);
  assert.equal(dashboardSeoFor(match, '?competition=cfb').index, false, 'a football competition is no basketball page');
  assert.equal(dashboardSeoFor(`${DASHBOARD_BASKETBALL}/upcoming`, '?ref=home').canonical, `${site}${DASHBOARD_BASKETBALL}/upcoming`);
});

test('structured data says only what the server knows', () => {
  const types = (path: string, search = '') => dashboardSeoFor(path, search).jsonLd.map((entry) => (entry as { '@type': string })['@type']);
  assert.deepEqual(types(DASHBOARD_BASKETBALL), ['CollectionPage', 'BreadcrumbList', 'ItemList']);
  assert.deepEqual(types(`${DASHBOARD_NFL}/team/kansas-city-chiefs`), ['WebPage', 'BreadcrumbList', 'SportsTeam']);
  assert.deepEqual(types(`${DASHBOARD_BASKETBALL}/news`), ['WebPage', 'BreadcrumbList']);
  // A match is a page and a breadcrumb: no SportsEvent without a date and two teams.
  assert.deepEqual(types(`${DASHBOARD_BASKETBALL}/match/401234567`), ['WebPage', 'BreadcrumbList']);

  const [page, trail, team] = dashboardSeoFor(`${DASHBOARD_NFL}/team/kansas-city-chiefs`).jsonLd as Record<string, unknown>[];
  const url = `${site}${DASHBOARD_NFL}/team/kansas-city-chiefs`;
  assert.equal(page.url, url);
  assert.deepEqual(page.mainEntity, { '@id': `${url}#team` });
  assert.equal(team['@id'], `${url}#team`);
  assert.equal(team.name, 'Kansas City Chiefs');
  assert.equal(team.sport, 'American Football');
  assert.deepEqual(team.memberOf, { '@type': 'SportsOrganization', name: 'NFL' });
  const items = trail.itemListElement as { position: number; name: string; item: string }[];
  assert.deepEqual(items.map((item) => item.name), ['Hyper', 'Sports', 'NFL', 'Kansas City Chiefs']);
  assert.deepEqual(items.map((item) => item.position), [1, 2, 3, 4]);
  assert.equal(items[0].item, `${site}/`);
  assert.equal(items[3].item, url);

  // The hub's list is of pages that are themselves indexable.
  const list = dashboardSeoFor(DASHBOARD_BASKETBALL).jsonLd[2] as { numberOfItems: number; itemListElement: { url: string }[] };
  assert.equal(list.itemListElement.length, list.numberOfItems);
  assert.ok(list.numberOfItems > 40);
  for (const item of list.itemListElement) {
    const seo = dashboardSeoFor(new URL(item.url).pathname);
    assert.equal(seo.index, true, `${item.url} is indexable`);
    assert.equal(seo.canonical, item.url, `${item.url} is its own canonical`);
  }
});

test('head tags carry the title, description, canonical, sharing tags and structured data', () => {
  const seo = dashboardSeoFor(`${DASHBOARD_BASKETBALL}/team/boston-celtics`);
  const html = dashboardHeadTags(seo);
  assert.ok(html.includes('<title>Boston Celtics — Scores, Fixtures, Squad &amp; Standings | Hyper</title>'));
  assert.ok(html.includes(`<meta name="description" content="${seo.description}" />`));
  assert.ok(html.includes(`<link rel="canonical" href="${seo.canonical}" />`));
  assert.ok(html.includes(`<meta property="og:url" content="${seo.canonical}" />`));
  assert.ok(html.includes('<meta property="og:site_name" content="Hyper" />'));
  assert.ok(html.includes(`<meta property="og:image" content="${site}/og-image.png" />`));
  assert.ok(html.includes('<meta property="og:image:width" content="1200" />'));
  assert.ok(html.includes('<meta property="og:image:alt" content="Boston Celtics" />'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image" />'));
  assert.ok(html.includes(`<meta name="twitter:image" content="${site}/og-image.png" />`));
  // An indexable page carries no robots tag; the header says the rest.
  assert.ok(!html.includes('name="robots"'));
  assert.equal(dashboardDocumentHeaders(seo)['x-robots-tag'], 'index, follow, max-image-preview:large');
  assert.equal((html.match(/application\/ld\+json/g) ?? []).length, seo.jsonLd.length);
  assert.equal((html.match(/data-route="\/nfl-basketball\/basketball\/team\/boston-celtics"/g) ?? []).length, seo.jsonLd.length);
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/g)) {
    assert.ok(!json.includes('<'), 'structured data cannot close its own script tag');
    assert.doesNotThrow(() => JSON.parse(json));
  }
});

test('the document body names the page and links onward before the app starts', () => {
  const hub = dashboardSeoFor(DASHBOARD_BASKETBALL);
  const body = dashboardBodyContent(hub);
  assert.equal((body.match(/<h1>/g) ?? []).length, 1);
  assert.ok(body.includes('<h1>Basketball live scores, fixtures and standings</h1>'));
  assert.ok(body.includes(`<p>${hub.description}</p>`));
  assert.ok(body.includes('<nav aria-label="Breadcrumb"><ol><li><a href="/">Hyper</a></li><li><a href="/sports">Sports</a></li><li aria-current="page">Basketball</li></ol></nav>'));
  for (const href of [`${DASHBOARD_BASKETBALL}/upcoming`, `${DASHBOARD_BASKETBALL}/top-scorers`, `${DASHBOARD_BASKETBALL}/news`, DASHBOARD_NFL, `${DASHBOARD_BASKETBALL}/team/boston-celtics`]) {
    assert.ok(body.includes(`<a href="${href}">`), `the hub links to ${href}`);
  }
  // Words about the page only: the server knows no score, and writes none.
  assert.ok(!/\d+\s*[-–]\s*\d+/.test(body.replace(/<[^>]+>/g, ' ')), 'no score in the pre-rendered body');

  // Every link the server writes leads to a page that is served.
  for (const path of [...INDEXED, `${DASHBOARD_ROOT}/nope`, `${DASHBOARD_ROOT}/cricket`, `${DASHBOARD_BASKETBALL}/match/1`]) {
    const seo = dashboardSeoFor(path);
    assert.ok(seo.links.length > 0 && seo.links.length <= 80, `${path} has ${seo.links.length} links`);
    for (const link of seo.links) assert.equal(dashboardSeoFor(link.href).status, 200, `${path} → ${link.href}`);
    for (const crumb of seo.crumbs.slice(2)) assert.equal(dashboardSeoFor(crumb.href).status, seo.status === 404 && crumb.href === seo.path ? 404 : 200, `${path} crumb ${crumb.href}`);
  }
  // Text is escaped on its way into the document.
  const escaped = dashboardBodyContent({ ...hub, heading: 'A & B <script>', description: '"quoted" <b>' });
  assert.ok(escaped.includes('<h1>A &amp; B &lt;script&gt;</h1>'));
  assert.ok(escaped.includes('<p>&quot;quoted&quot; &lt;b&gt;</p>'));
});

test('a preview deployment is never indexed, whatever the page', () => {
  const before = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    const seo = dashboardSeoFor(DASHBOARD_BASKETBALL);
    assert.equal(dashboardRobots(seo), 'noindex, nofollow');
    assert.equal(dashboardDocumentHeaders(seo)['x-robots-tag'], 'noindex, nofollow');
    assert.match(dashboardHeadTags(seo), /<meta name="robots" content="noindex, nofollow" data-route-meta \/>/);
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = before;
  }
});

test('the list a sitemap would use is exactly the indexable team, section and hub pages', () => {
  const routes = dashboardSitemapRoutes();
  const paths = routes.map((route) => route.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const path of [DASHBOARD_BASKETBALL, DASHBOARD_NFL, `${DASHBOARD_BASKETBALL}/upcoming`, `${DASHBOARD_NFL}/news`, `${DASHBOARD_NFL}/team/kansas-city-chiefs`]) {
    assert.ok(paths.includes(path), `${path} is listed`);
  }
  assert.ok(!paths.includes(DASHBOARD_ROOT), 'the entry URL redirects');
  assert.ok(!paths.includes(`${DASHBOARD_BASKETBALL}/team/nairobi-city-thunder`), 'a sample-only team is not listed');
  assert.ok(!paths.some((path) => path.includes('/match/')), 'matches come and go');
  for (const route of routes) {
    const seo = dashboardSeoFor(route.path);
    assert.equal(seo.index, true, `${route.path} is indexable`);
    assert.equal(seo.canonical, site + route.path, `${route.path} is its own canonical`);
    assert.ok(['hourly', 'daily'].includes(route.changeFrequency));
    assert.ok(route.priority > 0 && route.priority <= 1);
  }
});
