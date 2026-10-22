import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

let javascript = '';
let css = '';
let logo = '';
test.beforeAll(async () => {
  logo = await fs.readFile('public/logo-wordmark.svg', 'utf8');
  const actions = await fs.readFile('src/app/actions.ts', 'utf8');
  const names = [...actions.matchAll(/export async function (\w+)/g)].map((match) => match[1]);
  const result = await build({
    entryPoints: [path.resolve('tests/mobile-navigation/browser-fixture.tsx')], bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
    plugins: [{ name: 'navigation-server-boundaries', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(viewer|prisma)$/ }, (args) => ({ path: args.path, namespace: 'mobile-data' }));
      builder.onResolve({ filter: /^@\/app\/actions$/ }, () => ({ path: 'actions', namespace: 'mobile-data' }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'mobile-data' }));
      builder.onLoad({ filter: /.*/, namespace: 'mobile-data' }, (args) => ({ contents:
        args.path.endsWith('viewer') ? 'export const getViewer = async () => ({id:1,name:"Test User"});'
          : args.path.endsWith('prisma') ? 'export const hasDatabase = false; export const prisma = {};'
            : args.path === 'router' ? 'const router = {refresh(){},push(){}}; export const useRouter = () => router; export const usePathname = () => window.mobileReviewPath; export function redirect(url){throw new Error(url)};'
              : names.map((name) => name === 'getNotifications'
                ? 'export const getNotifications = async () => Array.from({length:18},(_,i)=>({notification:{id:i+1,actorId:2,type:"message",isRead:0,createdAt:"2026-10-22T12:00:00Z"},actor:{id:2,name:"Test Contact",avatar:null}}));'
                : `export const ${name} = async () => {};`).join('\n'),
      }));
    } }],
  });
  javascript = result.outputFiles[0].text;
  css = (await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') })).css;
});
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/*', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: javascript });
    if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (pathname === '/logo-wordmark.svg') return route.fulfill({ contentType: 'image/svg+xml', body: logo });
    if (pathname.startsWith('/api/')) return route.fulfill({ json: [] });
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>' });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
  });
  await page.goto('http://mobile-navigation.test/');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
});
const destinations = [
  ['Home', '/'], ['People', '/discover'], ['Sports', '/sports'],
  ['Groups', '/groups'], ['Messages', '/messages'], ['Notifications', '/notifications'],
] as const;
async function checkBar(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  const viewport = page.viewportSize()!;
  const box = (await nav.boundingBox())!;
  expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);
  for (const [label, href] of destinations) {
    const link = nav.getByRole('link', { name: label, exact: true });
    await expect(link).toHaveAttribute('href', href);
    const bounds = (await link.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    await link.click({ trial: true });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
}
for (const width of [320, 375, 390, 430, 667]) {
  test(`six fixed bottom tabs remain usable before and after scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 812 });
    await checkBar(page);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await checkBar(page);
    const last = (await page.getByRole('button', { name: 'Last page action' }).boundingBox())!;
    const nav = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(nav.y);
  });
}
for (const [label, href] of destinations) {
  test(`${label} opens its destination and receives the active indicator`, async ({ page }) => {
    // No real Next router is available in the fixture: Link falls back to its
    // native anchor navigation. The real href and destination markup are tested.
    const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(`http://mobile-navigation.test${href}`);
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  });
}

test('nested conversations highlight Messages and keep the composer above the bar, including a safe area', async ({ page }) => {
  await page.evaluate(async () => {
    document.documentElement.style.setProperty('--app-safe-area-bottom', '34px');
    await window.renderMobileNavigation('/messages/2');
  });
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(nav.getByRole('link', { name: 'Messages', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const height of [812, 500, 400]) {
    await page.setViewportSize({ width: 375, height });
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
    const composer = (await page.locator('form').filter({ has: page.getByRole('button', { name: 'Send message' }) }).boundingBox())!;
    const bar = (await nav.boundingBox())!;
    expect(composer.y + composer.height).toBeLessThanOrEqual(bar.y);
    expect(composer.y).toBeGreaterThanOrEqual(56);
    await checkBar(page);
  }
});

test('safe-area padding leaves the last page action and notification row unobscured', async ({ page }) => {
  await page.evaluate(() => document.documentElement.style.setProperty('--app-safe-area-bottom', '34px'));
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  const bar = (await nav.boundingBox())!;
  expect(bar.height).toBe(95);
  const last = (await page.getByRole('button', { name: 'Last page action' }).boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
  await page.evaluate(() => window.renderMobileNavigation('/notifications'));
  await expect(page.getByRole('heading', { name: /Notifications/ })).toBeVisible();
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const lastNotification = page.locator('main a[href="/messages/2"]').last();
  const bounds = (await lastNotification.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual((await nav.boundingBox())!.y);
});

test('notification badges hide zero and announce the full unread count accessibly', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  const alerts = nav.getByRole('link', { name: 'Notifications', exact: true });
  await expect(alerts).toHaveAccessibleDescription('12 unread notifications');
  await expect(alerts.getByText('9+', { exact: true })).toBeVisible();
  await page.evaluate(() => window.renderMobileNavigation('/', 0));
  await expect(alerts).not.toHaveAttribute('aria-describedby');
  await expect(alerts).toHaveText('Alerts');
  await expect(nav.getByText('0', { exact: true })).toHaveCount(0);
});

test('desktop uses the top navigation instead of duplicate bottom tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});


for (const width of [320, 375, 768, 1024, 1440]) {
  test(`guests have the header and responsive navigation at ${width}px without a fake account`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.renderMobileNavigation('/', 0, false));
    const header = page.getByRole('banner');
    await expect(header).toBeVisible();
    await expect(header.getByRole('link', { name: 'Log in', exact: true })).toHaveAttribute('href', '/login');
    await expect(header.getByRole('link', { name: 'Sign up', exact: true })).toHaveAttribute('href', '/signup');
    await expect(header.getByRole('button', { name: 'Log out' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Your profile' })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: width < 768 ? 'Mobile navigation' : 'Primary navigation' });
    await expect(nav).toBeVisible();
    if (width < 768) await checkBar(page);
    else {
      await expect(nav.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Messages', exact: true })).toHaveAttribute('href', '/messages');
      await expect(nav.locator('a[href="/login"]')).toHaveCount(1);
    }
    for (const control of await header.locator('a:visible, button:visible, input:visible').all()) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
for (const pathname of ['/login', '/signup']) {
  test(`guest navigation stays visible on ${pathname}, including after scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 812 });
    await page.evaluate((pathname) => window.renderMobileNavigation(pathname, 0, false), pathname);
    await expect(page.getByRole('banner')).toBeVisible();
    await checkBar(page);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await checkBar(page);
    await expect(page.getByRole('banner')).toBeInViewport();
  });
}
