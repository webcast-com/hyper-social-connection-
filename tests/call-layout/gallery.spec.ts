import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import type { LayoutScenario } from './browser-fixture';

let javascript = '';
let css = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.resolve('tests/call-layout/browser-fixture.tsx')],
    bundle: true,
    write: false,
    outfile: 'fixture.js',
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  javascript = result.outputFiles.find((file) => file.path.endsWith('.js'))!.text;
  css = result.outputFiles.find((file) => file.path.endsWith('.css'))!.text;
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Serve the actual components/CSS in an isolated browser origin. There is no
  // test route in the app, mocked signaling, database or external network call.
  await page.route('**/*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: javascript });
    if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>*,*::before,*::after{box-sizing:border-box}body{margin:16px;font-family:Arial,sans-serif;background:#eef2ff}button{font-family:inherit}</style></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>` });
  });
  await page.goto('http://call-layout.test');
  await page.waitForFunction(() => typeof window.renderCallLayout === 'function');
});

async function render(page: Page, scenario: Partial<LayoutScenario>) {
  await page.evaluate((next) => window.renderCallLayout(next), scenario);
  if (scenario.count !== undefined) await expect(page.getByTestId('participant-card')).toHaveCount(scenario.count);
  if (scenario.width !== undefined) await expect(page.getByTestId('layout-stage')).toHaveCSS('width', `${scenario.width}px`);
  if (scenario.height !== undefined) await expect(page.getByTestId('layout-stage')).toHaveCSS('height', `${scenario.height}px`);
  // ResizeObserver and React commit separately. Two browser frames settle the
  // measured geometry without wall-clock sleeps or intrinsic-media assumptions.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function assertCardsFit(page: Page) {
  const metrics = await page.evaluate(() => {
    const rect = (element: Element) => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    const gallery = document.querySelector('[data-testid="participant-gallery"]')!;
    const viewport = document.querySelector('[data-testid="participant-viewport"]')!;
    const cards = Array.from(document.querySelectorAll('[data-testid="participant-card"]:not([hidden])')).map((card) => {
      const media = card.querySelector('[data-testid="participant-media"]')!;
      const name = card.querySelector('[data-testid="participant-name"]')!;
      const avatar = card.querySelector('[data-testid="participant-avatar"]');
      return { bounds: rect(card), media: rect(media), name: rect(name), fontSize: getComputedStyle(name).fontSize, avatar: avatar ? rect(avatar) : null };
    });
    const pager = document.querySelector('nav[aria-label="Participant pages"]');
    const focusControls = document.querySelector('[data-testid="focus-controls"]');
    return { gallery: rect(gallery), viewport: rect(viewport), cards, view: gallery.getAttribute('data-view'), pager: pager ? rect(pager) : null, focusControls: focusControls ? rect(focusControls) : null, pageWidth: document.documentElement.scrollWidth };
  });
  expect(metrics.cards.length).toBeGreaterThan(0);
  for (const card of metrics.cards) {
    expect(card.bounds.left).toBeGreaterThanOrEqual(metrics.viewport.left + 1);
    expect(card.bounds.top).toBeGreaterThanOrEqual(metrics.viewport.top + 1);
    expect(card.bounds.right).toBeLessThanOrEqual(metrics.viewport.right - 1);
    expect(card.bounds.bottom).toBeLessThanOrEqual(metrics.viewport.bottom - 1);
    expect(Math.abs(card.bounds.width - metrics.cards[0].bounds.width)).toBeLessThan(1);
    expect(Math.abs(card.bounds.height - metrics.cards[0].bounds.height)).toBeLessThan(1);
    expect(card.bounds.width).toBeGreaterThanOrEqual(128);
    if (metrics.view !== 'screen') expect(Math.abs(card.media.width - card.media.height * 16 / 9)).toBeLessThan(2);
    expect(card.name.top).toBeGreaterThanOrEqual(card.media.bottom);
    expect(card.name.bottom).toBeLessThanOrEqual(card.bounds.bottom);
    expect(card.name.left).toBeGreaterThanOrEqual(card.bounds.left);
    expect(card.name.right).toBeLessThanOrEqual(card.bounds.right);
    expect(card.fontSize).toBe('14px');
    if (card.avatar) {
      expect(card.avatar.top).toBeGreaterThanOrEqual(card.media.top);
      expect(card.avatar.bottom).toBeLessThanOrEqual(card.media.bottom);
      expect(card.avatar.width).toBeLessThanOrEqual(Math.min(card.media.width, card.media.height));
    }
  }
  for (let a = 0; a < metrics.cards.length; a++) {
    for (let b = a + 1; b < metrics.cards.length; b++) {
      const first = metrics.cards[a].bounds;
      const second = metrics.cards[b].bounds;
      expect(first.right <= second.left || second.right <= first.left || first.bottom <= second.top || second.bottom <= first.top).toBe(true);
    }
  }
  if (metrics.pager) {
    if (metrics.pager.left >= metrics.viewport.right - 1) {
      expect(metrics.pager.right).toBeLessThanOrEqual(metrics.gallery.right + 1);
    } else {
      expect(metrics.pager.top).toBeGreaterThanOrEqual(metrics.viewport.bottom - 1);
    }
    expect(metrics.pager.bottom).toBeLessThanOrEqual(metrics.gallery.bottom + 1);
    for (const button of await page.getByRole('navigation', { name: 'Participant pages' }).getByRole('button').all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
  }
  if (metrics.focusControls) {
    const controls = metrics.focusControls;
    expect(controls.left).toBeGreaterThanOrEqual(metrics.gallery.left);
    expect(controls.right).toBeLessThanOrEqual(metrics.gallery.right + 1);
    expect(controls.bottom).toBeLessThanOrEqual(metrics.gallery.bottom + 1);
    expect(controls.left >= metrics.viewport.right - 1 || controls.top >= metrics.viewport.bottom - 1).toBe(true);
    for (const element of await page.getByTestId('focus-controls').locator('button, select').all()) {
      const bounds = (await element.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(controls.left);
      expect(bounds.y).toBeGreaterThanOrEqual(controls.top);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(controls.right + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(controls.bottom + 1);
    }
  }
  expect(metrics.pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  return metrics;
}

async function capture(page: Page, testInfo: TestInfo) {
  const file = testInfo.outputPath('cards.png');
  await page.getByTestId('layout-stage').screenshot({ path: file });
  await testInfo.attach('Participant layout', { path: file, contentType: 'image/png' });
}

const containers = [
  { name: 'desktop', width: 1118, height: 543 },
  { name: 'desktop with chat', width: 798, height: 543 },
  { name: 'tablet with chat', width: 358, height: 470 },
  { name: 'mobile portrait', width: 343, height: 490 },
  { name: 'mobile landscape', width: 776, height: 174 },
  { name: 'small mobile landscape', width: 544, height: 117 },
];

for (const container of containers) {
  for (const count of [1, 2, 3, 4, 6]) {
    test(`${container.name}: ${count} complete equal cards with mixed camera ratios`, async ({ page }, testInfo) => {
      await render(page, { ...container, count });
      await expect.poll(() => page.locator('video').evaluateAll((videos) => videos.every((video) => (video as HTMLVideoElement).videoWidth > 0))).toBe(true);
      await assertCardsFit(page);
      await capture(page, testInfo);
    });
  }
}

test('camera off and audio-only avatars never change the card geometry', async ({ page }, testInfo) => {
  await render(page, { count: 6, width: 343, height: 490 });
  const before = await assertCardsFit(page);
  for (const state of [{ cameraOff: true }, { avatar: true }, { cameraOff: false, audioOnly: true }]) {
    await render(page, state);
    const after = await assertCardsFit(page);
    expect(after.cards.map((card) => card.bounds)).toEqual(before.cards.map((card) => card.bounds));
    await expect(page.getByTestId('participant-avatar')).toHaveCount(6);
    expect(await page.locator('video').evaluateAll((videos) => videos.every((video) => getComputedStyle(video).display === 'none'))).toBe(true);
  }
  await capture(page, testInfo);
});

test('undecoded/loading sources fit exactly like live streams', async ({ page }, testInfo) => {
  await render(page, { count: 6, width: 1118, height: 543, loading: true });
  const loading = await assertCardsFit(page);
  await expect(page.getByText('Connecting…', { exact: true })).toHaveCount(6);
  await capture(page, testInfo);
  await render(page, { loading: false });
  const live = await assertCardsFit(page);
  expect(live.cards.map((card) => card.bounds)).toEqual(loading.cards.map((card) => card.bounds));
});

test('shared screens use contain without mirroring and keep names below the media', async ({ page }, testInfo) => {
  await render(page, { count: 3, width: 1118, height: 543, sharing: true });
  const videos = page.locator('video');
  await expect(videos.first()).toHaveCSS('object-fit', 'contain');
  await expect(videos.first()).toHaveCSS('transform', 'none');
  await expect(videos.nth(1)).toHaveCSS('object-fit', 'cover');
  const before = await assertCardsFit(page);
  await capture(page, testInfo);
  await render(page, { sharing: false });
  await expect(videos.first()).toHaveCSS('object-fit', 'cover');
  await expect(videos.first()).not.toHaveCSS('transform', 'none');
  const after = await assertCardsFit(page);
  expect(after.cards.map((card) => card.bounds)).toEqual(before.cards.map((card) => card.bounds));
});

test('compact hand/sharing badges and the speaking ring remain inside small cards', async ({ page }, testInfo) => {
  await render(page, { count: 6, width: 343, height: 490, badges: true, cameraOff: true });
  await assertCardsFit(page);
  const badges = await page.getByRole('img', { name: 'Hand raised' }).evaluateAll((elements) => elements.map((element) => ({ width: element.getBoundingClientRect().width, textDisplay: getComputedStyle(element.querySelector('span')!).display })));
  expect(badges).toHaveLength(6);
  for (const badge of badges) {
    expect(badge.width).toBeLessThan(30);
    expect(badge.textDisplay).toBe('none');
  }
  const ring = await page.getByTestId('participant-card').first().getByRole('group').evaluate((card) => getComputedStyle(card).boxShadow);
  expect(ring).toContain('rgb(52, 211, 153)');
  await capture(page, testInfo);
});

test('pagination and container-only resizing preserve every video, stream and off-page audio clock', async ({ page }, testInfo) => {
  await render(page, { count: 6, width: 320, height: 270 });
  await assertCardsFit(page);
  await expect(page.getByRole('navigation', { name: 'Participant pages' })).toBeVisible();
  await expect.poll(() => page.locator('video').evaluateAll((videos) => videos.every((element) => !(element as HTMLVideoElement).paused && (element as HTMLVideoElement).readyState >= 2))).toBe(true);
  await page.locator('video').evaluateAll((videos) => {
    window.savedCardVideos = videos as HTMLVideoElement[];
    window.savedCardStreams = window.savedCardVideos.map((video) => video.srcObject);
  });
  const time = await page.locator('video').first().evaluate((video) => (video as HTMLVideoElement).currentTime);
  await page.getByRole('button', { name: 'Next participants' }).click();
  await assertCardsFit(page);
  await expect(page.getByTestId('participant-card').first()).toBeHidden();
  await expect.poll(() => page.locator('video').first().evaluate((video) => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(time + 0.2);
  await capture(page, testInfo);

  await render(page, { width: 1118, height: 543 });
  await expect(page.getByRole('navigation', { name: 'Participant pages' })).toHaveCount(0);
  await assertCardsFit(page);
  await render(page, { width: 320, height: 270, cameraOff: true });
  await assertCardsFit(page);
  expect(await page.locator('video').evaluateAll((videos) => videos.every((element, index) => {
    const video = element as HTMLVideoElement;
    return video === window.savedCardVideos![index] && video.srcObject === window.savedCardStreams![index] && !video.paused && (video.srcObject as MediaStream).getAudioTracks().every((track) => track.enabled && track.readyState === 'live');
  }))).toBe(true);

  // A departing page's participants must not leave a blank/out-of-range page.
  await render(page, { count: 1 });
  await expect(page.getByTestId('participant-card').first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Participant pages' })).toHaveCount(0);
  await assertCardsFit(page);
});

test('rooms larger than nine show complete pages and a centered incomplete last row', async ({ page }, testInfo) => {
  await render(page, { count: 12, width: 1118, height: 543 });
  await expect(page.locator('[data-testid="participant-card"]:not([hidden])')).toHaveCount(9);
  await assertCardsFit(page);
  await page.getByRole('button', { name: 'Next participants' }).click();
  const metrics = await assertCardsFit(page);
  expect(metrics.cards).toHaveLength(3);
  const middle = metrics.cards[1].bounds;
  expect(Math.abs((middle.left + middle.right) / 2 - (metrics.viewport.left + metrics.viewport.right) / 2)).toBeLessThan(1);
  await expect(page.getByRole('button', { name: 'Next participants' })).toBeDisabled();
  await capture(page, testInfo);
});

test('long names are readable with touch or keyboard, and Escape only dismisses the name', async ({ page }, testInfo) => {
  await render(page, { count: 6, width: 343, height: 490 });
  const name = page.getByTestId('participant-name').first();
  await expect(page.getByRole('dialog', { name: 'Participant name' })).toHaveCount(0);
  await expect(name).toHaveAttribute('title', /Community events and accessibility coordinator/);
  await name.focus();
  await page.keyboard.press('Enter');
  const popover = page.getByRole('dialog', { name: 'Participant name' });
  await expect(popover).toBeVisible();
  await expect(popover.getByRole('button', { name: 'Close participant name' })).toBeFocused();
  await expect(popover.locator('p')).toHaveText(/Community events and accessibility coordinator/);
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(name).toBeFocused();
  await name.click();
  await expect(popover).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('full-name.png') });
  await popover.getByRole('button', { name: 'Close participant name' }).click();
  await expect(popover).toHaveCount(0);
  await assertCardsFit(page);
});

async function pinParticipant(page: Page, id: number) {
  const name = page.locator(`[data-participant-id="${id}"]`).getByTestId('participant-name');
  await name.click();
  await page.getByRole('dialog', { name: 'Participant name', exact: true }).getByTestId('participant-pin').click();
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'pinned');
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', String(id));
}

for (const container of containers) {
  test(`${container.name}: pinning and screen focus fit without losing the gallery`, async ({ page }, testInfo) => {
    await render(page, { ...container, count: 6 });
    const before = await assertCardsFit(page);
    await pinParticipant(page, 1);
    await expect(page.locator('[data-testid="participant-card"]:not([hidden])')).toHaveCount(1);
    const pinned = await assertCardsFit(page);
    expect(pinned.cards[0].bounds.width).toBeGreaterThanOrEqual(before.cards[0].bounds.width);
    await capture(page, testInfo);

    await render(page, { sharing: true });
    await page.getByTestId('participant-card').first().getByTestId('focus-share').click();
    await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'screen');
    const screen = await assertCardsFit(page);
    expect(screen.cards).toHaveLength(1);
    expect(screen.cards[0].bounds.width).toBeGreaterThanOrEqual(pinned.cards[0].bounds.width);
    expect(screen.cards[0].bounds.height).toBeGreaterThanOrEqual(pinned.cards[0].bounds.height);
    await expect(page.locator('video').first()).toHaveCSS('object-fit', 'contain');
    await expect(page.locator('video').first()).toHaveCSS('transform', 'none');
    await page.getByTestId('layout-stage').screenshot({ path: testInfo.outputPath('screen-focus.png') });
    await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
    await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
    await expect(page.getByTestId('participant-name').first()).toBeFocused();
    await assertCardsFit(page);
  });
}

test('focus keeps every media element, stream and hidden audio clock alive across mode changes', async ({ page }) => {
  await render(page, { count: 6, width: 1118, height: 543 });
  await expect.poll(() => page.locator('video').evaluateAll((videos) => videos.every((element) => !(element as HTMLVideoElement).paused && (element as HTMLVideoElement).readyState >= 2))).toBe(true);
  await page.locator('video').evaluateAll((videos) => {
    window.savedCardVideos = videos as HTMLVideoElement[];
    window.savedCardStreams = window.savedCardVideos.map((video) => video.srcObject);
  });
  const time = await page.locator('video').last().evaluate((element) => (element as HTMLVideoElement).currentTime);
  await pinParticipant(page, 1);
  await expect(page.getByTestId('participant-card').last()).toBeHidden();
  await expect.poll(() => page.locator('video').last().evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(time + 0.2);
  await page.getByRole('combobox', { name: 'Pinned participant' }).selectOption('6');
  await render(page, { width: 343, height: 490, sharingIds: [6] });
  await page.getByTestId('participant-card').last().getByTestId('focus-share').click();
  await render(page, { width: 544, height: 117 });
  await assertCardsFit(page);
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await assertCardsFit(page);
  await expect(page.getByTestId('participant-card').last()).toBeVisible();
  await expect(page.getByTestId('participant-name').last()).toBeFocused();
  expect(await page.locator('video').evaluateAll((videos) => videos.every((element, index) => {
    const video = element as HTMLVideoElement;
    return video === window.savedCardVideos![index] && video.srcObject === window.savedCardStreams![index] && !video.paused && (video.srcObject as MediaStream).getAudioTracks().every((track) => track.enabled && track.readyState === 'live');
  }))).toBe(true);
});

test('departures and stopped shares reset focus without reviving stale selections', async ({ page }) => {
  await render(page, { count: 6 });
  await pinParticipant(page, 6);
  await render(page, { count: 5 });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
  await render(page, { count: 6 });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');

  await render(page, { sharingIds: [1, 2] });
  // New shares don't steal the viewer's current layout.
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
  await page.getByTestId('participant-card').first().getByTestId('focus-share').click();
  await page.getByRole('combobox', { name: 'Shared screen' }).selectOption('2');
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '2');
  await render(page, { sharingIds: [1] });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
  await render(page, { sharingIds: [1, 2] });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
  // Pinning a person, unlike focusing their screen, survives stopping sharing.
  await pinParticipant(page, 2);
  await render(page, { sharingIds: [], speakerId: 3 });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'pinned');
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '2');
  await assertCardsFit(page);
});

test('camera-off and audio-only pinned views keep their avatar and hide the video', async ({ page }, testInfo) => {
  await render(page, { count: 6, width: 343, height: 490, cameraOff: true, avatar: true });
  await pinParticipant(page, 2);
  await assertCardsFit(page);
  await expect(page.getByTestId('participant-card').nth(1).getByTestId('participant-avatar')).toBeVisible();
  await render(page, { cameraOff: false, audioOnly: true });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'pinned');
  await expect(page.getByTestId('participant-card').nth(1).getByTestId('participant-avatar')).toBeVisible();
  expect(await page.locator('video').evaluateAll((videos) => videos.every((video) => getComputedStyle(video).display === 'none'))).toBe(true);
  await assertCardsFit(page);
  await capture(page, testInfo);
});

test('keyboard pin/unpin actions restore focus and keep full-name dismissal separate', async ({ page }) => {
  await render(page, { count: 3 });
  const name = page.getByTestId('participant-name').nth(1);
  await name.focus();
  await page.keyboard.press('Enter');
  const popover = page.getByRole('dialog', { name: 'Participant name', exact: true });
  await popover.getByTestId('participant-pin').focus();
  await page.keyboard.press('Enter');
  await expect(popover).toHaveCount(0);
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'pinned');
  await expect(name).toBeFocused();
  const picker = page.getByRole('combobox', { name: 'Pinned participant' });
  await picker.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'pinned');
  await expect(picker).toBeFocused();
  await name.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'pinned');
  await expect(name).toBeFocused();
  await page.keyboard.press('Enter');
  await popover.getByRole('button', { name: 'Unpin Maya Patel', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
  await expect(name).toBeFocused();
});

test('a portrait shared window uses the full focus height instead of a camera frame', async ({ page }, testInfo) => {
  await render(page, { count: 3, width: 343, height: 490, sharingIds: [2] });
  const card = page.getByTestId('participant-card').nth(1);
  await expect.poll(() => card.locator('video').evaluate((element) => (element as HTMLVideoElement).videoHeight)).toBe(1280);
  const before = (await card.getByTestId('participant-media').boundingBox())!;
  await card.getByTestId('focus-share').click();
  const focused = await assertCardsFit(page);
  expect(focused.cards).toHaveLength(1);
  expect(focused.cards[0].media.height).toBeGreaterThan(before.height * 2);
  await expect(card.locator('video')).toHaveCSS('object-fit', 'contain');
  await capture(page, testInfo);
});

async function followSpeaker(page: Page) {
  await page.locator('[data-testid="participant-card"]:not([hidden])').first().getByTestId('participant-name').click();
  await page.getByRole('dialog', { name: 'Participant name', exact: true }).getByRole('button', { name: 'Follow active speaker', exact: true }).click();
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'speaker');
  await expect(page.getByRole('button', { name: 'Back to gallery', exact: true })).toBeFocused();
}

for (const container of containers) {
  test(`${container.name}: optional speaker view keeps a complete card and reachable controls`, async ({ page }, testInfo) => {
    await render(page, { ...container, count: 6, speakerId: 2, mutedIds: [] });
    await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
    await followSpeaker(page);
    await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '2');
    await expect(page.locator('[data-testid="participant-card"]:not([hidden])')).toHaveCount(1);
    await expect(page.getByRole('combobox', { name: 'Speaker selection' })).toHaveValue('automatic');
    await assertCardsFit(page);
    await capture(page, testInfo);
  });
}

test('speaker changes preserve player/stream identity, hidden audio and manual-view priority', async ({ page }) => {
  await render(page, { count: 6, speakerId: 2, mutedIds: [] });
  const intervals = await page.evaluate(() => window.layoutIntervalCount());
  await expect.poll(() => page.locator('video').evaluateAll((videos) => videos.every((element) => !(element as HTMLVideoElement).paused && (element as HTMLVideoElement).readyState >= 2))).toBe(true);
  await page.locator('video').evaluateAll((videos) => {
    window.savedCardVideos = videos as HTMLVideoElement[];
    window.savedCardStreams = window.savedCardVideos.map((video) => video.srcObject);
  });
  await followSpeaker(page);
  await expect.poll(() => page.evaluate(() => window.layoutIntervalCount())).toBe(intervals + 1);
  const time = await page.locator('video').last().evaluate((element) => (element as HTMLVideoElement).currentTime);
  await render(page, { speakerId: 3 });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '3');
  await expect.poll(() => page.locator('video').last().evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(time + 0.2);

  // Choosing a person from the automatic picker creates an explicit pin.
  await page.getByRole('combobox', { name: 'Speaker selection' }).selectOption('2');
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'pinned');
  await expect.poll(() => page.evaluate(() => window.layoutIntervalCount())).toBe(intervals);
  await render(page, { speakerId: 4, sharingIds: [2] });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '2');
  await page.getByTestId('participant-card').nth(1).getByTestId('focus-share').click();
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'screen');
  await render(page, { speakerId: 5, width: 544, height: 117 });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '2');
  await assertCardsFit(page);
  expect(await page.evaluate(() => window.layoutIntervalCount())).toBe(intervals);
  expect(await page.locator('video').evaluateAll((videos) => videos.every((element, index) => {
    const video = element as HTMLVideoElement;
    return video === window.savedCardVideos![index] && video.srcObject === window.savedCardStreams![index] && !video.paused;
  }))).toBe(true);
  await followSpeaker(page);
  await expect.poll(() => page.evaluate(() => window.layoutIntervalCount())).toBe(intervals + 1);
  await page.evaluate(() => window.unmountCallLayout());
  await expect(page.getByTestId('participant-gallery')).toHaveCount(0);
  expect(await page.evaluate(() => window.layoutIntervalCount())).toBe(intervals);
});

test('speaker view pauses for participant options and does not lose keyboard focus when it resumes', async ({ page }) => {
  // Install the clock before a fresh fixture creates its timers.
  await page.clock.install();
  await page.reload();
  await render(page, { count: 3, speakerId: 2, mutedIds: [] });
  await followSpeaker(page);
  await page.clock.runFor(250);
  const currentName = page.getByTestId('participant-name').nth(1);
  await currentName.click();
  await render(page, { speakerId: 3 });
  await page.clock.fastForward(4000);
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '2');
  await page.keyboard.press('Escape');
  await expect(currentName).toBeFocused();
  await page.clock.runFor(800);
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '3');
  await expect(page.getByRole('button', { name: 'Back to gallery', exact: true })).toBeFocused();
  await page.getByRole('combobox', { name: 'Speaker selection' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'speaker');
  await expect(page.getByRole('button', { name: 'Back to gallery', exact: true })).toBeFocused();
});

test('speaker view handles audio-only, silence, departures and disconnects without following the local preview', async ({ page }) => {
  await render(page, { count: 3, speakerId: 3, mutedIds: [], cameraOff: true, audioOnly: true });
  await followSpeaker(page);
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '3');
  await expect(page.getByTestId('participant-card').nth(2).getByTestId('participant-avatar')).toBeVisible();
  await render(page, { speakerId: 1, mutedIds: [3] });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '3');
  await render(page, { disconnectedIds: [3] });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '2');
  await render(page, { count: 1 });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-focus-participant', '1');
  await assertCardsFit(page);
  await render(page, { count: 0 });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
  await render(page, { count: 3, speakerId: 2, disconnectedIds: [], mutedIds: [] });
  await expect(page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
});

test('muted participants never show a speaking ring even with a stale activity flag', async ({ page }) => {
  await render(page, { count: 3, speakerId: 2, mutedIds: [2] });
  const card = page.getByTestId('participant-card').nth(1).getByRole('group');
  await expect(card).not.toHaveAttribute('data-speaking', 'true');
  expect(await card.evaluate((element) => getComputedStyle(element).boxShadow)).not.toContain('rgb(52, 211, 153)');
  await render(page, { mutedIds: [] });
  await expect(card).toHaveAttribute('data-speaking', 'true');
});
