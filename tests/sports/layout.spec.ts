import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { SPORTS_COMPETITIONS } from '../../src/lib/sports-catalog';

let javascript = '';
let css = '';
test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.resolve('tests/sports/browser-fixture.tsx')], bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
  });
  javascript = result.outputFiles[0].text;
  css = (await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') })).css;
});
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/*', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: javascript });
    if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>' });
    return route.abort();
  });
  await page.goto('http://sports.test');
  await page.waitForFunction(() => typeof window.renderSports === 'function', null, { timeout: 5_000 });
  await page.evaluate(() => window.renderSports('live'));
  await expect(page.getByRole('article')).toHaveCount(SPORTS_COMPETITIONS.length);
});

async function assertFit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  for (const input of await page.locator('input, select').all()) {
    const bounds = await input.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
}
for (const width of [320, 375, 768, 1440]) {
  test(`worldwide sport and competition controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await assertFit(page);
    for (const button of await page.getByRole('group', { name: 'Filter by sport' }).getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Baseball', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Major League Baseball' })).toBeVisible();
    await assertFit(page);
  });
}

test('combines region, sport, league, search and status, and resets incompatible league selections', async ({ page }) => {
  await page.getByRole('button', { name: 'Football', exact: true }).click();
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('asia');
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'League or competition', exact: true }).selectOption('jleague');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByLabel('Search teams or leagues').fill('J1');
  await page.getByRole('combobox', { name: 'Match status', exact: true }).selectOption('upcoming');
  await expect(page.getByRole('heading', { name: 'J1 League' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Match status', exact: true }).selectOption('live');
  await expect(page.getByRole('heading', { name: 'No events in this view' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(SPORTS_COMPETITIONS.length);
  await page.getByRole('combobox', { name: 'League or competition', exact: true }).selectOption('epl');
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('africa');
  await expect(page.getByRole('combobox', { name: 'League or competition', exact: true })).toHaveValue('all');
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Baseball', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'League or competition', exact: true })).toHaveValue('all');
  await expect(page.getByRole('heading', { name: 'No events in this view' })).toBeVisible();
});

test('sample and partial boards explain provider availability', async ({ page }) => {
  await page.evaluate(() => window.renderSports('demo'));
  await expect(page.getByRole('status')).toContainText('not current scores or schedules');
  await expect(page.getByText('Sample board', { exact: true })).toBeVisible();
  await expect(page.getByText('Sample fixture', { exact: true })).toHaveCount(SPORTS_COMPETITIONS.length);
  await expect(page.getByText('1 live', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.renderSports('partial'));
  await expect(page.getByRole('status')).toContainText('Some feeds are unavailable');
  await expect(page.getByText('Partial feeds', { exact: true })).toBeVisible();
});

test('empty successful boards show an honest empty state, not sample events', async ({ page }) => {
  await page.evaluate(() => window.renderSports('empty'));
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No events in this view' })).toBeVisible();
  await expect(page.getByText('Sample board', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'League or competition', exact: true }).locator('option')).toHaveCount(SPORTS_COMPETITIONS.length + 1);
});

test('dark mode keeps the global filters operable', async ({ page }) => {
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('button', { name: 'Ice hockey', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ice hockey', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toHaveCount(1);
  await assertFit(page);
});


test('mobile competitions start within the first screen instead of below all the filters', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const firstCard = await page.getByRole('article').first().boundingBox();
  expect(firstCard!.y).toBeLessThan(700);
  const filters = page.getByRole('group', { name: 'Filter by sport' });
  expect((await filters.boundingBox())!.height).toBeLessThan(65);
});


for (const width of [320, 375, 768, 1024, 1440]) {
  test(`competition cards keep full three-digit scores and long names inside their bounds at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.renderSports('live', true));
    const first = page.getByRole('article').first();
    await expect(first.getByText('183–184', { exact: true })).toBeVisible();
    for (const card of await page.getByRole('article').all()) {
      const dimensions = await card.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    }
    for (const score of await first.getByText('183–184', { exact: true }).all()) {
      const dimensions = await score.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    }
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/sports/competitions-${width}.png` });
  });
}

test('F1 uses race positions instead of a fictitious two-team scoreboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole('button', { name: 'Motorsport', exact: true }).click();
  const card = page.getByRole('article');
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Review Grand Prix', { exact: true })).toBeVisible();
  await expect(card.getByRole('list', { name: 'Reported race positions' })).toBeVisible();
  await expect(card.getByText('Leading Driver', { exact: true })).toBeVisible();
  await expect(card.getByText('VS', { exact: true })).toHaveCount(0);
  await expect(card.getByText('2–1', { exact: true })).toHaveCount(0);
});

test('manual refresh requests fresh server data and replaces the board', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/sports?refresh=1', async (route) => {
    requests++;
    await route.fulfill({ json: { mode: 'live', fetchedAt: new Date().toISOString(), sources: [], predictions: [], events: [] } });
  });
  await page.getByRole('button', { name: 'Refresh scores', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh scores', exact: true })).toBeEnabled();
  expect(requests).toBe(1);
});

test('failed refresh retains current scores and gives a retryable error', async ({ page }) => {
  const before = await page.getByRole('article').count();
  await page.route('**/api/sports?refresh=1', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('button', { name: 'Refresh scores', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/Could not refresh scores/);
  await expect(page.getByRole('article')).toHaveCount(before);
  await expect(page.getByRole('button', { name: 'Refresh scores', exact: true })).toBeEnabled();
  await page.route('**/api/sports?refresh=1', (route) => route.fulfill({ json: { mode: 'live', sources: [], events: [], predictions: [], fetchedAt: new Date().toISOString() } }));
  await page.getByRole('button', { name: 'Refresh scores', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('refresh rejects malformed responses without discarding the last board', async ({ page }) => {
  const before = await page.getByRole('article').count();
  await page.route('**/api/sports?refresh=1', (route) => route.fulfill({ json: { events: [] } }));
  await page.getByRole('button', { name: 'Refresh scores', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(before);
});

test('manual refresh displays loading and prevents duplicate requests', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route('**/api/sports?refresh=1', async (route) => {
    requests++;
    await pending;
    await route.fulfill({ json: { mode: 'live', events: [], sources: [], predictions: [], fetchedAt: new Date().toISOString() } });
  });
  await page.getByRole('button', { name: 'Refresh scores', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refreshing scores…', exact: true })).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(page.getByRole('button', { name: 'Refresh scores', exact: true })).toBeEnabled();
});

test('automatic polling still updates the board after 45 seconds', async ({ page }) => {
  await page.clock.install();
  // Remount after clock installation so the component schedules a controlled timer.
  await page.evaluate(() => window.renderSports('live'));
  await expect(page.getByRole('article')).toHaveCount(SPORTS_COMPETITIONS.length);
  let requests = 0;
  await page.route('**/api/sports', async (route) => {
    requests++;
    await route.fulfill({ json: { mode: 'live', events: [], sources: [], predictions: [], fetchedAt: new Date().toISOString() } });
  });
  await page.clock.fastForward(45_000);
  await expect(page.getByRole('article')).toHaveCount(0);
  expect(requests).toBe(1);
});

test('the board advertises ESPN-only coverage without removed provider competitions', async ({ page }) => {
  await expect(page.getByText('Worldwide scores and fixtures from ESPN', { exact: false })).toBeVisible();
  await expect(page.getByText('TheSportsDB', { exact: false })).toHaveCount(0);
  const leagues = page.getByRole('combobox', { name: 'League or competition', exact: true });
  await expect(leagues.locator('option')).toHaveCount(SPORTS_COMPETITIONS.length + 1);
  await expect(leagues.locator('option[value="ipl"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cricket', exact: true })).toHaveCount(0);
});

test('a missing app scores API is identified as deployment HTTP 404, not an ESPN outage', async ({ page }) => {
  const before = await page.getByRole('article').count();
  await page.route('**/api/sports?refresh=1', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.getByRole('button', { name: 'Refresh scores', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('app endpoint /api/sports returned HTTP 404');
  await expect(page.getByRole('alert')).toContainText('deployment');
  await expect(page.getByRole('article')).toHaveCount(before);
});

test('scores expose upstream 404 and network failures separately, with usable source URLs on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard';
  await page.route('**/api/sports?refresh=1', (route) => route.fulfill({ json: {
    mode: 'partial', fetchedAt: new Date().toISOString(), predictions: [], events: [],
    sources: [
      { id: 'espn:ucl', ok: false, count: 0, httpStatus: 404, errorKind: 'http', url, error: 'ESPN HTTP 404' },
      { id: 'espn:nba', ok: false, count: 0, httpStatus: null, errorKind: 'network', url: url.replace('soccer/uefa.champions', 'basketball/nba'), error: 'fetch failed: ECONNRESET' },
    ],
  } }));
  await page.getByRole('button', { name: 'Refresh scores', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByText('Unavailable ESPN feed details', { exact: true }).click();
  await expect(page.getByText('HTTP 404 · http', { exact: true })).toBeVisible();
  await expect(page.getByText('No HTTP response · network', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: url, exact: true })).toHaveAttribute('href', url);
  await assertFit(page);
});
