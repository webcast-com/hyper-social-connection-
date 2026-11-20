/**
 * What this site asks crawlers to visit, and what date it can honestly claim for a
 * page. Pure rules, so they run under plain node:test without a database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS_DESK } from '../../src/lib/sports-anchor';
import { dashboardSeoFor } from '../../src/lib/dashboard-seo';
import {
  dashboardSitemapEntries, isSubmittableProfile, NO_FRESHNESS, staticSitemapRoutes, type SitemapFreshness,
} from '../../src/lib/sitemap-rules';

const BASE = 'https://hyper.co.ke';
const urls = (freshness?: SitemapFreshness) => staticSitemapRoutes(BASE, freshness).map((row) => row.url);

test('the static routes are the pages that carry content, in the order they were submitted', () => {
  assert.deepEqual(urls(), [
    'https://hyper.co.ke/',
    'https://hyper.co.ke/discover',
    'https://hyper.co.ke/groups',
    'https://hyper.co.ke/sports',
    'https://hyper.co.ke/sports/predictions',
    'https://hyper.co.ke/sports/highlights',
    'https://hyper.co.ke/sports/live',
    'https://hyper.co.ke/about',
    'https://hyper.co.ke/privacy',
  ]);
});

test('forms and the query surface are reachable but no longer submitted', () => {
  const submitted = urls();
  for (const path of ['/login', '/signup', '/search']) {
    assert.ok(!submitted.includes(`${BASE}${path}`), `${path} is not asked for`);
  }
  // Nothing here blocks those pages: they are simply no longer worth a crawl on a
  // domain whose budget is better spent on 667 stored clips and 595 fixtures.
  assert.ok(!submitted.some((url) => url.includes('?')), 'no query string is submitted at all');
});

test('a page is dated by the newest thing it renders, and never by a date this site cannot derive', () => {
  const freshness: SitemapFreshness = {
    newestPost: new Date('2026-11-14T09:00:00.000Z'),
    newestGroup: new Date('2026-10-01T09:00:00.000Z'),
    newestClip: new Date('2026-11-14T02:00:00.000Z'),
  };
  const rows = staticSitemapRoutes(BASE, freshness);
  const modified = (path: string) => {
    const row = rows.find((entry) => entry.url === `${BASE}${path}`);
    return row?.lastModified instanceof Date ? row.lastModified.toISOString() : row?.lastModified;
  };
  assert.equal(modified('/'), '2026-11-14T09:00:00.000Z', 'the feed renders the newest post');
  assert.equal(modified('/discover'), '2026-11-14T09:00:00.000Z');
  assert.equal(modified('/groups'), '2026-10-01T09:00:00.000Z');
  assert.equal(modified('/sports'), '2026-11-14T02:00:00.000Z', 'the boards render the newest stored clip');
  assert.equal(modified('/sports/highlights'), '2026-11-14T02:00:00.000Z');
  // Odds are read live and this site stores no timestamp for them; the about and
  // privacy copy changes when a person edits it, which is not in the data either.
  assert.equal(modified('/sports/predictions'), undefined, 'no stored instant to report');
  // The streamed fixtures are read live too: submitted, but with no date claimed.
  assert.equal(modified('/sports/live'), undefined);
  assert.equal(modified('/about'), undefined);
  assert.equal(modified('/privacy'), undefined);
});

test('with nothing stored, no static route carries a modification date', () => {
  assert.deepEqual(staticSitemapRoutes(BASE, NO_FRESHNESS).map((row) => row.lastModified), [
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
  ]);
  // The default is the same as saying there is nothing: a route that asks for no
  // freshness must not invent any.
  assert.deepEqual(staticSitemapRoutes(BASE).map((row) => row.lastModified), staticSitemapRoutes(BASE, NO_FRESHNESS).map((row) => row.lastModified));
});

test('the sports desk is not a person to ask a crawler about', () => {
  assert.equal(isSubmittableProfile({ email: SPORTS_DESK.email }), false);
  // Uppercase or padded, it is the same account.
  assert.equal(isSubmittableProfile({ email: `  ${SPORTS_DESK.email.toUpperCase()} ` }), false);
});

test('the seeded demo accounts are not people either', () => {
  for (const email of ['alex@example.com', 'maya@example.com', 'jordan@EXAMPLE.COM', 'someone@example.org', 'someone@example.net']) {
    assert.equal(isSubmittableProfile({ email }), false, email);
  }
});

test('a member is submitted, and so is an account this rule cannot identify', () => {
  assert.equal(isSubmittableProfile({ email: 'wanjiru@gmail.com' }), true);
  assert.equal(isSubmittableProfile({ email: 'desk@hyper.co.ke' }), true, 'only the desk address itself is excluded');
  // Exclusion needs positive evidence: dropping a real member's page is a worse
  // mistake than listing one account that should not have been there.
  assert.equal(isSubmittableProfile({ email: null }), true);
  assert.equal(isSubmittableProfile({ email: '' }), true);
  assert.equal(isSubmittableProfile({}), true);
  assert.equal(isSubmittableProfile(null), false, 'nothing to identify is nothing to submit');
});

test('every dashboard URL submitted is a page that is served, indexable and its own canonical', () => {
  const rows = dashboardSitemapEntries(BASE);
  // Two hubs, six sections, and the team pages that load from a live feed.
  assert.ok(rows.length >= 80 && rows.length <= 120, `${rows.length} dashboard URLs`);
  assert.equal(new Set(rows.map((row) => row.url)).size, rows.length, 'each once');
  for (const row of rows) {
    const url = new URL(row.url);
    assert.ok(url.pathname.startsWith('/nfl-basketball/'), row.url);
    assert.equal(url.search, '', `${row.url} carries no query`);
    // Submitting a URL that 404s, is noindex, or points elsewhere as canonical
    // spends crawl budget to be told the page is not wanted.
    const seo = dashboardSeoFor(url.pathname);
    assert.equal(seo.status, 200, `${row.url} is served`);
    assert.equal(seo.index, true, `${row.url} is indexable`);
    assert.equal(seo.canonical, row.url, `${row.url} is its own canonical`);
    // Nothing this site stores says when a scores page last changed.
    assert.equal(row.lastModified, undefined, `${row.url} claims no date`);
  }
  const of = (path: string) => rows.find((row) => row.url === `${BASE}/nfl-basketball${path}`);
  assert.deepEqual(of('/basketball'), { url: `${BASE}/nfl-basketball/basketball`, changeFrequency: 'hourly', priority: 0.8 });
  assert.deepEqual(of('/nfl/upcoming'), { url: `${BASE}/nfl-basketball/nfl/upcoming`, changeFrequency: 'hourly', priority: 0.6 });
  assert.deepEqual(of('/nfl/team/kansas-city-chiefs'), { url: `${BASE}/nfl-basketball/nfl/team/kansas-city-chiefs`, changeFrequency: 'daily', priority: 0.5 });
});

test('dashboard pages that could only show sample data, or are no page at all, are not submitted', () => {
  const submitted = new Set(dashboardSitemapEntries(BASE).map((row) => row.url.slice(BASE.length)));
  for (const path of [
    '/nfl-basketball', // redirects to the basketball hub
    '/nfl-basketball/basketball/team/nairobi-city-thunder', // a league with no feed
    '/nfl-basketball/basketball/team/BOS', // an alias of the Celtics' page
    '/nfl-basketball/basketball/player/luka-doncic',
    '/nfl-basketball/basketball/match/1',
    '/nfl-basketball/cricket',
  ]) assert.ok(!submitted.has(path), `${path} is not submitted`);
  assert.ok(![...submitted].some((path) => path.includes('/match/') || path.includes('/player/')));
});
