import { test, expect, openLobby, startRoom, joinRoom, expectConnected, expectReleased, useTrickleIce } from './fixtures';

test.setTimeout(120_000);

test('two-way video survives delayed permission, trickle ICE, a lost offer, camera toggles and rejoin', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  await useTrickleIce(host, true);
  await useTrickleIce(guest);
  const call = await startRoom(host, groupId);
  await openLobby(guest, groupId);
  await guest.page.evaluate(() => { window.__callTest.delayMedia = true; });
  await guest.page.getByRole('button', { name: 'Join now', exact: true }).click();
  await expect.poll(() => guest.page.evaluate(() => window.__callTest.requests.length)).toBeGreaterThan(0);
  const waiting = await (await host.context.request.get(`/api/group-calls/participants?callId=${call.id}`)).json();
  expect(waiting.participants.map((participant: { userId: number }) => participant.userId)).toEqual([host.id]);
  expect(await guest.page.evaluate(() => window.__callTest.peers.length)).toBe(0);
  await guest.page.evaluate(() => window.__callTest.releaseMedia());
  await Promise.all([expectConnected(host), expectConnected(guest)]);

  const remote = await guest.page.evaluateHandle(() => Array.from(document.querySelectorAll('video')).find((video) => !video.muted)!);
  await host.page.getByTitle('Turn camera off', { exact: true }).click();
  await expect.poll(() => remote.evaluate((video) => getComputedStyle(video).display)).toBe('none');
  expect(await remote.evaluate((video) => video.isConnected && video.srcObject instanceof MediaStream && video.srcObject.getAudioTracks().length === 1)).toBe(true);
  await host.page.getByTitle('Turn camera on', { exact: true }).click();
  await expect.poll(() => remote.evaluate((video) => getComputedStyle(video).display !== 'none' && video.videoWidth > 0)).toBe(true);
  await remote.dispose();
  await host.page.getByTitle('Mute', { exact: true }).click();
  expect(await host.page.evaluate(() => window.__callTest.tracks.filter((track) => track.kind === 'audio' && track.readyState === 'live').every((track) => !track.enabled))).toBe(true);
  await host.page.getByTitle('Unmute', { exact: true }).click();
  await host.page.getByTitle('Raise hand', { exact: true }).click();
  await expect(guest.page.getByText('Hand raised', { exact: true })).toBeVisible();

  await host.page.getByTitle('Chat', { exact: true }).click();
  await guest.page.getByTitle('Chat', { exact: true }).click();
  await host.page.getByRole('textbox', { name: 'Chat message' }).fill('Two-way call verified');
  await host.page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(guest.page.getByText('Two-way call verified', { exact: true })).toHaveCount(1);

  await guest.page.getByRole('button', { name: 'Leave call', exact: true }).click();
  await expectReleased(guest);
  await expect(guest.page.getByRole('button', { name: 'Join now', exact: true })).toBeVisible();
  await guest.page.getByRole('button', { name: 'Join now', exact: true }).click();
  await Promise.all([expectConnected(host), expectConnected(guest)]);
  await guest.page.getByRole('button', { name: 'Close call dialog' }).click();
  await expectReleased(guest);
  await expect.poll(async () => {
    const data = await (await host.context.request.get(`/api/group-calls/participants?callId=${call.id}`)).json();
    return data.participants.map((participant: { userId: number }) => participant.userId);
  }).toEqual([host.id]);
});

test('audio-only calls never request a camera, including joiners with the default video picker', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  await startRoom(host, groupId, 'audio');
  await joinRoom(guest, groupId);
  await Promise.all([expectConnected(host, true), expectConnected(guest, true)]);
  for (const actor of [host, guest]) {
    expect(await actor.page.evaluate(() => window.__callTest.requests.every((request) => request.video === false))).toBe(true);
    await expect(actor.page.getByTitle('Turn camera off', { exact: true })).toHaveCount(0);
    await expect(actor.page.getByText('Live audio call', { exact: true })).toBeVisible();
  }
});

test('the host ending a call automatically closes peers and releases every participant device', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  await startRoom(host, groupId);
  await joinRoom(guest, groupId);
  await Promise.all([expectConnected(host), expectConnected(guest)]);
  await host.page.getByRole('button', { name: 'End call for everyone', exact: true }).click();
  await expect(guest.page.getByText('This call has ended', { exact: true })).toBeVisible();
  await Promise.all([expectReleased(host), expectReleased(guest)]);
});

for (const close of ['X', 'Escape', 'footer', 'backdrop', 'pagehide'] as const) {
  test(`closing with ${close} leaves the call and stops camera, microphone and speaking monitors`, async ({ actors }) => {
    const { host, groupId } = actors;
    const call = await startRoom(host, groupId);
    if (close === 'pagehide') await host.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    if (close === 'X') await host.page.getByRole('button', { name: 'Close call dialog' }).click();
    if (close === 'Escape') await host.page.keyboard.press('Escape');
    if (close === 'footer') await host.page.getByRole('button', { name: 'Leave', exact: true }).click();
    if (close === 'backdrop') await host.page.getByRole('dialog').click({ position: { x: 2, y: 2 } });
    await expectReleased(host);
    await expect.poll(async () => {
      const data = await (await host.context.request.get(`/api/group-calls/participants?callId=${call.id}`)).json();
      return data.participants.length;
    }).toBe(0);
    expect(host.errors).toEqual([]);
  });
}

test('denied permissions do not register a ghost participant or negotiate empty connections', async ({ actors }) => {
  const { host, groupId } = actors;
  await openLobby(host, groupId);
  await host.page.evaluate(() => { window.__callTest.denyMedia = true; });
  await host.page.getByRole('dialog').getByRole('button', { name: 'Start call', exact: true }).click();
  await expect(host.page.getByRole('dialog').getByRole('alert')).toContainText('permission was denied');
  const { calls } = await (await host.context.request.get(`/api/group-calls?groupId=${groupId}&active=true`)).json();
  expect(calls[0].participantCount).toBe(0);
  expect(await host.page.evaluate(() => window.__callTest.peers.length)).toBe(0);
  await expectReleased(host);
});

test('media returned after the dialog closes is stopped instead of opening a hidden call', async ({ actors }) => {
  const { host, groupId } = actors;
  await openLobby(host, groupId);
  await host.page.evaluate(() => { window.__callTest.delayMedia = true; });
  await host.page.getByRole('dialog').getByRole('button', { name: 'Start call', exact: true }).click();
  await expect.poll(() => host.page.evaluate(() => window.__callTest.tracks.length)).toBeGreaterThan(0);
  await host.page.getByRole('button', { name: 'Close call dialog' }).click();
  await host.page.evaluate(() => window.__callTest.releaseMedia());
  await expectReleased(host);
  const { calls } = await (await host.context.request.get(`/api/group-calls?groupId=${groupId}&active=true`)).json();
  expect(calls[0].participantCount).toBe(0);
});

test('screen sharing works with camera off, device switching preserves privacy, and close stops the parked camera', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  await startRoom(host, groupId);
  await joinRoom(guest, groupId);
  await Promise.all([expectConnected(host), expectConnected(guest)]);
  await host.page.getByTitle('Turn camera off', { exact: true }).click();
  await host.page.getByTitle('Share your screen', { exact: true }).click();
  await expect(guest.page.getByText('Sharing', { exact: true })).toBeVisible();
  await expect.poll(() => guest.page.evaluate(() => {
    const remote = Array.from(document.querySelectorAll('video')).find((video) => !video.muted);
    return Boolean(remote && getComputedStyle(remote).display !== 'none' && remote.videoWidth === 960);
  })).toBe(true);
  await host.page.getByTitle('Audio & video devices', { exact: true }).click();
  await host.page.getByRole('button', { name: /fake_device_0/ }).click();
  expect(await host.page.evaluate(() => {
    const liveCameras = window.__callTest.tracks.filter((track) => track.kind === 'video' && track.readyState === 'live' && track.label.includes('fake_device'));
    return liveCameras.length === 1 && !liveCameras[0].enabled;
  })).toBe(true);
  await expect(guest.page.getByText('Sharing', { exact: true })).toBeVisible();
  // The sender must still be sending the display, not the newly selected camera.
  expect(await host.page.evaluate(() => window.__callTest.peers.filter((peer) => peer.connectionState === 'connected').every((peer) =>
    peer.getSenders().find((sender) => sender.track?.kind === 'video')?.track?.label.includes('fake_device') === false))).toBe(true);
  await host.page.getByTitle('Stop sharing', { exact: true }).click();
  await expect(guest.page.getByText('Sharing', { exact: true })).toHaveCount(0);
  await host.page.getByTitle('Share your screen', { exact: true }).click();
  await expect(host.page.getByTitle('Stop sharing', { exact: true })).toBeVisible();
  await host.page.getByRole('button', { name: 'Close call dialog' }).click();
  await expectReleased(host);
});

test('a rejected join is shown to the user and releases acquired devices', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  await startRoom(host, groupId);
  await guest.page.route('**/api/group-calls/participants?*', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 403, json: { error: 'You no longer have access to this call.' } })
    : route.continue());
  await joinRoom(guest, groupId);
  await expect(guest.page.getByRole('dialog').getByRole('alert')).toContainText('You no longer have access');
  await expectReleased(guest);
});
