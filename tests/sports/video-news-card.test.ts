import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard, findButton } from './leaders-post-cards';
import type { SportsVideoNewsClip } from '../../src/lib/espn-video-news';

/**
 * The league video clip card in the feeds section.
 *
 * This card is separate from the match highlights play card on purpose, so its
 * contract is its own: a listing carries no media URL, so nothing is fetched
 * until a reader presses play; the rendition ESPN serves is chosen against what
 * this browser can actually play; and when ESPN will not serve the file, the
 * card offers its labelled link out instead of a player that does nothing.
 */

const clip = (over: Partial<SportsVideoNewsClip> = {}): SportsVideoNewsClip => ({
  id: 'espn-video-epl-49983806',
  clipId: '49983806',
  title: 'Saka curls Arsenal ahead at Brighton',
  description: 'A first-time finish from the edge of the box.',
  league: 'epl',
  leagueName: 'Premier League',
  sport: 'football',
  teams: ['Arsenal', 'Brighton'],
  publishedAt: '2026-11-08T18:05:00Z',
  page: 'https://www.espn.com/video/clip/_/id/49983806',
  thumbnail: 'https://a.espncdn.com/photo/49983806.jpg',
  ...over,
});

async function mountClip(props: Partial<SportsVideoNewsClip> = {}, options: { signedIn?: boolean; respond?: (url: string) => Promise<Response> | Response } = {}) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  // An empty leaders board keeps the shared document clean for this section.
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const SportsVideoNewsCard = (await import('../../src/components/SportsVideoNewsCard')).default;
  const { createRoot } = await import('react-dom/client');
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(SportsVideoNewsCard as never, {
    clip: clip(props),
    currentUser: options.signedIn ? { id: 1, name: 'Review User' } : undefined,
  } as never)); });

  return {
    ...mounted,
    card: () => container.querySelector('article')!,
    video: () => container.querySelector('video'),
    poster: () => container.querySelector('img[src*="photo"]'),
    playButton: () => findButton(mounted.document, `Play ${clip(props).title}`),
    // Only the card's own root comes down here; the shared leaders root belongs
    // to the harness, and both are removed so the next test starts clean.
    unmount: async () => {
      await act(() => root.unmount());
      container.remove();
      await mounted.unmount();
    },
  };
}

/**
 * Type into the composer. React reads a controlled textarea through its own
 * value tracker, so the value is set with the textarea's native setter and the
 * change is announced the way a browser does — the harness's own `type` helper
 * drives inputs, not textareas.
 */
async function typeNote(mount: { window: any; document: any }, value: string) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  const area = mount.document.querySelector('textarea')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(mount.window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(area, value);
    area.dispatchEvent(new mount.window.Event('input', { bubbles: true }));
  });
}

const media = (over: Record<string, unknown> = {}) =>
  Response.json({ id: '49983806', playable: true, page: 'https://www.espn.com/video/clip/_/id/49983806', duration: 47, ...over });

test('a clip card shows a poster and asks for the file only when a reader plays it', async () => {
  const mount = await mountClip();
  try {
    const card = mount.card();
    // The listing's own words: league, sport label, title, description, teams.
    assert.match(card.textContent, /Premier League video · Football/);
    assert.match(card.textContent, /Saka curls Arsenal ahead at Brighton/);
    assert.match(card.textContent, /A first-time finish from the edge of the box\./);
    assert.match(card.textContent, /Hyper Sports/);

    // A poster and a play button — no player, and no request nobody asked for.
    assert.equal(mount.video(), null, 'no video element before play');
    assert.equal(mount.poster()!.getAttribute('src'), 'https://a.espncdn.com/photo/49983806.jpg');
    assert.ok(mount.playButton(), 'the poster is the play control');

    // Teams are shown as ESPN reported them; a league clip has no fixture, so
    // nothing here invents a "Home vs Away".
    const chips = [...card.querySelectorAll('span')].map((node: any) => node.textContent.trim());
    assert.ok(chips.includes('Arsenal') && chips.includes('Brighton'));
    assert.ok(!card.textContent.includes('Arsenal vs Brighton'), 'no fixture is inferred from a league clip');

    // The way out to the original is labelled and leaves the site honestly.
    const espn = [...card.querySelectorAll('a')].filter((node: any) => node.getAttribute('href') === 'https://www.espn.com/video/clip/_/id/49983806');
    assert.equal(espn.length, 1, 'one labelled ESPN link before play');
    assert.equal(espn[0].getAttribute('target'), '_blank');
    assert.match(espn[0].getAttribute('rel'), /noopener/);
    assert.equal(espn[0].getAttribute('href'), clip().page);
    // The league link stays on Hyper.
    assert.ok([...card.querySelectorAll('a')].some((node: any) => node.getAttribute('href') === '/sports?league=epl'));
  } finally {
    await mount.unmount();
  }
});

test('pressing play fetches the clip by id and plays the progressive file', async () => {
  const mount = await mountClip();
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: any) => {
    urls.push(String(input));
    return Promise.resolve(media({ mp4: 'https://espnmedia-cdn.akamaized.net/clip.mp4', hls: 'https://cmp-espn.media.dssott.com/playlist.m3u8' }));
  }) as typeof fetch;
  try {
    await mount.click(mount.playButton()!);
    const video = mount.video()!;
    assert.ok(video, 'the player replaces the poster');
    // A progressive file wins: it plays in every browser, HLS does not.
    assert.equal(video.getAttribute('src'), 'https://espnmedia-cdn.akamaized.net/clip.mp4');
    assert.equal(video.getAttribute('poster'), 'https://a.espncdn.com/photo/49983806.jpg');
    assert.equal(video.getAttribute('controls'), '');
    // A feed of clips must not pull streams on scroll.
    assert.equal(video.getAttribute('preload'), 'metadata');
    assert.deepEqual(urls, ['/api/sports/video-news/clip?id=49983806'], 'one request, for this clip only');
  } finally {
    globalThis.fetch = original;
    await mount.unmount();
  }
});

test('HLS is used only when this browser says it can play it', async () => {
  // Safari reports support for Apple's HLS type; jsdom reports none, which is
  // the Chrome/Firefox case — so an HLS-only clip must not become a dead player.
  const noHls = await mountClip();
  const originalFetch = globalThis.fetch;
  const hlsOnly = () => media({ mp4: null, hls: 'https://cmp-espn.media.dssott.com/playlist.m3u8' });
  try {
    globalThis.fetch = (() => Promise.resolve(hlsOnly())) as typeof fetch;
    await noHls.click(noHls.playButton()!);
    assert.equal(noHls.video(), null, 'an HLS rendition is not handed to a browser that cannot play it');
    assert.match(noHls.card().textContent, /ESPN will not serve this clip to your connection/);
    const fallback = [...noHls.card().querySelectorAll('a')].find((node: any) => node.textContent.includes('Watch it on ESPN'))!;
    assert.equal(fallback.getAttribute('href'), 'https://www.espn.com/video/clip/_/id/49983806');
  } finally {
    globalThis.fetch = originalFetch;
    await noHls.unmount();
  }

  const canPlay = await mountClip();
  const prototype = canPlay.window.HTMLMediaElement.prototype;
  const original = prototype.canPlayType;
  try {
    prototype.canPlayType = (type: string) => (type === 'application/vnd.apple.mpegurl' ? 'maybe' : '');
    globalThis.fetch = (() => Promise.resolve(hlsOnly())) as typeof fetch;
    await canPlay.click(canPlay.playButton()!);
    assert.equal(canPlay.video()!.getAttribute('src'), 'https://cmp-espn.media.dssott.com/playlist.m3u8');
  } finally {
    prototype.canPlayType = original;
    globalThis.fetch = originalFetch;
    await canPlay.unmount();
  }
});

test('a clip ESPN will not serve falls back to its labelled link, not a dead player', async () => {
  for (const respond of [
    () => new Response('geofenced', { status: 403 }),
    () => media({ playable: false, mp4: null, hls: null }),
    () => Promise.reject(new Error('offline')),
  ]) {
    const mount = await mountClip();
    const original = globalThis.fetch;
    globalThis.fetch = respond as typeof fetch;
    try {
      await mount.click(mount.playButton()!);
      const card = mount.card();
      assert.equal(mount.video(), null, 'no player for a clip that will not play');
      assert.match(card.textContent, /Watch it on ESPN/);
      // The poster is still there, so the card does not collapse into text.
      assert.ok(mount.poster());
    } finally {
      globalThis.fetch = original;
      await mount.unmount();
    }
  }
});

test('a player that errors mid-clip offers the ESPN link instead of a black rectangle', async () => {
  const mount = await mountClip();
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(media({ mp4: 'https://espnmedia-cdn.akamaized.net/clip.mp4' }))) as typeof fetch;
  try {
    await mount.click(mount.playButton()!);
    const video = mount.video()!;
    assert.ok(video);
    const React = await import('react');
    const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
    await act(async () => { video.dispatchEvent(new mount.window.Event('error')); });
    assert.equal(mount.video(), null, 'the failed player is replaced');
    assert.match(mount.card().textContent, /Watch it on ESPN/);
  } finally {
    globalThis.fetch = original;
    await mount.unmount();
  }
});

test('comment and share compose a post the way the other feed cards do', async () => {
  const signedOut = await mountClip();
  try {
    const card = signedOut.card();
    assert.match(card.textContent, /Sign in to comment on or share this clip\./);
    const comment = [...card.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Comment')!;
    const share = [...card.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Share')!;
    assert.equal(comment.disabled, true);
    assert.equal(share.disabled, true);
    assert.equal(card.querySelector('textarea'), null, 'no composer for a signed-out reader');
  } finally {
    await signedOut.unmount();
  }

  const signedIn = await mountClip({}, { signedIn: true });
  try {
    const card = signedIn.card();
    assert.ok(!card.textContent.includes('Sign in to comment'), 'a signed-in reader is not told to sign in');
    const comment = [...card.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Comment')!;
    await signedIn.click(comment);
    assert.match(card.textContent, /Comment on this clip/);
    assert.equal(card.querySelector('textarea')!.getAttribute('aria-label'), 'Write a comment about this clip');

    // Typing reaches the card's own state, and the composer closes again.
    await typeNote(signedIn, 'What a finish');
    assert.equal(card.querySelector('textarea')!.value, 'What a finish');
    await signedIn.click(findButton(signedIn.document, 'Close clip composer')!);
    assert.equal(card.querySelector('textarea'), null);

    const share = [...card.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Share')!;
    await signedIn.click(share);
    assert.match(card.textContent, /Share this clip/);
    assert.equal(card.querySelector('textarea')!.getAttribute('aria-label'), 'Add a note to your share');
    // Posting is the app's own action: it is not re-implemented on this card.
    await signedIn.click([...card.querySelectorAll('button')].find((node: any) => node.textContent.includes('Share clip'))!);
    assert.equal(card.querySelector('textarea'), null, 'the composer closes after the post is composed');
  } finally {
    await signedIn.unmount();
  }
});

test('a clip with no poster and no team labels still renders as a card', async () => {
  const mount = await mountClip({ thumbnail: null, teams: [], description: null, publishedAt: null, leagueName: 'CAF Champions League', sport: 'football' });
  try {
    const card = mount.card();
    assert.equal(card.querySelector('img'), null, 'no invented poster');
    assert.match(card.textContent, /CAF Champions League video · Football/);
    assert.match(card.textContent, /Saka curls Arsenal ahead at Brighton/);
    assert.ok(mount.playButton(), 'the play control is still there');
    // No teams reported means no team chips, and no fixture invented for them.
    assert.ok(!card.textContent.includes(' vs '));
  } finally {
    await mount.unmount();
  }
});
