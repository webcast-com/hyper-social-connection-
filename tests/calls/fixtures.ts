import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

export type Actor = { id: number; name: string; context: BrowserContext; page: Page; errors: string[] };
type Actors = { host: Actor; guest: Actor; outsider: Actor; groupId: number; addMember: (actor: Actor) => Promise<void> };

declare global {
  interface Window {
    __callTest: {
      peers: RTCPeerConnection[];
      tracks: MediaStreamTrack[];
      audioContexts: AudioContext[];
      requests: MediaStreamConstraints[];
      iceErrors: string[];
      delayMedia: boolean;
      denyMedia: boolean;
      releaseMedia: () => void;
    };
  }
}

export const test = base.extend<{ actors: Actors }>({
  actors: async ({ browser, baseURL }, runTest) => {
    const pool = new Pool({ connectionString: process.env.CALL_TEST_DATABASE_URL });
    const contexts: BrowserContext[] = [];
    const userIds: number[] = [];
    let groupId: number | undefined;
    try {
      const createActor = async (role: string): Promise<Actor> => {
        const context = await browser.newContext({ baseURL, permissions: ['camera', 'microphone'] });
        contexts.push(context);
        const name = `Call test ${role}`;
        const response = await context.request.post('/api/auth/signup', {
          data: { name, email: `call-${randomUUID()}@example.test`, password: randomUUID() },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
        const { user } = await response.json();
        userIds.push(user.id);
        await context.addInitScript(() => {
          let releaseMedia!: () => void;
          const mediaGate = new Promise<void>((resolve) => { releaseMedia = resolve; });
          const state: Window['__callTest'] = {
            peers: [], tracks: [], audioContexts: [], requests: [], iceErrors: [],
            delayMedia: false, denyMedia: false, releaseMedia,
          };
          window.__callTest = state;
          const PeerConnection = window.RTCPeerConnection;
          window.RTCPeerConnection = class extends PeerConnection {
            constructor(configuration?: RTCConfiguration) {
              super(configuration);
              state.peers.push(this);
            }
            async addIceCandidate(candidate?: RTCIceCandidateInit | null) {
              try { await super.addIceCandidate(candidate); }
              catch (error) { state.iceErrors.push(String(error)); throw error; }
            }
          };
          const NativeAudioContext = window.AudioContext;
          window.AudioContext = class extends NativeAudioContext {
            constructor(options?: AudioContextOptions) {
              super(options);
              state.audioContexts.push(this);
            }
          };
          const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = async (constraints) => {
            state.requests.push(constraints || {});
            if (state.denyMedia) throw new DOMException('Permission denied for this test', 'NotAllowedError');
            const stream = await getUserMedia(constraints);
            state.tracks.push(...stream.getTracks());
            if (state.delayMedia) await mediaGate;
            return stream;
          };
          // A synthetic display track exercises real replaceTrack/RTP without
          // depending on an interactive OS screen-picker in headless CI.
          navigator.mediaDevices.getDisplayMedia = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 960;
            canvas.height = 540;
            const context = canvas.getContext('2d')!;
            const stream = canvas.captureStream(10);
            const track = stream.getVideoTracks()[0];
            let frame = 0;
            const timer = setInterval(() => {
              context.fillStyle = frame++ % 2 ? '#4f46e5' : '#0f766e';
              context.fillRect(0, 0, canvas.width, canvas.height);
            }, 100);
            const stop = track.stop.bind(track);
            track.stop = () => { clearInterval(timer); stop(); };
            state.tracks.push(track);
            return stream;
          };
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        // Fonts, analytics and seeded avatars are unrelated to call transport.
        await page.route('**/*', (route) => new URL(route.request().url()).origin === baseURL
          ? route.continue() : route.abort());
        return { id: user.id, name, context, page, errors };
      };
      // Sequential signup also lets a cold server finish its schema bootstrap.
      const host = await createActor('host');
      const guest = await createActor('guest');
      const outsider = await createActor('outsider');
      const group = await pool.query<{ id: number }>(
        'INSERT INTO groups (name, admin_id) VALUES ($1, $2) RETURNING id',
        [`Video call regression ${randomUUID()}`, host.id],
      );
      groupId = group.rows[0].id;
      await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2), ($1, $3)', [groupId, host.id, guest.id]);
      await runTest({
        host, guest, outsider, groupId,
        addMember: async (actor) => { await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [groupId, actor.id]); },
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      if (groupId) await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
      if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
      await pool.end();
    }
  },
});

export { expect };

export async function openLobby(actor: Actor, groupId: number) {
  await actor.page.goto(`/groups/${groupId}`);
  // Wait for the SSR button to be hydrated before clicking it.
  await actor.page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) =>
    button.textContent?.includes('Start Call') && Object.keys(button).some((key) => key.startsWith('__reactProps'))));
  await actor.page.getByRole('button', { name: 'Start Call', exact: true }).click();
  await expect(actor.page.getByRole('dialog')).toBeVisible();
  await expect(actor.page.getByText('Checking for a live call…')).toHaveCount(0);
}

export async function startRoom(actor: Actor, groupId: number, callType: 'video' | 'audio' = 'video') {
  await openLobby(actor, groupId);
  if (callType === 'audio') await actor.page.getByRole('button', { name: 'Audio only', exact: true }).click();
  const responsePromise = actor.page.waitForResponse((response) =>
    response.url().endsWith('/api/group-calls') && response.request().method() === 'POST');
  await actor.page.getByRole('dialog').getByRole('button', { name: /^Start (call|a new call anyway)$/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const { call } = await response.json();
  await expect(actor.page.getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
  expect(actor.errors).toEqual([]);
  return call as { id: number; callType: string; creator: { id: number } };
}

export async function joinRoom(actor: Actor, groupId: number) {
  await openLobby(actor, groupId);
  await actor.page.getByRole('button', { name: 'Join now', exact: true }).click();
}

export async function expectConnected(actor: Actor, audioOnly = false, expectedPeers = 1) {
  // Real RTCPeerConnections, ICE and RTP. A local video preview alone is not
  // proof that either person is actually receiving the other person's media.
  await expect.poll(() => actor.page.evaluate(async ({ audioOnly, expectedPeers }) => {
    const peers = window.__callTest.peers.filter((peer) => peer.connectionState !== 'closed');
    if (peers.length !== expectedPeers || peers.some((peer) => peer.connectionState !== 'connected')) return false;
    const receiving = await Promise.all(peers.map(async (peer) => {
      const stats = Array.from((await peer.getStats()).values());
      const audio = stats.some((stat) => stat.type === 'inbound-rtp' && stat.kind === 'audio' && stat.bytesReceived > 0);
      const video = stats.some((stat) => stat.type === 'inbound-rtp' && stat.kind === 'video' && stat.framesDecoded > 0);
      return audio && (audioOnly || video);
    }));
    return receiving.every(Boolean);
  }, { audioOnly, expectedPeers }), { timeout: 45_000, message: `${actor.name} must receive remote RTP` }).toBe(true);
  expect(await actor.page.evaluate(() => window.__callTest.iceErrors)).toEqual([]);
  expect(actor.errors).toEqual([]);
}

export async function expectReleased(actor: Actor) {
  await expect.poll(() => actor.page.evaluate(() => ({
    tracks: window.__callTest.tracks.filter((track) => track.readyState === 'live').length,
    peers: window.__callTest.peers.filter((peer) => peer.connectionState !== 'closed').length,
    monitors: window.__callTest.audioContexts.filter((context) => context.state !== 'closed').length,
  }))).toEqual({ tracks: 0, peers: 0, monitors: 0 });
}

/** Force trickle ICE: a broken candidate handler cannot hide behind candidates in SDP. */
export async function useTrickleIce(actor: Actor, failFirstOffer = false) {
  let failed = false;
  await actor.page.route('**/api/group-calls/signal', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON();
    if (body.kind === 'offer' && failFirstOffer && !failed) {
      failed = true;
      return route.fulfill({ status: 503, json: { error: 'Injected transient signaling failure' } });
    }
    if (body.kind === 'offer' || body.kind === 'answer') {
      const description = JSON.parse(body.payload);
      description.sdp = description.sdp.replace(/^a=(?:candidate:.*|end-of-candidates)\r?\n/gm, '');
      body.payload = JSON.stringify(description);
      return route.continue({ postData: JSON.stringify(body) });
    }
    return route.continue();
  });
}
