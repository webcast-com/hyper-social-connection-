import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { callBrowserLaunchOptions } from './browser-options';
import { test, expect, startRoom, joinRoom, expectConnected, expectReleased } from './fixtures';

// A looping, deterministic broadband microphone signal makes the actual
// WebAudio detector testable. Mute/unmute controls change real outgoing RTP;
// neither the speaking flags nor RTCPeerConnections are mocked in this test.
const microphoneFile = path.resolve('test-results/speaker-microphone.wav');
test.use({ launchOptions: {
  ...callBrowserLaunchOptions,
  args: [...(callBrowserLaunchOptions.args || []), `--use-file-for-fake-audio-capture=${microphoneFile}`],
} });
test.setTimeout(180_000);

test.beforeAll(() => {
  const sampleRate = 48_000;
  const samples = sampleRate * 2;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  let seed = 0x12345678;
  for (let index = 0; index < samples; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x100000000 * 2 - 1;
    const envelope = 0.35 * (0.65 + 0.35 * Math.sin(index / sampleRate * Math.PI * 4));
    wav.writeInt16LE(Math.round(noise * envelope * 32767), 44 + index * 2);
  }
  mkdirSync(path.dirname(microphoneFile), { recursive: true });
  writeFileSync(microphoneFile, wav);
});

test.afterAll(() => { rmSync(microphoneFile, { force: true }); });

test('speaker view follows received audio, respects pins, and keeps every peer and player alive', async ({ actors }) => {
  const { host, guest, outsider: third, groupId, addMember } = actors;
  for (const actor of [host, guest, third]) {
    await actor.context.addInitScript(() => {
      if (!navigator.mediaDevices) return;
      const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (constraints) => getUserMedia(constraints?.audio ? {
        ...constraints,
        // Keep the synthetic fixture signal deterministic. Production calls
        // retain their normal echo cancellation, suppression and gain settings.
        audio: { ...(typeof constraints.audio === 'object' ? constraints.audio : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      } : constraints);
    });
  }
  await addMember(third);
  await startRoom(host, groupId);
  await joinRoom(guest, groupId);
  await joinRoom(third, groupId);
  await Promise.all([host, guest, third].map((actor) => expectConnected(actor, false, 2)));

  await third.page.getByTitle('Mute', { exact: true }).click();
  const page = host.page;
  await page.bringToFront();
  const gallery = page.getByTestId('participant-gallery');
  const guestCard = page.locator(`[data-participant-id="${guest.id}"]`);
  const thirdCard = page.locator(`[data-participant-id="${third.id}"]`);
  await expect(guestCard.getByRole('group')).toHaveAttribute('data-speaking', 'true');
  await expect(thirdCard.getByRole('group')).not.toHaveAttribute('data-speaking', 'true');
  await expect(gallery).toHaveAttribute('data-view', 'gallery');
  await page.locator('video').evaluateAll((videos) => videos.forEach((element, index) => {
    const video = element as HTMLVideoElement;
    video.dataset.originalIdentity = String(index);
    video.dataset.originalStream = (video.srcObject as MediaStream).id;
  }));
  const before = await page.evaluate(() => ({ peers: window.__callTest.peers.length, requests: window.__callTest.requests.length, monitors: window.__callTest.audioContexts.length }));

  await page.getByTestId('participant-name').first().click();
  await page.getByRole('dialog', { name: 'Participant name', exact: true }).getByRole('button', { name: 'Follow active speaker', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-view', 'speaker');
  await expect(gallery).toHaveAttribute('data-focus-participant', String(guest.id));
  await expect(thirdCard).toBeHidden();
  await expect(guest.page.getByTestId('participant-gallery')).toHaveAttribute('data-view', 'gallery');

  await guest.page.getByTitle('Mute', { exact: true }).click();
  await third.page.getByTitle('Unmute', { exact: true }).click();
  await page.bringToFront();
  await expect(thirdCard.getByRole('group', { includeHidden: true })).toHaveAttribute('data-speaking', 'true');
  await expect(gallery).toHaveAttribute('data-focus-participant', String(third.id));
  await expect(guestCard).toBeHidden();
  await expect(page.getByRole('button', { name: 'Back to gallery', exact: true })).toBeVisible();

  // A manual pin beats the still-active third person's voice. The mode switch
  // must not negotiate again, open devices or create additional analysers.
  await page.getByRole('combobox', { name: 'Speaker selection' }).selectOption(String(guest.id));
  await expect(gallery).toHaveAttribute('data-view', 'pinned');
  await expect(gallery).toHaveAttribute('data-focus-participant', String(guest.id));
  expect(await page.evaluate(() => ({ peers: window.__callTest.peers.length, requests: window.__callTest.requests.length, monitors: window.__callTest.audioContexts.length }))).toEqual(before);
  expect(await page.locator('video').evaluateAll((videos) => videos.every((element, index) => {
    const video = element as HTMLVideoElement;
    return video.dataset.originalIdentity === String(index) && video.dataset.originalStream === (video.srcObject as MediaStream).id && !video.paused;
  }))).toBe(true);

  const hiddenVideo = thirdCard.locator('video');
  const time = await hiddenVideo.evaluate((element) => (element as HTMLVideoElement).currentTime);
  await expect.poll(() => hiddenVideo.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(time + 0.2);
  await expect(gallery).toHaveAttribute('data-focus-participant', String(guest.id));
  await guestCard.getByTestId('participant-name').click();
  await page.getByRole('dialog', { name: 'Participant name', exact: true }).getByRole('button', { name: 'Follow active speaker', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-focus-participant', String(third.id));
  await page.getByRole('combobox', { name: 'Speaker selection' }).focus();
  await page.keyboard.press('Escape');
  await expect(gallery).toHaveAttribute('data-view', 'speaker');
  await expect(page.getByTitle('Mute', { exact: true })).toBeVisible();
  await Promise.all([host, guest, third].map((actor) => expectConnected(actor, false, 2)));
  await page.getByRole('button', { name: 'Close call dialog' }).click();
  await expectReleased(host);
  expect(host.errors).toEqual([]);
});
