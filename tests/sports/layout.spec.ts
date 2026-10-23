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
    if (pathname === '/' || pathname === '/sports' || pathname.startsWith('/sports/matches/')) {
      const start = pathname === '/sports' ? 'window.renderSports("live",false,window.location.search);'
        : pathname.startsWith('/sports/matches/') ? 'window.renderSportsMatch(new URL(location.href).searchParams.get("returnTo") || undefined);' : '';
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script src="/fixture.js"></script><script>${start}</script></body></html>` });
    }
    return route.abort();
  });
  await page.goto('http://sports.test');
  await page.waitForFunction(() => typeof window.renderSports === 'function', null, { timeout: 5_000 });
  await page.evaluate(() => window.renderSports('live'));
  await expect(page.getByRole('article')).toHaveCount(SPORTS_COMPETITIONS.length);
});

async function assertFit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  for (const input of await page.locator('input:visible, select:visible').all()) {
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

test('HTTP 403 shows an access restriction and safe response metadata without claiming a missing route', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route('**/api/sports?refresh=1', (route) => route.fulfill({ json: {
    mode: 'partial', fetchedAt: new Date().toISOString(), predictions: [], events: [],
    sources: [{ id: 'espn:epl', ok: false, count: 0, httpStatus: 403, errorKind: 'http', error: 'ESPN HTTP 403',
      responseMetadata: { server: 'example-edge', contentType: 'text/plain', proxyBlockReason: 'OUTBOUND_HOST_DENIED' } }],
  } }));
  await page.getByRole('button', { name: 'Refresh scores', exact: true }).click();
  await expect(page.getByRole('note', { name: 'ESPN access restriction' })).toContainText('Access to ESPN was refused (HTTP 403)');
  await expect(page.getByRole('note')).toContainText('does not identify who blocked');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByText('Unavailable ESPN feed details', { exact: true }).click();
  await expect(page.getByText('example-edge', { exact: true })).toBeVisible();
  await expect(page.getByText('OUTBOUND_HOST_DENIED', { exact: true })).toBeVisible();
  await assertFit(page);
});

test('score cards link to real match details, excluding samples and motorsport', async ({ page }) => {
  await page.evaluate(() => window.renderSports('live'));
  const first = page.getByRole('link', { name: 'View match details', exact: true }).first();
  await expect(first).toHaveAttribute('href', /^\/sports\/matches\/[^/]+\/401234567$/);
  await page.getByRole('button', { name: 'Motorsport', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View match details', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.renderSports('demo'));
  await expect(page.getByRole('link', { name: 'View match details', exact: true })).toHaveCount(0);
});

test('country filtering narrows competitions and sport changes clear an incompatible country', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Country or area', exact: true }).selectOption('England');
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('combobox', { name: 'League or competition', exact: true }).selectOption('epl');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Basketball', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Country or area', exact: true })).toHaveValue('all');
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(SPORTS_COMPETITIONS.length);
});

test('desktop country browser selects a league, and status/list/card controls preserve match links', async ({ page }) => {
  const browser = page.locator('aside').getByRole('navigation', { name: 'Competition browser', exact: true });
  await browser.getByText('England', { exact: true }).click();
  await browser.getByRole('button', { name: 'Show Premier League', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'League or competition', exact: true })).toHaveValue('epl');
  const layouts = page.getByRole('group', { name: 'Score layout', exact: true });
  for (const label of ['cards', 'list']) {
    await layouts.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'View match details', exact: true })).toHaveAttribute('href', `/sports/matches/epl/401234567?returnTo=${encodeURIComponent(`/sports?league=epl${label === 'cards' ? '&view=cards' : ''}`)}`);
  }
  await page.getByRole('group', { name: 'Quick match status', exact: true }).getByRole('button', { name: 'Results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No events in this view', exact: true })).toBeVisible();
});

test('mobile advanced filters and country browser stay reachable without hiding the first fixtures', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(page.getByRole('combobox', { name: 'Region', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'More filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Match date (EAT)', exact: true }).selectOption('2026-10-22');
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('asia');
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Fewer filters', exact: true }).click();
  await page.getByText('Browse competitions', { exact: true }).click();
  const browser = page.getByRole('navigation', { name: 'Competition browser', exact: true });
  await browser.getByText('Japan', { exact: true }).click();
  await browser.getByRole('button', { name: 'Show J1 League', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await assertFit(page);
});

test('competition links initialize a filtered board and invalid league references safely show all', async ({ page }) => {
  await page.evaluate(() => window.renderSports('live', false, 'nba'));
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'League or competition', exact: true })).toHaveValue('nba');
  await page.evaluate(() => window.renderSports('live', false, '../private'));
  await expect(page.getByRole('article')).toHaveCount(SPORTS_COMPETITIONS.length);
});

test('compatible country choices survive sport changes and removable chips leave other filters intact', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Country or area', exact: true }).selectOption('England');
  await page.getByRole('button', { name: 'Football', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Country or area', exact: true })).toHaveValue('England');
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Rugby', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Country or area', exact: true })).toHaveValue('England');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('group', { name: 'Active filters', exact: true }).getByRole('button', { name: 'Remove country filter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rugby', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page).toHaveURL(/sport=rugby$/);
});

test('native back and forward restore filters and layout without new feed requests', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/sports**', (route) => { requests++; return route.abort(); });
  await page.getByRole('combobox', { name: 'Country or area', exact: true }).selectOption('England');
  await page.getByRole('button', { name: 'Football', exact: true }).click();
  await page.getByRole('group', { name: 'Score layout', exact: true }).getByRole('button', { name: 'cards', exact: true }).click();
  await expect(page).toHaveURL(/sport=football&country=England&view=cards$/);
  await page.goBack();
  await expect(page.getByRole('group', { name: 'Score layout', exact: true }).getByRole('button', { name: 'list', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'All sports', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.goForward();
  await page.goForward();
  await expect(page.getByRole('group', { name: 'Score layout', exact: true }).getByRole('button', { name: 'cards', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(requests).toBe(0);
});

test('shared URLs restore query/date/layout, and typing replaces history rather than adding entries', async ({ page }) => {
  await page.goto('http://sports.test/sports?sport=football&country=England&league=epl&status=live&date=2026-10-22&q=Premier&view=cards');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'League or competition', exact: true })).toHaveValue('epl');
  await expect(page.getByLabel('Search teams or leagues')).toHaveValue('Premier');
  const entries = await page.evaluate(() => history.length);
  await page.getByLabel('Search teams or leagues').fill('Premier League');
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await page.reload();
  await expect(page.getByLabel('Search teams or leagues')).toHaveValue('Premier League');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Score layout', exact: true }).getByRole('button', { name: 'cards', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const view of ['list', 'cards']) {
  test(`clickable ${view} match area and detail back link restore the complete scoreboard context`, async ({ page }) => {
    const search = `?sport=football&region=europe&country=England&league=epl&status=live&date=2026-10-22&q=Premier${view === 'cards' ? '&view=cards' : ''}`;
    await page.goto(`http://sports.test/sports${search}`);
    const row = page.getByRole('article');
    const mainLink = row.getByRole('link', { name: /^Open .* match details$/ });
    expect(await row.locator('a a, a button').count()).toBe(0);
    await mainLink.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Very Long International Away Club Name');
    const back = page.getByRole('link', { name: 'Back to sports scores', exact: true });
    await expect(back).toHaveAttribute('href', `/sports${search}`);
    await back.click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByLabel('Search teams or leagues')).toHaveValue('Premier');
    await expect(page.getByRole('combobox', { name: 'Country or area', exact: true })).toHaveValue('England');
    await expect(page.getByRole('group', { name: 'Score layout', exact: true }).getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('sample and race rows stay non-navigable and copy actions remain outside match links', async ({ page }) => {
  await page.getByRole('button', { name: 'Motorsport', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Open .* match details$/ })).toHaveCount(0);
  await page.evaluate(() => window.renderSports('demo'));
  await expect(page.getByRole('link', { name: /^Open .* match details$/ })).toHaveCount(0);
  await page.evaluate(() => window.renderSports('live', false, 'jleague'));
  const button = page.getByRole('button', { name: 'Copy to post', exact: true });
  expect(await button.evaluate((element) => element.closest('a') !== null)).toBe(false);
});

test('long active search chips fit at 320px and can be removed independently', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole('combobox', { name: 'Country or area', exact: true }).selectOption('England');
  await page.getByLabel('Search teams or leagues').fill('long-search-'.repeat(15));
  await assertFit(page);
  await page.getByRole('button', { name: 'Remove search filter', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Country or area', exact: true })).toHaveValue('England');
  await expect(page.getByRole('article')).toHaveCount(4);
});
