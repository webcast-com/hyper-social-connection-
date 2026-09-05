import { test, expect, startRoom, joinRoom, expectConnected, expectReleased } from './fixtures';

test.setTimeout(180_000);

test('pinning and shared-screen focus are local views that preserve hidden-peer audio and call cleanup', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  const page = host.page;
  await startRoom(host, groupId);
  await joinRoom(guest, groupId);
  await Promise.all([expectConnected(host), expectConnected(guest)]);
  await page.bringToFront();
  const gallery = page.getByTestId('participant-gallery');
  await expect(gallery).toHaveAttribute('data-view', 'gallery');
  await expect(page.getByTestId('participant-card')).toHaveCount(2);
  await expect.poll(() => page.locator('video').evaluateAll((videos) => videos.every((element) => Boolean((element as HTMLVideoElement).srcObject)))).toBe(true);
  await page.locator('video').evaluateAll((videos) => videos.forEach((element, index) => {
    const video = element as HTMLVideoElement;
    video.dataset.originalIdentity = String(index);
    video.dataset.originalStream = (video.srcObject as MediaStream).id;
  }));
  const peersAndRequests = await page.evaluate(() => ({ peers: window.__callTest.peers.length, requests: window.__callTest.requests.length }));
  const remote = page.locator(`[data-participant-id="${guest.id}"]`);
  const time = await remote.locator('video').evaluate((element) => (element as HTMLVideoElement).currentTime);
  const audioBytes = await page.evaluate(async () => Array.from((await window.__callTest.peers[0].getStats()).values()).find((stat) => stat.type === 'inbound-rtp' && stat.kind === 'audio')?.bytesReceived || 0);

  await page.getByTestId('participant-name').first().click();
  await page.getByRole('dialog', { name: 'Participant name', exact: true }).getByTestId('participant-pin').click();
  await expect(gallery).toHaveAttribute('data-view', 'pinned');
  await expect(remote).toBeHidden();
  await expect.poll(() => remote.locator('video').evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(time + 0.2);
  await expect.poll(() => page.evaluate(async () => Array.from((await window.__callTest.peers[0].getStats()).values()).find((stat) => stat.type === 'inbound-rtp' && stat.kind === 'audio')?.bytesReceived || 0)).toBeGreaterThan(audioBytes);
  await expect(guest.page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
  await page.getByRole('combobox', { name: 'Pinned participant' }).selectOption(String(guest.id));
  await expect(remote).toBeVisible();
  await page.getByRole('combobox', { name: 'Pinned participant' }).focus();
  await page.keyboard.press('Escape');
  await expect(gallery).toHaveAttribute('data-view', 'pinned');
  await expect(page.getByTitle('Mute', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('button', { name: 'Back to gallery', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-view', 'gallery');
  expect(await page.locator('video').evaluateAll((videos) => videos.every((element, index) => {
    const video = element as HTMLVideoElement;
    return video.dataset.originalIdentity === String(index) && video.dataset.originalStream === (video.srcObject as MediaStream).id && !video.paused;
  }))).toBe(true);
  expect(await page.evaluate(() => ({ peers: window.__callTest.peers.length, requests: window.__callTest.requests.length }))).toEqual(peersAndRequests);

  // Actual display replaceTrack and remote decoded frames, not a mocked peer.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTitle('Share your screen', { exact: true }).click();
  await expect.poll(() => guest.page.locator('video').evaluateAll((videos) => videos.some((element) => !(element as HTMLVideoElement).muted && (element as HTMLVideoElement).videoWidth === 960))).toBe(true);
  await expect(gallery).toHaveAttribute('data-view', 'gallery');
  await page.getByTestId('participant-card').first().getByTestId('focus-share').click();
  await expect(gallery).toHaveAttribute('data-view', 'screen');
  await expect(page.locator('video').first()).toHaveCSS('object-fit', 'contain');
  await expect(remote).toBeHidden();
  await expect(guest.page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');
  await expectConnected(host);
  expect(await page.evaluate(() => window.__callTest.peers.length)).toBe(peersAndRequests.peers);
  await page.getByTitle('Stop sharing', { exact: true }).click();
  await expect(gallery).toHaveAttribute('data-view', 'gallery');
  await expect(remote).toBeVisible();

  // Closing while focused must release both displayed and hidden media.
  await page.getByTestId('participant-name').first().click();
  await page.getByRole('dialog', { name: 'Participant name', exact: true }).getByTestId('participant-pin').click();
  await expect(gallery).toHaveAttribute('data-view', 'pinned');
  await page.getByRole('button', { name: 'Close call dialog' }).click();
  await expectReleased(host);
  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});
