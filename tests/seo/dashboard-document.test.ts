import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { dashboardDocumentHtml } from '../../src/lib/dashboard-document';
import { DASHBOARD_BASKETBALL, DASHBOARD_NFL, dashboardSeoFor } from '../../src/lib/dashboard-seo';
import { getSiteUrl } from '../../src/lib/site-url';
import { GET as rootRoute } from '../../src/app/nfl-basketball/route';
import { GET as basketballHub } from '../../src/app/nfl-basketball/basketball/route';
import { GET as nflHub } from '../../src/app/nfl-basketball/nfl/route';
import { GET as basketballPage } from '../../src/app/nfl-basketball/basketball/[...path]/route';
import { GET as nflPage } from '../../src/app/nfl-basketball/nfl/[...path]/route';
import { GET as otherPage } from '../../src/app/nfl-basketball/[...path]/route';
import { builtDashboardDocument, count, headValue } from './document-fixture';

/**
 * These run the real rewriting over the built dashboard document, and the real
 * route handlers. Nothing listens on the origin below, so the handlers read the
 * built document from `public/` — as they do when the app cannot fetch itself.
 */
const ORIGIN = 'http://127.0.0.1:9';
const site = getSiteUrl();
const TITLE = /<title>([^<]*)<\/title>/;
const CANONICAL = /<link rel="canonical" href="([^"]*)"/;
const ROBOTS = /<meta name="robots" content="([^"]*)"/;

const rendered = async (pathname: string, search = '') => dashboardDocumentHtml(await builtDashboardDocument(), dashboardSeoFor(pathname, search));

async function request(pathname: string) {
  const url = new URL(pathname, ORIGIN);
  const segments = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);
  const req = new NextRequest(url);
  let response: Response;
  if (segments.length === 0) response = rootRoute();
  else if (segments[0] === 'basketball' && segments.length === 1) response = await basketballHub(req);
  else if (segments[0] === 'nfl' && segments.length === 1) response = await nflHub(req);
  else if (segments[0] === 'basketball') response = await basketballPage(req, { params: Promise.resolve({ path: segments.slice(1) }) });
  else if (segments[0] === 'nfl') response = await nflPage(req, { params: Promise.resolve({ path: segments.slice(1) }) });
  else response = await otherPage(req, { params: Promise.resolve({ path: segments }) });
  return { response, html: response.status === 308 ? '' : await response.text() };
}

test('the app document keeps its root element, styles and scripts after injection', async () => {
  const built = await builtDashboardDocument();
  const html = await rendered(DASHBOARD_BASKETBALL);
  assert.match(html, /<html lang="en">/);
  assert.equal(count(html, /<script type="module"/g), 1, 'the bundle script is neither lost nor duplicated');
  assert.match(html, /<script type="module"[^>]*src="\/nfl-basketball\/assets\/index-[^"]*\.js"/);
  assert.match(html, /<link rel="stylesheet"[^>]*href="\/nfl-basketball\/assets\/index-[^"]*\.css"/);
  assert.equal(count(html, /<div id="root">/g), 1);
  for (const tag of ['<title>', '<meta name="description"', '<link rel="canonical"', '<meta name="viewport"', '<meta charset']) {
    assert.equal(count(html, new RegExp(tag, 'g')), 1, `exactly one ${tag}`);
  }
  assert.ok(!html.includes(headValue(built, TITLE)!), 'the built document title is replaced');
  // The file is also reachable at its own address, as an unlabelled copy of the
  // hub: there it asks not to be indexed, and the tag never reaches a served page.
  assert.equal(headValue(built, ROBOTS), 'noindex, follow');
  assert.equal(headValue(html, ROBOTS), null);
  assert.equal(count(html, /<meta name="robots"/g), 0);
  // Everything is inside the head or the root element: nothing lands after </html>.
  assert.ok(html.indexOf('application/ld+json') < html.indexOf('</head>'));
  // The title comes before the stylesheet and the script that follow it in the build.
  assert.ok(html.indexOf('<title>') < html.indexOf('<script type="module"'));
  assert.ok(html.indexOf('<meta charset') < html.indexOf('<title>'));
  // A build with no title of its own still gets the route's tags.
  const untitled = dashboardDocumentHtml(built.replace(/<title>[^<]*<\/title>/, ''), dashboardSeoFor(DASHBOARD_BASKETBALL));
  assert.equal(count(untitled, /<title>/g), 1);
  assert.equal(headValue(untitled, CANONICAL), `${site}${DASHBOARD_BASKETBALL}`);
  assert.ok(html.trimEnd().endsWith('</html>'));
});

test('the root element holds the page headline, description and links, and nothing else changes in the body', async () => {
  const seo = dashboardSeoFor(`${DASHBOARD_NFL}/team/kansas-city-chiefs`);
  const html = await rendered(`${DASHBOARD_NFL}/team/kansas-city-chiefs`);
  const body = html.slice(html.indexOf('<body>'));
  assert.equal(count(body, /<h1>/g), 1);
  assert.ok(body.includes('<div id="root"><div class="sh-prerender">'));
  assert.ok(body.includes('<h1>Kansas City Chiefs</h1>'));
  assert.ok(body.includes(`<p>${seo.description}</p>`));
  assert.ok(body.includes(`<li><a href="${DASHBOARD_NFL}">NFL</a></li><li aria-current="page">Kansas City Chiefs</li>`));
  assert.ok(body.includes(`<a href="${DASHBOARD_NFL}/upcoming">`));
  // The app renders into the same element with createRoot, which replaces it.
  assert.match(body, /<div id="root"><div class="sh-prerender">[\s\S]*<\/div><\/div>\s*<\/body>/);
});

test('each route produces its own document from the same build', async () => {
  const basketball = await rendered(DASHBOARD_BASKETBALL);
  const nfl = await rendered(DASHBOARD_NFL);
  const news = await rendered(`${DASHBOARD_NFL}/news`);
  assert.equal(headValue(basketball, TITLE), 'Basketball Scores — NBA, WNBA, EuroLeague &amp; NCAA Live Scores | Hyper');
  assert.equal(headValue(nfl, TITLE), 'NFL Scores — Live American Football Scores, Standings &amp; Fixtures | Hyper');
  assert.equal(headValue(news, TITLE), 'NFL News — Headlines, Match Reports &amp; Previews | Hyper');
  assert.equal(headValue(basketball, CANONICAL), `${site}${DASHBOARD_BASKETBALL}`);
  assert.equal(headValue(news, CANONICAL), `${site}${DASHBOARD_NFL}/news`);
  assert.equal(headValue(news, ROBOTS), null);
  // A name with a "$" in it is written as itself, not read as a replacement pattern.
  const odd = dashboardDocumentHtml(await builtDashboardDocument(), { ...dashboardSeoFor(DASHBOARD_NFL), title: "Cash $& $1 $' | Hyper", heading: "$& $`" });
  assert.equal(headValue(odd, TITLE), "Cash $&amp; $1 $' | Hyper");
  assert.ok(odd.includes('<h1>$&amp; $`</h1>'));
});

test('a document can still be served before the dashboard has been built', () => {
  const html = dashboardDocumentHtml(null, dashboardSeoFor(`${DASHBOARD_BASKETBALL}/upcoming`));
  assert.equal(headValue(html, CANONICAL), `${site}${DASHBOARD_BASKETBALL}/upcoming`);
  assert.ok(html.includes('<h1>Upcoming basketball fixtures</h1>'));
  assert.equal(count(html, /<div id="root">/g), 1);
});

test('route handlers answer real pages with 200 and their own metadata', async () => {
  for (const [path, title] of [
    [DASHBOARD_BASKETBALL, 'Basketball Scores — NBA, WNBA, EuroLeague &amp; NCAA Live Scores | Hyper'],
    [DASHBOARD_NFL, 'NFL Scores — Live American Football Scores, Standings &amp; Fixtures | Hyper'],
    [`${DASHBOARD_BASKETBALL}/top-scorers`, 'Basketball Top Scorers — NBA Stat Leaders by Category | Hyper'],
    [`${DASHBOARD_NFL}/upcoming`, 'NFL Schedule — Upcoming Games &amp; Kick-off Times | Hyper'],
    [`${DASHBOARD_BASKETBALL}/team/boston-celtics`, 'Boston Celtics — Scores, Fixtures, Squad &amp; Standings | Hyper'],
    [`${DASHBOARD_NFL}/team/kansas-city-chiefs`, 'Kansas City Chiefs — Scores, Fixtures, Squad &amp; Standings | Hyper'],
    [`${DASHBOARD_BASKETBALL}/match/401234567`, 'NBA Game 401234567 — Live Score &amp; Play-by-Play | Hyper'],
  ]) {
    const { response, html } = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('x-robots-tag'), 'index, follow, max-image-preview:large', path);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
    assert.equal(headValue(html, TITLE), title, path);
    assert.equal(headValue(html, CANONICAL), site + path, `${path} canonical is on the public origin, not the request's`);
    assert.equal(headValue(html, ROBOTS), null, path);
    assert.equal(count(html, /<script type="module"/g), 1);
    assert.ok(!html.includes(ORIGIN), 'the request origin never leaks into the document');
  }
});

test('route handlers keep the query a page needs and drop the rest', async () => {
  const college = await request(`${DASHBOARD_BASKETBALL}/match/401234567?competition=ncaam&utm_campaign=x`);
  assert.equal(headValue(college.html, CANONICAL), `${site}${DASHBOARD_BASKETBALL}/match/401234567?competition=ncaam`);
  assert.equal(headValue(college.html, TITLE), "NCAA Men's Basketball Game 401234567 — Live Score &amp; Play-by-Play | Hyper");
  const tracked = await request(`${DASHBOARD_NFL}?utm_source=newsletter`);
  assert.equal(headValue(tracked.html, CANONICAL), site + DASHBOARD_NFL);
  const alias = await request(`${DASHBOARD_BASKETBALL}/team/BOS`);
  assert.equal(alias.response.status, 200);
  assert.equal(headValue(alias.html, CANONICAL), `${site}${DASHBOARD_BASKETBALL}/team/boston-celtics`);
});

test('route handlers answer an address with no page with 404, and still serve the app', async () => {
  for (const path of [
    `${DASHBOARD_BASKETBALL}/team/not-a-team`,
    `${DASHBOARD_NFL}/team/boston-celtics`,
    `${DASHBOARD_NFL}/player/nobody`,
    `${DASHBOARD_BASKETBALL}/match/abc`,
    `${DASHBOARD_BASKETBALL}/standings`,
    '/nfl-basketball/tennis',
    '/nfl-basketball/cricket/scores',
  ]) {
    const { response, html } = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', path);
    assert.equal(headValue(html, ROBOTS), 'noindex, follow', path);
    assert.equal(headValue(html, CANONICAL), null, path);
    assert.match(headValue(html, TITLE)!, /not found/i, path);
    assert.equal(count(html, /application\/ld\+json/g), 0, path);
    // The app still loads, so the visitor gets its "not found" screen and its navigation.
    assert.equal(count(html, /<script type="module"/g), 1, path);
  }
});

test('route handlers serve sample-only and coming-soon screens without offering them to an index', async () => {
  for (const path of [`${DASHBOARD_BASKETBALL}/match/1`, `${DASHBOARD_BASKETBALL}/player/luka-doncic`, '/nfl-basketball/cricket', '/nfl-basketball/hockey']) {
    const { response, html } = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', path);
    assert.equal(headValue(html, ROBOTS), 'noindex, follow', path);
    assert.equal(headValue(html, CANONICAL), site + path, path);
  }
});

test('the entry URL redirects permanently to the basketball hub', async () => {
  const { response } = await request('/nfl-basketball');
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), DASHBOARD_BASKETBALL);
});

test('a missing file under the dashboard is a plain 404, never the HTML document', async () => {
  for (const path of ['/nfl-basketball/assets/index-old.js', '/nfl-basketball/assets/gone', '/nfl-basketball/index.html', '/nfl-basketball/favicon.ico']) {
    const { response, html } = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8', path);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex', path);
    assert.ok(!html.includes('<html'), path);
  }
});
