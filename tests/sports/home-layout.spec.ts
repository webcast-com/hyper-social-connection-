import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { parseStandings, resolveStandings } from '../../src/lib/espn-standings';
import { standingsFixture } from './standings-fixture';
import { parseTeamSchedule, recentGames, type MatchHistoryBoard } from '../../src/lib/espn-match-history';
import { historyEvent, scheduleFixture } from './history-fixture';

let javascript = '';
let css = '';
test.beforeAll(async () => {
  const actions = await fs.readFile('src/app/actions.ts', 'utf8');
  const names = [...actions.matchAll(/export async function (\w+)/g)].map((match) => match[1]);
  const result = await build({
    entryPoints: [path.resolve('tests/sports/home-browser-fixture.tsx')], bundle: true, write: false,
    format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
    plugins: [{ name: 'homepage-server-boundaries', setup(builder) {
      // Keep the real Home, navigation, feed, stories, composer and score views.
      // Substitute only server data/actions/router so no credentials are needed.
      builder.onResolve({ filter: /^@\/lib\/(viewer|prisma|espn-odds-feed|espn-match-feed)$/ }, (args) => ({ path: args.path, namespace: 'home-data' }));
      builder.onResolve({ filter: /^@\/app\/actions$/ }, () => ({ path: 'actions', namespace: 'home-data' }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'home-data' }));
      builder.onLoad({ filter: /.*/, namespace: 'home-data' }, (args) => ({ contents:
        args.path.endsWith('espn-match-feed') ? 'export const getMatchDetails = async () => window.matchReviewBoard;'
          : args.path.endsWith('espn-odds-feed') ? 'export const getEspnOdds = async () => window.oddsReviewBoard;'
          : args.path.endsWith('viewer') ? 'export const getViewer = async () => window.homeReviewUser;'
          : args.path.endsWith('prisma') ? 'export const hasDatabase = false; export const prisma = {};'
            : args.path === 'router' ? 'const router = {refresh(){},push(){},replace(){}}; export const useRouter = () => router; export const usePathname = () => "/"; export const notFound = () => { throw new Error("Not found"); };'
              : names.map((name) => name === 'createPost' ? 'export const createPost = async (data) => { window.predictionPosts.push(Object.fromEntries(data.entries())); };' : `export const ${name} = async () => {};`).join('\n'),
      }));
      builder.onLoad({ filter: /src\/lib\/sports\.ts$/ }, async (args) => ({
        contents: (await fs.readFile(args.path, 'utf8')).replace('export async function getSportsBoard(', 'async function unusedServerSportsBoard(')
          + '\nexport const getSportsBoard = async () => window.homeReviewBoard;', loader: 'ts',
      }));
      builder.onLoad({ filter: /src\/components\/SportsLiveWidget\.tsx$/ }, (args) => ({
        contents: 'import View from "./SportsScoresWidget"; export default function Widget(){ return <View board={window.homeReviewBoard} />; }',
        loader: 'tsx', resolveDir: path.dirname(args.path),
      }));
    } }],
  });
  javascript = result.outputFiles[0].text;
  css = (await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') })).css;
});
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: javascript });
    if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (pathname === '/team.svg' || route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#2563eb"/></svg>' });
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="app-page-bg"><div id="root"></div><script src="/fixture.js"></script></body></html>' });
    return route.abort();
  });
  await page.goto('http://home-layout.test');
  await page.waitForFunction(() => typeof window.renderHomeReview === 'function', null, { timeout: 5_000 });
});

async function render(page: Page, signedIn = true, demo = false) {
  await page.evaluate(({ signedIn, demo }) => window.renderHomeReview(signedIn, demo), { signedIn, demo });
  await expect(page.getByText('Hyper Sports', { exact: true })).toHaveCount(2);
}
async function assertFit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  for (const card of await page.getByRole('article').all()) {
    const dimensions = await card.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  }
}
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`actual homepage composition fits at ${width}px with long sports names and scores`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await render(page);
    await assertFit(page);
    const mobile = width < 1024;
    const summary = page.getByRole('region', { name: 'Sports scores' }).filter({ visible: true });
    await expect(summary).toHaveCount(1);
    await expect(summary.getByText('Premier League', { exact: true })).toBeVisible();
    await expect(summary.getByText('NBA', { exact: true })).toBeVisible();
    if (mobile) expect((await summary.boundingBox())!.y).toBeLessThan(400);
    const match = page.getByRole('article').filter({ hasText: 'Hyper Sports' }).first();
    await match.scrollIntoViewIfNeeded();
    await expect(match.getByText('Very Long International Home Club Name', { exact: true })).toBeVisible();
    await expect(match.getByText('Prediction:', { exact: false })).toHaveCount(0);
    for (const button of await match.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await match.getByRole('button', { name: 'Poll', exact: true }).click();
    await expect(match.getByPlaceholder('Option 1')).toBeVisible();
    await assertFit(page);
    await page.screenshot({ path: `test-results/sports/home-${width}.png` });
  });
}

test('homepage sample summaries and cards never claim to be live', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await render(page, false, true);
  const summary = page.getByRole('region', { name: 'Sports scores' }).filter({ visible: true });
  await expect(summary.getByRole('heading', { name: 'Sample fixtures' })).toBeVisible();
  const matches = page.getByRole('article').filter({ hasText: 'Hyper Sports' });
  await expect(matches.getByText('Sample fixture', { exact: true })).toHaveCount(2);
  await expect(matches.getByText(/LIVE/)).toHaveCount(0);
  await expect(page.getByText('Sample prediction', { exact: true })).toBeVisible();
  await assertFit(page);
});

test('dark mobile homepage retains accessible sports and community links', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await render(page);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('link', { name: 'All competitions' }).filter({ visible: true })).toHaveAttribute('href', '/sports');
  await assertFit(page);
});


test('homepage renders race titles and driver polls, never fictional team scores or Draw', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => window.renderHomeReview(true, false, 'race'));
  const card = page.getByRole('article').filter({ hasText: 'Hyper Sports' }).first();
  await expect(card.getByText('Review Grand Prix', { exact: true })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Sports scores' }).filter({ visible: true });
  await expect(summary.getByText('Review Grand Prix', { exact: true })).toBeVisible();
  await expect(card.getByText('vs', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Poll', exact: true }).click();
  await expect(card.locator('input[value="Leading Driver"]')).toBeVisible();
  await expect(card.locator('input[value="Other"]')).toBeVisible();
  await expect(card.locator('input[value="Draw"]')).toHaveCount(0);
  await assertFit(page);
});
test('unreported scores in the feed remain unknown instead of showing 0–0', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => window.renderHomeReview(false, false, 'missing-score'));
  const card = page.getByRole('article').filter({ hasText: 'Hyper Sports' }).first();
  await expect(card.getByText('–––', { exact: true })).toBeVisible();
  await expect(card.getByText('0–0', { exact: true })).toHaveCount(0);
  await assertFit(page);
});

for (const width of [320, 768, 1440]) {
  test(`predictions route shows an honest ESPN odds empty state at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.renderPredictionsReview());
    await expect(page.getByRole('heading', { name: 'Match predictions', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No upcoming matches with odds', exact: true })).toBeVisible();
    await expect(page.getByText('Only scheduled home/away fixtures', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to sports scores' })).toHaveAttribute('href', '/sports');
    await expect(page.getByText('0 matches', { exact: false })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByText(/RapidAPI|RAPIDAPI_KEY/)).toHaveCount(0);
    await expect(page.getByRole('banner')).toBeVisible();
    await assertFit(page);
  });
}

test('predictions route does not poll in the background', async ({ page }) => {
  await page.clock.install();
  let sportsRequests = 0;
  page.on('request', (request) => { if (request.url().includes('/api/sports')) sportsRequests++; });
  await page.evaluate(() => window.renderPredictionsReview());
  await expect(page.getByRole('heading', { name: 'No upcoming matches with odds', exact: true })).toBeVisible();
  await page.clock.fastForward(180_000);
  expect(sportsRequests).toBe(0);
});

for (const width of [320, 768, 1440]) {
  test(`ESPN odds, premium flags and full team names fit at ${width}px without invented predictions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.renderPredictionsReview('ready'));
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(8);
    await expect(cards.getByText('Free', { exact: true })).toHaveCount(6);
    await expect(cards.getByText('Premium', { exact: true })).toHaveCount(2);
    await expect(cards.first().getByText('1.80', { exact: true })).toBeVisible();
    await expect(cards.first().getByRole('heading')).toContainText('Very Long International Home Club Name');
    await expect(page.getByText('Upcoming fixtures and bookmaker odds—not model predictions or guaranteed outcomes.')).toBeVisible();
    await expect(cards.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
    await expect(cards.first().getByRole('link', { name: 'Log in to share or create a poll' })).toHaveAttribute('href', '/login');
    await assertFit(page);
  });
}

test('odds filters POST the supplied contract and refresh with loading and retryable errors', async ({ page }) => {
  await page.evaluate(() => window.renderPredictionsReview('ready'));
  let body: unknown;
  await page.route('**/api/sports/predictions?refresh=1', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'Unavailable' } });
  });
  await page.getByRole('combobox', { name: 'Sport', exact: true }).selectOption('basketball');
  await page.getByRole('spinbutton', { name: 'Per league (0 = no cap)', exact: true }).fill('2');
  await page.getByRole('spinbutton', { name: 'Days ahead', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Refresh matches', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Keeping the previous results');
  expect(body).toEqual({ sports: ['basketball'], perLeague: 2, days: 3 });
  await expect(page.getByRole('article')).toHaveCount(8);
  const next = await page.evaluate(() => ({ ...window.oddsReviewBoard, status: 'empty', matches: [] }));
  await page.route('**/api/sports/predictions?refresh=1', (route) => route.fulfill({ json: next }));
  await page.getByRole('button', { name: 'Refresh matches', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('signed-in match sharing and polls use reported odds, not a fabricated prediction', async ({ page }) => {
  await page.evaluate(() => window.renderPredictionsReview('ready', true));
  const first = page.getByRole('article').first();
  await first.getByRole('textbox').fill('My match discussion');
  await first.getByRole('button', { name: 'Share', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.predictionPosts.length)).toBe(1);
  const post = await page.evaluate(() => window.predictionPosts[0]);
  expect(post.content).toContain('ESPN-reported decimal odds: Home 1.8');
  expect(post.content).toContain('My match discussion');
  expect(post.content).not.toContain('Pick:');
  await first.getByRole('button', { name: 'Poll this', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.predictionPosts.length)).toBe(2);
  expect(await page.evaluate(() => window.predictionPosts[1].pollOption2)).toBe('Draw');
});

test('odds outages are not disguised as an empty schedule or sample prices', async ({ page }) => {
  await page.evaluate(() => window.renderPredictionsReview('unavailable'));
  await expect(page.getByRole('status')).toContainText('ESPN odds could not be reached');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.evaluate(() => window.renderPredictionsReview('partial'));
  await expect(page.getByRole('status')).toContainText('Some ESPN feeds are unavailable');
  await expect(page.getByRole('article')).toHaveCount(8);
});

test('a missing app odds API gives a deployment warning and retains the previous matches', async ({ page }) => {
  await page.evaluate(() => window.renderPredictionsReview('ready'));
  await page.route('**/api/sports/predictions?refresh=1', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.getByRole('button', { name: 'Refresh matches', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('app endpoint /api/sports/predictions returned HTTP 404');
  await expect(page.getByRole('alert')).toContainText('deployment');
  await expect(page.getByRole('article')).toHaveCount(8);
});

test('upstream odds 404s stay distinct from app-route 404s and network resets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => window.renderPredictionsReview('ready'));
  const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20261023&limit=100';
  await page.route('**/api/sports/predictions?refresh=1', (route) => route.fulfill({ json: {
    matches: [], status: 'unavailable', truncated: false, fetchedAt: new Date().toISOString(),
    sources: [
      { path: 'basketball/mens-college-basketball', date: '20261023', ok: false, count: 0, httpStatus: 404, errorKind: 'http', url, error: 'ESPN HTTP 404' },
      { path: 'basketball/nba', date: null, ok: false, count: 0, httpStatus: null, errorKind: 'network', url: url.replace('mens-college-basketball', 'nba'), error: 'fetch failed: ECONNRESET' },
    ],
  } }));
  await page.getByRole('button', { name: 'Refresh matches', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('ESPN odds could not be reached');
  await page.getByText('Feed details (0/2 responding)', { exact: true }).click();
  await expect(page.getByText('HTTP 404 · http', { exact: true })).toBeVisible();
  await expect(page.getByText('No HTTP response · network', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: url, exact: true })).toHaveAttribute('href', url);
  await assertFit(page);
});

test('odds distinguish HTTP 403 access refusal from network unreachability and display only safe metadata', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => window.renderPredictionsReview('ready'));
  await page.route('**/api/sports/predictions?refresh=1', (route) => route.fulfill({ json: {
    matches: [], status: 'unavailable', truncated: false, fetchedAt: new Date().toISOString(),
    sources: [{ path: 'basketball/nba', date: null, ok: false, count: 0, httpStatus: 403, errorKind: 'http', error: 'ESPN HTTP 403',
      responseMetadata: { server: 'example-edge', via: '1.1 example-proxy', contentType: 'text/html' } }],
  } }));
  await page.getByRole('button', { name: 'Refresh matches', exact: true }).click();
  await expect(page.getByRole('note', { name: 'ESPN access restriction' })).toContainText('HTTP 403');
  await expect(page.getByRole('status')).toContainText('Access to ESPN odds was refused');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByText('Feed details (0/1 responding)', { exact: true }).click();
  await expect(page.getByText('example-edge', { exact: true })).toBeVisible();
  await expect(page.getByText('1.1 example-proxy', { exact: true })).toBeVisible();
  await assertFit(page);
});

for (const width of [320, 768, 1440]) {
  test(`guest match statistics, lineups, player tables and events fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.renderMatchDetailsReview());
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Very Long International Away Club Name');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to sports scores', exact: true })).toHaveAttribute('href', '/sports');
    const statistics = page.getByRole('table');
    await expect(statistics).toContainText('Possession');
    await expect(statistics.getByRole('cell', { name: '0', exact: true })).toBeVisible();
    await assertFit(page);
    await page.getByRole('button', { name: 'Lineups & rosters', exact: true }).click();
    await expect(page.getByText('Reported formation: 4-3-3', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Listed players', exact: true })).toBeVisible();
    await expect(page.getByText('No roster reported for this team.', { exact: true })).toBeVisible();
    await assertFit(page);
    await page.getByRole('button', { name: 'Player stats', exact: true }).click();
    await expect(page.getByRole('table')).toContainText('Reported Starter');
    await expect(page.getByRole('region', { name: /game statistics/ })).toHaveAttribute('tabindex', '0');
    await assertFit(page);
    await page.getByRole('button', { name: 'Match events', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Key events', exact: true })).toBeVisible();
    await expect(page.getByText('Reported goal from Away Club', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Reported basket by Starter', { exact: true })).toHaveCount(0);
    await assertFit(page);
  });
}

test('sparse match details and dark mode retain honest empty sections', async ({ page }) => {
  await page.evaluate(() => { document.documentElement.classList.add('dark'); return window.renderMatchDetailsReview('empty'); });
  await expect(page.getByText('Team statistics have not been provided', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Lineups & rosters', exact: true }).click();
  await expect(page.getByText('Lineups and rosters have not been provided', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Player stats', exact: true }).click();
  await expect(page.getByText('Individual player statistics have not been provided', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Match events', exact: true }).click();
  await expect(page.getByText('Match events and play-by-play updates have not been provided', { exact: false })).toBeVisible();
  await assertFit(page);
});

test('basketball match details use reported starters and plays without football formations', async ({ page }) => {
  await page.evaluate(() => window.renderMatchDetailsReview('basketball'));
  await page.getByRole('button', { name: 'Lineups & rosters', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Reported Starter' })).toBeVisible();
  await expect(page.getByText('Reported formation:', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Match events', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Play by play', exact: true })).toBeVisible();
  await expect(page.getByText('Reported basket by Starter', { exact: true })).toBeVisible();
});

test('match refresh requests only the selected match, prevents duplicate clicks and replaces data', async ({ page }) => {
  await page.evaluate(() => window.renderMatchDetailsReview());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  const next = await page.evaluate(() => ({ ...window.matchReviewBoard, match: { ...window.matchReviewBoard.match!, title: 'Refreshed match title' } }));
  await page.route('**/api/sports/matches/epl/401234567?refresh=1', async (route) => { requests++; await gate; await route.fulfill({ json: next }); });
  await page.getByRole('button', { name: 'Refresh details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refreshing…', exact: true })).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refreshed match title');
  await expect(page.getByRole('button', { name: 'Refresh details', exact: true })).toBeEnabled();
});

test('failed, malformed and unavailable match refreshes retain the last match and allow retry', async ({ page }) => {
  await page.evaluate(() => window.renderMatchDetailsReview());
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  for (const response of [{ status: 503, json: { error: 'Busy' } }, { json: { status: 'ready', source: { ok: true }, match: {} } },
    { json: { status: 'unavailable', match: null, source: { ok: false, url: 'https://site.api.espn.com/summary', httpStatus: 403, error: 'ESPN HTTP 403' } } }]) {
    await page.route('**/api/sports/matches/epl/401234567?refresh=1', (route) => route.fulfill(response));
    await page.getByRole('button', { name: 'Refresh details', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Keeping the previous data');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading!);
    await expect(page.getByRole('table')).toContainText('Possession');
  }
});

test('match outages preserve source diagnostics without fake lineups or statistics', async ({ page }) => {
  await page.evaluate(() => window.renderMatchDetailsReview('unavailable'));
  await expect(page.getByRole('status')).toContainText('HTTP 403');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Match detail sections' })).toHaveCount(0);
  await page.getByText('ESPN match feed details', { exact: true }).click();
  await expect(page.getByText('example-edge', { exact: true })).toBeVisible();
});

test('real feed and odds cards link to match details while sample cards never do', async ({ page }) => {
  await page.evaluate(() => window.renderHomeReview(false));
  await expect(page.getByRole('link', { name: 'View match details', exact: true }).first()).toHaveAttribute('href', '/sports/matches/epl/401234567');
  await page.evaluate(() => window.renderHomeReview(false, true));
  await expect(page.getByRole('link', { name: 'View match details', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.renderPredictionsReview('ready'));
  const link = page.getByRole('link', { name: 'View match details', exact: true }).first();
  await expect(link).toHaveAttribute('href', '/sports/matches/epl/401234567');
});

for (const width of [320, 768, 1440]) {
  for (const route of ['about', 'privacy'] as const) {
    test(`public ${route} content and footer fit at ${width}px without signing in`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((name) => window.renderInformationReview(name), route);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(route === 'about' ? 'About Hyper' : 'Privacy notice');
      await expect(page.getByRole('banner')).toBeVisible();
      const footer = page.getByRole('contentinfo');
      await expect(footer.getByRole('link', { name: 'About Hyper', exact: true })).toHaveAttribute('href', '/about');
      await expect(footer.getByRole('link', { name: 'Privacy notice', exact: true })).toHaveAttribute('href', '/privacy');
      await footer.getByRole('link', { name: 'Privacy notice', exact: true }).scrollIntoViewIfNeeded();
      await expect(footer.getByRole('link', { name: 'Privacy notice', exact: true })).toBeInViewport();
      if (route === 'privacy') await expect(page.getByText('The site operator has not yet published', { exact: false })).toBeVisible();
      await assertFit(page);
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await assertFit(page);
    });
  }
}

test('match competition navigation returns to its league and missing stats never acquire comparison bars', async ({ page }) => {
  await page.evaluate(() => window.renderMatchDetailsReview());
  const nav = page.getByRole('navigation', { name: 'Match navigation', exact: true });
  await expect(nav.getByRole('link', { name: 'Premier League', exact: true })).toHaveAttribute('href', '/sports?league=epl');
  await expect(page.getByRole('img', { name: /Relative comparison/ })).toHaveCount(1);
  await page.evaluate(() => window.renderMatchDetailsReview('empty'));
  await expect(page.getByRole('img', { name: /Relative comparison/ })).toHaveCount(0);
});

test('actual match page forwards only safe scoreboard return contexts to its back link', async ({ page }) => {
  await page.evaluate(() => window.renderMatchDetailsReview('ready', '/sports?sport=football&country=England&league=epl&view=cards'));
  await expect(page.getByRole('link', { name: 'Back to sports scores', exact: true })).toHaveAttribute('href', '/sports?sport=football&country=England&league=epl&view=cards');
  for (const value of ['https://evil.test/path', '//evil.test/sports', '/settings']) {
    await page.evaluate((returnTo) => window.renderMatchDetailsReview('ready', returnTo), value);
    await expect(page.getByRole('link', { name: 'Back to sports scores', exact: true })).toHaveAttribute('href', '/sports');
  }
});

function standingsResponse(league = 'epl', season: number | null = 2026) {
  return { league, requestedSeason: season, ...parseStandings(standingsFixture(season ?? 2026), season), fetchedAt: '2026-10-23T18:00:00Z', source: { ok: true, url: resolveStandings(league).url, httpStatus: 200 } };
}
for (const width of [320, 768, 1440]) {
  test(`lazy league table highlights match teams, preserves zeros and fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 768) await page.evaluate(() => document.documentElement.classList.add('dark'));
    let requests = 0;
    await page.route('**/api/sports/standings/**', (route) => { requests++; return route.fulfill({ json: standingsResponse() }); });
    await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
    for (const name of ['Lineups & rosters', 'Player stats', 'Match events', 'Statistics']) await page.getByRole('button', { name, exact: true }).click();
    expect(requests).toBe(0);
    await page.getByRole('button', { name: 'League table', exact: true }).click();
    const table = page.getByRole('table', { name: 'Group B', exact: true });
    await expect(table).toBeVisible(); expect(requests).toBe(1);
    await expect(page.getByText('In this match', { exact: true })).toHaveCount(2);
    await expect(table.getByRole('cell', { name: '0', exact: true })).toBeVisible();
    await expect(table.getByRole('cell', { name: '—', exact: true })).toHaveCount(4);
    await expect(page.getByText('Season 2025/2026', { exact: true })).toBeVisible();
    const region = page.getByRole('region', { name: /Group B standings/ });
    await region.focus(); await expect(region).toBeFocused(); await region.press('ArrowRight');
    await assertFit(page);
    await page.getByLabel('Table / group').selectOption({ label: 'Group A' });
    await expect(page.getByRole('table', { name: 'Group A', exact: true })).toContainText('Other Club');
    await expect(page.getByRole('cell', { name: '7', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Statistics', exact: true }).click();
    await expect(page.getByRole('table')).toContainText('Possession');
    await page.getByRole('button', { name: 'League table', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Group A', exact: true })).toBeVisible(); expect(requests).toBe(1);
    await assertFit(page);
  });
}
test('league table requests the reported match season and preserves table on independent refresh failure', async ({ page }) => {
  const urls: string[] = [];
  await page.route('**/api/sports/standings/**', (route) => {
    urls.push(route.request().url());
    return urls.length === 1 ? route.fulfill({ json: standingsResponse('epl', 2025) }) : route.fulfill({ status: 503, json: { error: 'busy' } });
  });
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2025));
  await page.getByRole('button', { name: 'League table', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Group B', exact: true })).toBeVisible();
  expect(new URL(urls[0]).searchParams.get('season')).toBe('2025');
  await page.getByRole('button', { name: 'Refresh table', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Showing the previously loaded table');
  await expect(page.getByRole('table', { name: 'Group B', exact: true })).toBeVisible();
  expect(new URL(urls[1]).searchParams.get('refresh')).toBe('1');
  expect(new URL(urls[1]).searchParams.get('season')).toBe('2025');
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Possession');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Very Long International Away Club Name');
});
test('unknown match season is explicitly current, and a malformed table can be retried without losing match details', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/sports/standings/**', (route) => {
    calls++; expect(new URL(route.request().url()).searchParams.has('season')).toBe(false);
    return route.fulfill({ json: calls === 1 ? { status: 'ready', groups: [{}] } : standingsResponse('epl', null) });
  });
  await page.evaluate(() => window.renderMatchDetailsReview());
  await page.getByRole('button', { name: 'League table', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('League table could not be loaded');
  await expect(page.getByText(/not a historical match table/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry table', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Group B', exact: true })).toBeVisible(); expect(calls).toBe(2);
});
test('empty cup standings and wrong-season responses never become fabricated rankings', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/sports/standings/**', (route) => {
    calls++;
    return route.fulfill({ json: calls === 1 ? standingsResponse('epl', 2024) : { ...standingsResponse(), groups: [], status: 'empty' } });
  });
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
  await page.getByRole('button', { name: 'League table', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry table', exact: true }).click();
  await expect(page.getByText(/Cup and knockout competitions may not have standings/)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
test('table loading is single-flight and match refresh does not request another table', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route('**/api/sports/standings/**', async (route) => { calls++; await gate; return route.fulfill({ json: standingsResponse() }); });
  await page.route('**/api/sports/matches/**', async (route) => route.fulfill({ json: await page.evaluate(() => window.matchReviewBoard) }));
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
  await page.getByRole('button', { name: 'League table', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Loading table…', exact: true })).toBeDisabled();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await page.getByRole('button', { name: 'League table', exact: true }).click();
  release(); await expect(page.getByRole('table', { name: 'Group B', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh details', exact: true })).toBeEnabled();
  expect(calls).toBe(1);
});
test('basketball conference table uses reported sport labels and leaves unreported positions blank', async ({ page }) => {
  const parsed = parseStandings({ season: { year: 2026 }, children: [{ name: 'Eastern Conference', standings: { entries: [
    { team: { id: '100', displayName: 'Home Club' }, stats: [{ name: 'wins', displayName: 'W', displayValue: '12' }, { name: 'winPercent', displayName: 'PCT', displayValue: '.788' }, { name: 'streak', displayName: 'Strk', displayValue: 'W3' }] },
  ] } }] }, 2026);
  await page.route('**/api/sports/standings/**', (route) => {
    expect(new URL(route.request().url()).pathname).toBe('/api/sports/standings/nba');
    return route.fulfill({ json: { ...standingsResponse('nba'), ...parsed } });
  });
  await page.evaluate(() => window.renderMatchDetailsReview('basketball', undefined, 2026));
  await page.getByRole('button', { name: 'League table', exact: true }).click();
  const table = page.getByRole('table', { name: 'Eastern Conference', exact: true });
  await expect(table.getByRole('columnheader', { name: 'PCT', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: '.788', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'W3', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: '—', exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Table / group')).toHaveCount(0);
});
test('hung browser table requests have a twelve-second deadline and leave match sections usable', async ({ page }) => {
  await page.clock.install();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route('**/api/sports/standings/**', async (route) => { calls++; await gate; await route.fulfill({ json: standingsResponse() }); });
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
  await page.getByRole('button', { name: 'League table', exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(12_001);
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  await expect(page.getByRole('button', { name: 'Retry table', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Possession');
  release();
});

function historyResponse(): MatchHistoryBoard {
  const cutoff = '2026-10-23T18:00:00.000Z';
  const teams = ['100', '200'].map((id) => {
    const events = [historyEvent(), historyEvent(id === '100' ? '9002' : '9003', '2026-10-19T18:00:00Z', id === '100' ? ['100', '300'] : ['400', '200'])];
    return { teamId: id, name: `Very Long International ${id === '100' ? 'Home' : 'Away'} Club Name`,
      games: parseTeamSchedule(scheduleFixture(id, 2026, events), id, 2026, cutoff, '401234567'),
      sources: [2026, 2025].map((season) => ({ ok: true, season, url: `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${id}/schedule?season=${season}`, httpStatus: 200 })) };
  });
  return { reference: { league: 'epl', eventId: '401234567' }, cutoff, seasonYears: [2026, 2025], teams, headToHead: recentGames(teams.flatMap((team) => team.games), ['100', '200']), status: 'ready', fetchedAt: cutoff, message: null };
}
for (const width of [320, 768, 1440]) {
  test(`guest match info, recent form and limited head-to-head fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 768) await page.evaluate(() => document.documentElement.classList.add('dark'));
    let calls = 0;
    await page.route('**/api/sports/matches/**/history*', (route) => { calls++; return route.fulfill({ json: historyResponse() }); });
    await page.evaluate(() => window.renderMatchDetailsReview('ready', '/sports?league=epl&view=cards', 2026));
    for (const name of ['Lineups & rosters', 'Match events', 'Player stats', 'Match info']) await page.getByRole('button', { name, exact: true }).click();
    const info = page.getByRole('region', { name: 'Match info', exact: true });
    await expect(info.getByText('Quarter-finals', { exact: true })).toBeVisible();
    await expect(info.getByText('0', { exact: true })).toBeVisible();
    await expect(info.getByText('Reported Referee · Referee', { exact: true })).toBeVisible();
    expect(calls).toBe(0); await assertFit(page);
    await page.getByRole('button', { name: 'Form & H2H', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recent form', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Head-to-head', exact: true })).toBeVisible();
    await expect(page.getByText(/not a complete history or an all-time/)).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(5); expect(calls).toBe(1);
    await expect(page.getByLabel('Win', { exact: true })).toHaveCount(2);
    await expect(page.getByLabel('Loss', { exact: true })).toHaveCount(2);
    const result = page.getByRole('link').filter({ hasText: 'Reported Team 100' }).first();
    await expect(result).toHaveAttribute('href', '/sports/matches/epl/9001?returnTo=%2Fsports%3Fleague%3Depl%26view%3Dcards');
    await result.focus(); await expect(result).toBeFocused(); await assertFit(page);
    await page.getByRole('button', { name: 'Statistics', exact: true }).click();
    await expect(page.getByRole('table')).toContainText('Possession');
    await page.getByRole('button', { name: 'Form & H2H', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recent form', exact: true })).toBeVisible(); expect(calls).toBe(1);
  });
}
test('history loading is single-flight and match refresh does not refetch already opened history', async ({ page }) => {
  let calls = 0; let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/sports/matches/**/history*', async (route) => { calls++; await gate; return route.fulfill({ json: historyResponse() }); });
  await page.route('**/api/sports/matches/epl/401234567?refresh=1', async (route) => route.fulfill({ json: await page.evaluate(() => window.matchReviewBoard) }));
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
  await page.getByRole('button', { name: 'Form & H2H', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Loading history…', exact: true })).toBeDisabled();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await page.getByRole('button', { name: 'Form & H2H', exact: true }).click();
  release(); await expect(page.getByRole('heading', { name: 'Recent form', exact: true })).toBeVisible();
  const response = page.waitForResponse('**/api/sports/matches/epl/401234567?refresh=1');
  await page.getByRole('button', { name: 'Refresh details', exact: true }).click(); await response;
  await expect(page.getByRole('button', { name: 'Refresh details', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Recent form', exact: true })).toBeVisible(); expect(calls).toBe(1);
});
test('failed or partial history refresh keeps previous results and its separate retry control', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/sports/matches/**/history*', (route) => {
    calls++; if (calls === 2) return route.fulfill({ status: 503, json: { error: 'busy' } });
    const board = historyResponse();
    if (calls === 3) { board.status = 'partial'; board.message = 'Some schedules are unavailable'; board.teams[0].sources[0].ok = false; board.teams[0].games = []; }
    return route.fulfill({ json: board });
  });
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
  await page.getByRole('button', { name: 'Form & H2H', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(5);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Refresh history', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Showing previously loaded results');
    await expect(page.getByRole('listitem')).toHaveCount(5);
  }
  expect(calls).toBe(3);
});
test('partial and empty history disclose limited coverage, not an all-time claim', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/sports/matches/**/history*', (route) => {
    calls++; const board = historyResponse(); board.headToHead = []; board.teams.forEach((team) => { team.games = []; });
    if (calls === 1) { board.status = 'partial'; board.message = 'Some requested schedules are unavailable'; board.teams[0].sources[0].ok = false; }
    return route.fulfill({ json: board });
  });
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
  await page.getByRole('button', { name: 'Form & H2H', exact: true }).click();
  await expect(page.getByText('Some requested schedules are unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText(/does not mean the teams have never met/)).toBeVisible();
  await expect(page.getByText(/No usable completed results/)).toHaveCount(2);
  await page.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(page.getByText('Some requested schedules are unavailable', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('listitem')).toHaveCount(0);
});
test('unknown match season has a clear unavailable message; missing match information stays missing', async ({ page }) => {
  await page.route('**/api/sports/matches/**/history*', (route) => route.fulfill({ json: { ...historyResponse(), status: 'unavailable', seasonYears: [], teams: [], headToHead: [], message: 'Match season not reported; historical results cannot be safely selected.' } }));
  await page.evaluate(() => window.renderMatchDetailsReview('empty'));
  await page.getByRole('button', { name: 'Match info', exact: true }).click();
  const info = page.getByRole('region', { name: 'Match info', exact: true });
  await expect(info.getByText('—', { exact: true })).toHaveCount(5);
  await page.getByRole('button', { name: 'Form & H2H', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Match season not reported');
  await expect(page.getByRole('button', { name: 'Retry history', exact: true })).toBeEnabled();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});
test('history rejects future results and malformed metadata without losing match data', async ({ page }) => {
  await page.route('**/api/sports/matches/**/history*', (route) => { const board = historyResponse(); board.headToHead[0].kickoff = '2027-01-01'; return route.fulfill({ json: board }); });
  await page.route('**/api/sports/matches/epl/401234567?refresh=1', async (route) => {
    const board = await page.evaluate(() => window.matchReviewBoard);
    return route.fulfill({ json: { ...board, match: { ...board.match, information: { stage: null, attendance: null, officials: [{}] } } } });
  });
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
  await page.getByRole('button', { name: 'Form & H2H', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Match history could not be loaded');
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh details', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not refresh match details' })).toBeVisible();
  await page.getByRole('button', { name: 'Match info', exact: true }).click();
  await expect(page.getByText('Reported Referee · Referee', { exact: true })).toBeVisible();
});
test('browser history request deadline releases retry and keeps other sections usable', async ({ page }) => {
  await page.clock.install();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let calls = 0;
  await page.route('**/api/sports/matches/**/history*', async (route) => { calls++; await gate; return route.fulfill({ json: historyResponse() }); });
  await page.evaluate(() => window.renderMatchDetailsReview('ready', undefined, 2026));
  await page.getByRole('button', { name: 'Form & H2H', exact: true }).click(); await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(20_001);
  await expect(page.getByRole('alert')).toContainText('Match history could not be loaded');
  await expect(page.getByRole('button', { name: 'Retry history', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Statistics', exact: true }).click(); await expect(page.getByRole('table')).toContainText('Possession'); release();
});
