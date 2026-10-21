import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import type { Scenario } from './browser-fixture';

const png = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9U0AAAAASUVORK5CYII=', 'base64') };
const video = { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('test video bytes') };
const media = { url: '/uploads/new.png', kind: 'image', type: 'image/png', size: png.buffer.length, name: png.name };
let javascript = '';
let css = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.resolve('tests/uploads/browser-fixture.tsx')],
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{
      name: 'server-actions-fixture',
      setup(builder) {
        builder.onResolve({ filter: /^@\/app\/actions$/ }, () => ({ path: path.resolve('tests/uploads/actions-fixture.ts') }));
      },
    }],
  });
  javascript = result.outputFiles[0].text;
  css = (await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') })).css;
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.route('**/*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: javascript });
    if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (pathname === '/api/upload/presign') return route.fulfill({ json: { mode: 'direct' } });
    if (pathname === '/api/upload') return route.fulfill({ json: media });
    if (pathname.startsWith('/uploads/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#abc"/></svg>' });
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;padding:16px;font-family:Arial}#root{max-width:680px;margin:auto}</style></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>' });
    return route.abort();
  });
  await page.goto('http://uploads.test');
  await page.waitForFunction(() => typeof window.renderUploads === 'function');
});

async function render(page: Page, scenario: Scenario, initial = false) {
  await page.evaluate(({ scenario, initial }) => window.renderUploads(scenario, initial), { scenario, initial });
  await expect(page.locator('input[type="file"]').first()).toBeAttached();
}
async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  for (const button of await page.getByRole('button').all()) {
    if (!await button.isVisible()) continue;
    const bounds = await button.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  }
}

const uploadCases: { scenario: Scenario; button: string; picker: string }[] = [
  { scenario: 'post', button: 'Upload from device', picker: 'Upload a photo or video' },
  { scenario: 'composer-story', button: 'Create story', picker: 'Upload story image' },
  { scenario: 'stories', button: 'Create story', picker: 'Upload story image' },
  { scenario: 'message', button: 'Attach photo or video', picker: 'Attach a photo or video' },
  { scenario: 'avatar-field', button: 'Upload photo', picker: 'Upload profile picture' },
  { scenario: 'cover-field', button: 'Upload cover photo', picker: 'Upload cover photo' },
  { scenario: 'group-cover', button: 'Upload cover', picker: 'Upload group cover photo' },
  { scenario: 'profile', button: 'Change profile picture', picker: 'Upload profile picture' },
  { scenario: 'cover', button: 'Change cover photo', picker: 'Upload cover photo' },
];

for (const entry of uploadCases) {
  test(`${entry.scenario}: button opens picker, uploads, and accepts the same file again`, async ({ page }) => {
    await render(page, entry.scenario);
    if (entry.scenario === 'post') await page.getByRole('button', { name: 'Attach photo or video', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: entry.button, exact: true }).click();
    await (await chooser).setFiles(png);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect.poll(async () => {
      if ((entry.scenario === 'stories' || entry.scenario === 'composer-story')) return page.evaluate(() => window.uploadActions.length);
      return page.locator('img[src="/uploads/new.png"]').count();
    }).toBe(1);
    let uploads = 0;
    await page.route('**/api/upload', async (route) => { uploads++; await route.fulfill({ json: media }); });
    await page.getByLabel(entry.picker, { exact: true }).setInputFiles(png);
    await expect.poll(() => uploads).toBe(1);
    if (entry.scenario.endsWith('field') || entry.scenario === 'group-cover') {
      await expect(page.locator('input[type="hidden"]')).toHaveValue(media.url);
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(page.locator('input[type="hidden"]')).toHaveValue('');
    }
    if (entry.scenario === 'post' || entry.scenario === 'message') {
      const submit = page.getByRole('button', { name: entry.scenario === 'post' ? 'Post' : 'Send message', exact: true });
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect.poll(() => page.evaluate(() => window.uploadActions.at(-1)?.value)).toMatchObject({ imageUrl: media.url });
    }
  });

  test(`${entry.scenario}: progress, disabled actions, and retryable errors`, async ({ page }) => {
    await render(page, entry.scenario, true);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/upload', async (route) => {
      await pending;
      await route.fulfill({ status: 500, json: { error: 'Storage unavailable. Please retry.' } });
    });
    await page.getByLabel(entry.picker, { exact: true }).setInputFiles(png);
    await expect(page.getByRole('progressbar')).toBeVisible();
    const uploadButton = page.getByRole('button', { name: entry.scenario === 'post' ? 'Attach photo or video' : entry.scenario === 'message' ? entry.button : entry.scenario === 'profile' || entry.scenario === 'cover' || entry.scenario === 'stories' || entry.scenario === 'composer-story' ? entry.button : 'Uploading…', exact: true });
    await expect(uploadButton).toBeDisabled();
    const remove = page.getByRole('button', { name: 'Remove', exact: true });
    if (await remove.count()) await expect(remove).toBeDisabled();
    await fitsViewport(page);
    release();
    await expect(page.getByRole('alert')).toContainText('Storage unavailable');
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.locator('img[src="/uploads/new.png"]')).toHaveCount(0);
    await page.route('**/api/upload', (route) => route.fulfill({ json: media }));
    await page.getByLabel(entry.picker, { exact: true }).setInputFiles(png);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(async () => {
      if (entry.scenario === 'stories' || entry.scenario === 'composer-story') return page.evaluate(() => window.uploadActions.length);
      return page.locator('img[src="/uploads/new.png"]').count();
    }).toBe(1);
  });
}

for (const width of [320, 375, 768, 1440]) {
  test(`layout at ${width}px: menus are clickable and controls stay inside the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const scenario of ['post', 'message', 'avatar-field', 'cover-field', 'group-cover', 'profile', 'cover'] as Scenario[]) {
      await render(page, scenario, true);
      await fitsViewport(page);
      if (scenario === 'post') {
        const attach = page.getByRole('button', { name: 'Attach photo or video', exact: true });
        await attach.click();
        await expect(page.getByRole('button', { name: 'Upload from device' })).toBeFocused();
        await page.getByRole('button', { name: 'Upload from device' }).click({ trial: true });
        await fitsViewport(page);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(attach).toBeFocused();
      }
      if (scenario === 'message') {
        await page.getByLabel('Attach a photo or video', { exact: true }).setInputFiles(png);
        await expect(page.getByRole('img', { name: 'attachment preview', exact: true })).toBeVisible();
        await fitsViewport(page);
        expect((await page.getByRole('button', { name: 'Send message' }).boundingBox())!.width).toBe(44);
      }
    }
    await render(page, 'profile-header', true);
    await page.getByRole('button', { name: 'Change cover photo', exact: true }).click({ trial: true });
    await page.getByRole('button', { name: 'Remove cover photo', exact: true }).click({ trial: true });
  });
}

test('invalid types and oversized images fail before making an upload request', async ({ page }) => {
  let requests = 0;
  page.on('request', (request) => { if (request.url().includes('/api/upload')) requests++; });
  await render(page, 'post');
  await page.getByLabel('Upload a photo or video', { exact: true }).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert')).toContainText('Only images and videos');
  await page.getByLabel('Upload a photo or video', { exact: true }).setInputFiles({ ...png, buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('Max 15 MB');
  expect(requests).toBe(0);
  await render(page, 'stories');
  await page.getByLabel('Upload story image', { exact: true }).setInputFiles(video);
  await expect(page.getByRole('alert')).toContainText('Please choose an image');
  expect(requests).toBe(0);
});

test('story card keyboard activation opens exactly one picker and Space does not scroll', async ({ page }) => {
  await render(page, 'stories');
  let choosers = 0;
  page.on('filechooser', () => { choosers++; });
  const button = page.getByRole('button', { name: 'Create story' });
  await button.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => choosers).toBe(1);
  await page.keyboard.press('Enter');
  await expect.poll(() => choosers).toBe(2);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('presigned storage uploads are verified and produce video attachments', async ({ page }) => {
  await render(page, 'message');
  await page.route('**/api/upload/presign', (route) => route.fulfill({ json: { mode: 'presigned', uploadUrl: 'http://uploads.test/storage/file', headers: { 'Content-Type': 'video/mp4' }, filename: 'file.mp4', url: '/uploads/file.mp4' } }));
  await page.route('**/storage/file', (route) => route.fulfill({ status: 200 }));
  await page.route('**/api/upload/verify', (route) => route.fulfill({ json: { ...media, kind: 'video', type: 'video/mp4', url: '/uploads/file.mp4' } }));
  await page.getByLabel('Attach a photo or video', { exact: true }).setInputFiles(video);
  await expect(page.locator('video')).toHaveAttribute('src', '/uploads/file.mp4');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect.poll(() => page.evaluate(() => window.uploadActions.at(-1)?.value)).toMatchObject({ videoUrl: '/uploads/file.mp4' });
});

test('storage network failure falls back to the multipart upload endpoint', async ({ page }) => {
  await render(page, 'post');
  await page.route('**/api/upload/presign', (route) => route.fulfill({ json: { mode: 'presigned', uploadUrl: 'http://uploads.test/storage/file', headers: {}, filename: 'file.png', url: media.url } }));
  await page.route('**/storage/file', (route) => route.abort('failed'));
  await page.getByLabel('Upload a photo or video', { exact: true }).setInputFiles(png);
  await expect(page.getByRole('img', { name: 'preview', exact: true })).toHaveAttribute('src', media.url);
});

test('failed profile persistence keeps the saved photo and cover instead of showing unsaved changes', async ({ page }) => {
  await page.evaluate(() => { window.failUploadAction = true; });
  for (const scenario of ['profile', 'cover'] as Scenario[]) {
    await render(page, scenario, true);
    await page.locator('input[type="file"]').setInputFiles(png);
    await expect(page.getByRole('alert')).toContainText('Could not save');
    await expect(page.locator('img')).toHaveAttribute('src', '/uploads/old.png');
    if (scenario === 'profile') {
      const alert = await page.getByRole('alert').boundingBox();
      const following = await page.getByTestId('following-content').boundingBox();
      expect(alert!.y + alert!.height).toBeLessThanOrEqual(following!.y);
    }
  }
  await page.getByRole('button', { name: 'Remove cover photo' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.locator('img')).toHaveAttribute('src', '/uploads/old.png');
});

for (const dark of [false, true]) {
  test(`large upload progress fits a narrow profile column (${dark ? 'dark' : 'light'} mode)`, async ({ page }) => {
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle('dark', dark);
      window.renderUploads('progress');
    }, dark);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
    const metrics = await page.locator('#root > div').evaluate((column) => ({ width: column.clientWidth, scrollWidth: column.scrollWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
    await expect(page.getByText('250.0 MB', { exact: false })).toBeVisible();
  });
}

test('cancelling a picker does not upload or change an existing attachment', async ({ page }) => {
  await render(page, 'avatar-field', true);
  let uploads = 0;
  page.on('request', (request) => { if (request.url().includes('/api/upload')) uploads++; });
  await page.getByLabel('Upload profile picture', { exact: true }).setInputFiles([]);
  await expect(page.locator('input[name="avatar"]')).toHaveValue('/uploads/old.png');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(uploads).toBe(0);
});
