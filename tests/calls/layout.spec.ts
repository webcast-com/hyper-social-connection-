import type { Page, TestInfo } from '@playwright/test';
import { test, expect, startRoom, joinRoom, expectConnected } from './fixtures';

const captureLayout = process.env.CALL_TEST_CAPTURE_LAYOUT === '1';
test.setTimeout(captureLayout ? 360_000 : 180_000);

async function capture(page: Page, testInfo: TestInfo, name: string) {
  // Full app screenshots are optional: software-GPU CI can spend many seconds
  // capturing three simultaneous video streams. Geometry/RTP always run.
  if (captureLayout) await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(name) });
}

async function expectCompleteCards(page: Page) {
  await expect.poll(() => page.getByTestId('participant-viewport').evaluate((viewport) => {
    const available = viewport.getBoundingClientRect();
    const cards = Array.from(viewport.querySelectorAll('[data-testid="participant-card"]:not([hidden])'));
    if (!cards.length || available.height < 108) return false;
    const sizes = cards.map((card) => card.getBoundingClientRect());
    return cards.every((card, index) => {
      const bounds = sizes[index];
      const label = card.querySelector('[data-testid="participant-name"]')!.getBoundingClientRect();
      return bounds.width >= 128 && bounds.top >= available.top && bounds.left >= available.left && bounds.right <= available.right && bounds.bottom <= available.bottom && label.bottom <= bounds.bottom && label.top >= bounds.top && Math.abs(bounds.width - sizes[0].width) < 1 && Math.abs(bounds.height - sizes[0].height) < 1;
    });
  }), { message: 'Every displayed card and its name must fit completely within the real call stage' }).toBe(true);
}

async function inboundAudioBytes(page: Page) {
  return page.evaluate(async () => {
    const bytes = await Promise.all(window.__callTest.peers.map(async (peer) => Array.from((await peer.getStats()).values())
      .filter((stat) => stat.type === 'inbound-rtp' && stat.kind === 'audio')
      .reduce((sum: number, stat) => sum + Number(stat.bytesReceived || 0), 0)));
    return bytes.reduce((sum, count) => sum + count, 0);
  });
}

test('real call cards fit chat/mobile/landscape, keep hidden-peer audio, and dismiss names without leaving', async ({ actors }, testInfo) => {
  const { host, guest, outsider: third, groupId, addMember } = actors;
  const page = host.page;
  await page.setViewportSize({ width: 1440, height: 900 });
  await addMember(third);
  await startRoom(host, groupId);
  await joinRoom(guest, groupId);
  await joinRoom(third, groupId);
  await Promise.all([host, guest, third].map((actor) => expectConnected(actor, false, 2)));
  // Exercise the tab a user is actually viewing; background tabs throttle
  // animation/IntersectionObserver work while other peers keep sending RTP.
  await page.bringToFront();
  await expect(page.getByTestId('participant-card')).toHaveCount(3);
  await expect.poll(() => page.locator('video').evaluateAll((videos) => videos.every((element) => {
    const video = element as HTMLVideoElement;
    return Boolean(video.srcObject) && !video.paused && video.videoWidth > 0;
  }))).toBe(true);
  await page.locator('video').evaluateAll((videos) => videos.forEach((element, index) => {
    const video = element as HTMLVideoElement;
    video.dataset.originalIdentity = String(index);
    video.dataset.originalStream = (video.srcObject as MediaStream).id;
  }));

  await expectCompleteCards(page);
  await capture(page, testInfo, 'desktop-three.png');
  await page.getByTitle('Chat', { exact: true }).click();
  await expectCompleteCards(page);
  await capture(page, testInfo, 'desktop-chat.png');
  await page.getByRole('button', { name: 'Close chat' }).click();

  for (const viewport of [{ width: 768, height: 900 }, { width: 375, height: 812 }, { width: 812, height: 375 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await expectCompleteCards(page);
    const controls = await page.getByRole('dialog').locator('button[title]').evaluateAll((buttons) => buttons
      .filter((button) => ['Mute', 'Turn camera off', 'Share your screen', 'Raise hand', 'Chat', 'Audio & video devices'].includes(button.getAttribute('title')!))
      .map((button) => {
        const { left, top, right, bottom, width, height } = button.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      }));
    expect(controls).toHaveLength(6);
    for (const control of controls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.left).toBeGreaterThanOrEqual(0);
      expect(control.top).toBeGreaterThanOrEqual(0);
      expect(control.right).toBeLessThanOrEqual(viewport.width);
      expect(control.bottom).toBeLessThanOrEqual(viewport.height);
    }
    await capture(page, testInfo, `room-${viewport.width}x${viewport.height}.png`);
  }

  // A short, narrow call needs pages. Off-page remote media must stay attached
  // and playing, with actual received RTP continuing (not just a live track).
  await page.setViewportSize({ width: 320, height: 480 });
  await expect(page.getByRole('navigation', { name: 'Participant pages' })).toBeVisible();
  await expectCompleteCards(page);
  await expect(page.getByTestId('participant-card').last()).toBeHidden();
  const lastVideo = page.locator('video').last();
  const time = await lastVideo.evaluate((element) => (element as HTMLVideoElement).currentTime);
  const audioBytes = await inboundAudioBytes(page);
  await expect.poll(() => lastVideo.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(time + 0.2);
  await expect.poll(() => inboundAudioBytes(page)).toBeGreaterThan(audioBytes);
  await page.getByRole('button', { name: 'Next participants' }).click();
  await expectCompleteCards(page);
  await capture(page, testInfo, 'short-mobile-pages.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('navigation', { name: 'Participant pages' })).toHaveCount(0);
  await expectCompleteCards(page);
  expect(await page.locator('video').evaluateAll((videos) => videos.every((element, index) => {
    const video = element as HTMLVideoElement;
    return video.dataset.originalIdentity === String(index) && video.dataset.originalStream === (video.srcObject as MediaStream).id && !video.paused;
  }))).toBe(true);

  const name = page.getByTestId('participant-name').first();
  const popover = page.getByRole('dialog', { name: 'Participant name', exact: true });
  await name.click();
  await expect(popover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(name).toBeFocused();
  await expect(page.getByTitle('Mute', { exact: true })).toBeVisible();
  await name.click();
  await expect(popover).toBeVisible();
  // Native light-dismiss on the backdrop must not also leave the call.
  await page.mouse.click(8, 8);
  await expect(popover).toHaveCount(0);
  await expect(page.getByTitle('Mute', { exact: true })).toBeVisible();
  await expectConnected(host, false, 2);
});
