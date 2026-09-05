import { test, expect, startRoom, joinRoom, expectConnected, expectReleased } from './fixtures';

test.setTimeout(120_000);

test('three members exchange audio and video even when the lowest-ID member joins later', async ({ actors }) => {
  const { host, guest, outsider: third, groupId, addMember } = actors;
  await addMember(third);
  await startRoom(guest, groupId);
  await joinRoom(third, groupId);
  await Promise.all([expectConnected(guest), expectConnected(third)]);
  await joinRoom(host, groupId);
  await Promise.all([host, guest, third].map((actor) => expectConnected(actor, false, 2)));
  for (const actor of [host, guest, third]) {
    await expect(actor.page.getByText('3 people in the call', { exact: true })).toBeVisible();
  }
});

test('slow signaling polls never overlap or duplicate chat, and rejected chat is restored', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  await startRoom(host, groupId);
  await joinRoom(guest, groupId);
  await Promise.all([expectConnected(host), expectConnected(guest)]);
  let inFlight = 0;
  let maximumInFlight = 0;
  let completed = 0;
  await guest.page.route('**/api/group-calls/signal?*', async (route) => {
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    try {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ response });
      completed += 1;
    } finally { inFlight -= 1; }
  });
  await guest.page.getByTitle('Chat', { exact: true }).click();
  await host.page.getByTitle('Chat', { exact: true }).click();
  await host.page.getByRole('textbox', { name: 'Chat message' }).fill('Exactly once despite a slow network');
  await host.page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(guest.page.getByText('Exactly once despite a slow network', { exact: true })).toHaveCount(1);
  await expect.poll(() => completed).toBeGreaterThanOrEqual(2);
  expect(maximumInFlight).toBe(1);
  await expect(guest.page.getByText('Exactly once despite a slow network', { exact: true })).toHaveCount(1);

  await guest.page.route('**/api/group-calls/chat', (route) => route.fulfill({ status: 503, json: { error: 'Chat unavailable. Please retry.' } }));
  await guest.page.getByRole('textbox', { name: 'Chat message' }).fill('Keep my unsent message');
  await guest.page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(guest.page.getByRole('dialog').getByRole('status')).toHaveText('Chat unavailable. Please retry.');
  await expect(guest.page.getByRole('textbox', { name: 'Chat message' })).toHaveValue('Keep my unsent message');
  await guest.page.unrouteAll({ behavior: 'wait' });
});

test('a failed end-for-everyone request leaves the user in the active call with an error', async ({ actors }) => {
  const { host, groupId } = actors;
  const call = await startRoom(host, groupId);
  await host.page.route('**/api/group-calls?*', (route) => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 503, json: { error: 'Could not end the call. Please retry.' } })
    : route.continue());
  await host.page.getByRole('button', { name: 'End call for everyone', exact: true }).click();
  await expect(host.page.getByRole('dialog').getByRole('status')).toContainText('Could not end the call');
  expect(await host.page.evaluate(() => window.__callTest.tracks.some((track) => track.readyState === 'live'))).toBe(true);
  expect((await host.context.request.get(`/api/group-calls/participants?callId=${call.id}`)).status()).toBe(200);
});

test('call controls and chat remain usable at a narrow mobile viewport', async ({ actors }) => {
  const { host, groupId } = actors;
  await host.page.setViewportSize({ width: 375, height: 812 });
  // At this size the group-page button is labelled "Call", not "Start Call".
  await host.page.goto(`/groups/${groupId}`);
  await host.page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) =>
    button.textContent?.includes('Start Call') && Object.keys(button).some((key) => key.startsWith('__reactProps'))));
  await host.page.getByRole('button', { name: 'Call', exact: true }).click();
  await host.page.getByRole('dialog').getByRole('button', { name: 'Start call', exact: true }).click();
  await expect(host.page.getByTitle('Mute', { exact: true })).toBeVisible();
  const dialog = host.page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(375);
  expect(bounds?.height).toBe(812);
  await host.page.getByTitle('Chat', { exact: true }).click();
  await expect(host.page.getByRole('textbox', { name: 'Chat message' })).toBeInViewport();
  await host.page.getByRole('textbox', { name: 'Chat message' }).fill('Mobile chat');
  await host.page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(host.page.getByText('Mobile chat', { exact: true })).toBeVisible();
  await host.page.getByRole('button', { name: 'Close chat' }).click();
  await host.page.getByTitle('Turn camera off', { exact: true }).click();
  await host.page.getByRole('button', { name: 'Leave call', exact: true }).click();
  await expectReleased(host);
});
