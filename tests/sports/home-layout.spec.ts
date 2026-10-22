import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

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
      builder.onResolve({ filter: /^@\/lib\/(viewer|prisma)$/ }, (args) => ({ path: args.path, namespace: 'home-data' }));
      builder.onResolve({ filter: /^@\/app\/actions$/ }, () => ({ path: 'actions', namespace: 'home-data' }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'home-data' }));
      builder.onLoad({ filter: /.*/, namespace: 'home-data' }, (args) => ({ contents:
        args.path.endsWith('viewer') ? 'export const getViewer = async () => window.homeReviewUser;'
          : args.path.endsWith('prisma') ? 'export const hasDatabase = false; export const prisma = {};'
            : args.path === 'router' ? 'const router = {refresh(){},push(){},replace(){}}; export const useRouter = () => router; export const usePathname = () => "/";'
              : names.map((name) => `export const ${name} = async () => {};`).join('\n'),
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
    await expect(summary.getByText('Indian Premier League', { exact: true })).toBeVisible();
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
