import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from '../sports/leaders-post-cards';
import {
  MAX_SHARE_VIDEO_BYTES,
  ShareVideoError,
  deviceCanShareVideo,
  fetchShareVideo,
  formatMegabytes,
  sendsVideoAlone,
  shareableVideo,
  videoSharePayload,
  type ShareVideo,
} from '../../src/lib/share-video';

/**
 * "Send the video" in the share sheet.
 *
 * A link shows a picture in WhatsApp and Facebook; a video only plays there when
 * the file itself is sent. These tests hold what was promised about that button:
 * it is an addition (a sheet without a video, or on a device that cannot send a
 * file, is the sheet it was), nothing is fetched until it is pressed, it takes
 * two presses, and every failure leaves one line pointing at the link with the
 * rest of the sheet in place.
 *
 * jsdom has no share menu, so `navigator.share` and `navigator.canShare` are
 * stand-ins here, and `fetch` is one the test controls. What a real phone does
 * with the file is not something this can show.
 */

const publicPost = (over: Record<string, unknown> = {}) => ({
  id: 41,
  content: 'Last-minute winner from the touchline',
  videoUrl: '/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.mp4',
  privacy: 'public',
  scheduledAt: null,
  groupId: null,
  user: { name: 'Maya Patel', avatar: '/m.jpg', profileVisibility: 'public' },
  ...over,
});

const VIDEO: ShareVideo = { url: '/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.mp4', fileName: 'hyper-video-41.mp4', type: 'video/mp4' };

/* ── Which video may leave the site as a file ───────────────────────────── */

test('a public post\u2019s own upload can be sent; its name and type come from the file', () => {
  assert.deepEqual(shareableVideo(publicPost()), VIDEO);
  assert.deepEqual(
    shareableVideo(publicPost({ id: 7, videoUrl: '/uploads/clip.MOV' })),
    { url: '/uploads/clip.MOV', fileName: 'hyper-video-7.mov', type: 'video/quicktime' },
  );
  assert.equal(shareableVideo(publicPost({ videoUrl: '/uploads/a.webm' }))?.type, 'video/webm');
  const inPublicGroup = publicPost({ groupId: 3, group: { id: 3, name: 'Sunday League', privacy: 'public' } });
  assert.equal(shareableVideo(inPublicGroup)?.url, VIDEO.url);
});

test('a video that is not this site\u2019s file is never sent: a provider\u2019s clip stays a link', () => {
  for (const videoUrl of [
    'https://media.video-cdn.espn.com/motion/2026/1108/clip.mp4',
    'https://hyper.co.ke/uploads/a.mp4',
    '//evil.example/uploads/a.mp4',
    '/uploads/../secrets.mp4',
    '/uploads/a/b.mp4',
    '/uploads/a.mp4?download=1',
    '/uploads/a.jpg',
    '/other/a.mp4',
    '',
    null,
    undefined,
  ]) {
    assert.equal(shareableVideo(publicPost({ videoUrl })), null, String(videoUrl));
  }
});

test('a post that is not known to be public is not offered, whatever is missing', () => {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const cases: [string, Record<string, unknown>][] = [
    ['a private post', { privacy: 'private' }],
    ['a post with no privacy on it', { privacy: undefined }],
    ['a private profile', { user: { name: 'Maya', profileVisibility: 'private' } }],
    ['a followers-only profile', { user: { name: 'Maya', profileVisibility: 'followers' } }],
    ['an author the page did not hand over', { user: null }],
    ['a private group', { groupId: 3, group: { id: 3, privacy: 'private' } }],
    ['a group handed over without its privacy', { groupId: 3, group: { id: 3, name: 'Sunday League' } }],
    ['a group post handed over without its group', { groupId: 3 }],
    ['a post that is not published yet', { scheduledAt: tomorrow }],
  ];
  for (const [what, over] of cases) assert.equal(shareableVideo(publicPost(over)), null, what);
  assert.equal(shareableVideo(null), null);
});

/* ── Whether the device takes a video file ──────────────────────────────── */

test('the device is asked with an empty file of the same name and type; anything but a clear yes is a no', () => {
  const asked: File[] = [];
  const yes = { share: async () => {}, canShare: (data?: { files?: File[] }) => { asked.push(...(data?.files ?? [])); return true; } };
  assert.equal(deviceCanShareVideo(yes, VIDEO), true);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].name, 'hyper-video-41.mp4');
  assert.equal(asked[0].type, 'video/mp4');
  assert.equal(asked[0].size, 0, 'nothing is fetched to find out');

  assert.equal(deviceCanShareVideo(undefined, VIDEO), false);
  assert.equal(deviceCanShareVideo({}, VIDEO), false, 'no share menu at all');
  assert.equal(deviceCanShareVideo({ share: async () => {} }, VIDEO), false, 'a share menu that takes links only');
  assert.equal(deviceCanShareVideo({ share: async () => {}, canShare: () => false }, VIDEO), false);
  assert.equal(deviceCanShareVideo({ share: async () => {}, canShare: () => { throw new TypeError('no'); } }, VIDEO), false);
});

test('an iPhone or iPad is sent the video alone; elsewhere the caption goes with it', () => {
  const file = new File(['x'], 'hyper-video-41.mp4', { type: 'video/mp4' });
  assert.equal(sendsVideoAlone({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15' }), true);
  assert.equal(sendsVideoAlone({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), true, 'an iPad that says it is a Mac');
  assert.equal(sendsVideoAlone({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(sendsVideoAlone({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131.0 Mobile' }), false);
  assert.equal(sendsVideoAlone(undefined), false);

  assert.deepEqual(videoSharePayload(file, 'Check this out https://hyper.co.ke/post/41', false), { files: [file], text: 'Check this out https://hyper.co.ke/post/41' });
  assert.deepEqual(videoSharePayload(file, 'Check this out https://hyper.co.ke/post/41', true), { files: [file] });
  assert.deepEqual(videoSharePayload(file, '', false), { files: [file] });
});

test('a size is written the way a person reads it', () => {
  assert.equal(formatMegabytes(3.14 * 1024 * 1024), '3.1 MB');
  assert.equal(formatMegabytes(12.4 * 1024 * 1024), '12 MB');
  assert.equal(formatMegabytes(512 * 1024), '0.5 MB');
  assert.equal(formatMegabytes(2000), 'under 0.1 MB');
  assert.equal(MAX_SHARE_VIDEO_BYTES, 50 * 1024 * 1024);
});

/* ── Fetching the file ──────────────────────────────────────────────────── */

/** A response whose body arrives in the pieces given, with or without a declared length. */
function videoResponse(chunks: Uint8Array[], options: { length?: number | null; status?: number } = {}) {
  const pulled = { count: 0, cancelled: false };
  const queue = [...chunks];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();
      if (!next) { controller.close(); return; }
      pulled.count += 1;
      controller.enqueue(next);
    },
    cancel() { pulled.cancelled = true; },
  }, { highWaterMark: 0 });
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const headers = new Headers({ 'content-type': 'video/mp4' });
  if (options.length !== null) headers.set('content-length', String(options.length ?? total));
  return { response: new Response(body, { status: options.status ?? 200, headers }), pulled };
}

const bytes = (size: number) => new Uint8Array(size).fill(7);
const failure = async (work: Promise<unknown>) => {
  try { await work; } catch (error) { return error; }
  return null;
};

test('the file is read piece by piece, each piece reported, and comes back whole under its own name', async () => {
  const { response } = videoResponse([bytes(400), bytes(400), bytes(200)]);
  const asked: [string, RequestInit | undefined][] = [];
  const seen: [number, number | null][] = [];
  const file = await fetchShareVideo(VIDEO, {
    fetchImpl: (async (url: string, init?: RequestInit) => { asked.push([url, init]); return response; }) as never,
    onProgress: (progress) => seen.push([progress.received, progress.total]),
  });
  assert.equal(asked.length, 1);
  assert.equal(asked[0][0], '/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.mp4');
  assert.equal(asked[0][1]?.credentials, 'same-origin');
  assert.deepEqual(seen, [[0, 1000], [400, 1000], [800, 1000], [1000, 1000]]);
  assert.equal(file.name, 'hyper-video-41.mp4');
  assert.equal(file.type, 'video/mp4');
  assert.equal(file.size, 1000);
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer()).slice(0, 3)], [7, 7, 7]);
});

test('a file declared too large is refused before any of it is read', async () => {
  const { response, pulled } = videoResponse([bytes(600), bytes(600)], { length: 1200 });
  const error = await failure(fetchShareVideo(VIDEO, { fetchImpl: (async () => response) as never, maxBytes: 1000 }));
  assert.ok(error instanceof ShareVideoError);
  assert.equal((error as ShareVideoError).reason, 'too_large');
  assert.equal(pulled.count, 0, 'none of the body was downloaded');
});

test('a file with no declared length is stopped the moment it passes the limit', async () => {
  const { response, pulled } = videoResponse([bytes(600), bytes(600), bytes(600), bytes(600)], { length: null });
  const seen: number[] = [];
  const error = await failure(fetchShareVideo(VIDEO, {
    fetchImpl: (async () => response) as never,
    maxBytes: 1000,
    onProgress: (progress) => seen.push(progress.received),
  }));
  assert.equal((error as ShareVideoError).reason, 'too_large');
  assert.equal(pulled.count, 2, 'the rest is not read');
  assert.deepEqual(seen, [0, 600]);
});

test('a missing file, a dropped connection and an empty answer all fail the same way; a cancel is not a failure', async () => {
  const missing = await failure(fetchShareVideo(VIDEO, { fetchImpl: (async () => new Response('{"error":"Not found"}', { status: 404 })) as never }));
  assert.equal((missing as ShareVideoError).reason, 'failed');

  const offline = await failure(fetchShareVideo(VIDEO, { fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as never }));
  assert.equal((offline as ShareVideoError).reason, 'failed');

  const empty = await failure(fetchShareVideo(VIDEO, { fetchImpl: (async () => videoResponse([], { length: null }).response) as never }));
  assert.equal((empty as ShareVideoError).reason, 'failed');

  const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const cancelled = await failure(fetchShareVideo(VIDEO, { fetchImpl: (async () => { throw aborted; }) as never }));
  assert.equal(cancelled, aborted, 'the caller sees the abort itself and can ignore it');
});

/* ── The button in the sheet ────────────────────────────────────────────── */

type Shared = { files?: File[]; text?: string; url?: string; title?: string };

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/**
 * The sheet with a post in it, on a device described by `device`:
 * `canShare` (does it take a video file), `share` (what its menu does), and
 * `fetch` (what the site answers when the file is asked for).
 */
async function mountSheet(options: {
  video?: ShareVideo | null;
  canShare?: boolean | null;
  share?: (data: Shared) => Promise<void>;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  userAgent?: string;
  props?: Record<string, unknown>;
} = {}) {
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const ShareSheet = (await import('../../src/components/ShareSheet')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;

  const nav = mounted.window.navigator as any;
  const calls = { shared: [] as Shared[], fetched: [] as string[], signals: [] as AbortSignal[], recorded: [] as string[], copied: [] as string[], closed: 0 };
  const define = (key: string, value: unknown) => Object.defineProperty(nav, key, { value, configurable: true, writable: true });
  if (options.canShare === null) {
    define('share', undefined);
    define('canShare', undefined);
  } else {
    define('canShare', () => options.canShare ?? true);
    define('share', async (data: Shared) => { calls.shared.push(data); await options.share?.(data); });
  }
  define('clipboard', { writeText: async (text: string) => { calls.copied.push(text); } });
  define('userAgent', options.userAgent ?? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36');

  const answer = options.fetch ?? (async () => videoResponse([bytes(1024 * 1024), bytes(1024 * 1024), bytes(512 * 1024)]).response);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.fetched.push(String(url));
    if (init?.signal) calls.signals.push(init.signal);
    return answer(String(url), init);
  }) as never;

  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ShareSheet as never, {
      subject: {
        noun: 'post',
        title: 'Last-minute winner from the touchline',
        subtitle: 'Maya Patel \u00b7 post',
        image: null,
        link: '/post/41',
        text: 'Check out this post by Maya Patel on Hyper',
        feedHint: 'Reposts it to your followers, with your note above it if you add one.',
        ...(options.video === undefined ? { video: VIDEO } : options.video ? { video: options.video } : {}),
      },
      onClose: () => { calls.closed += 1; },
      shareToFeed: async () => ({ success: true, message: 'Shared to your feed' }),
      sendTo: async () => ({ success: true, message: 'Post sent' }),
      record: (channel: string) => { calls.recorded.push(channel); },
      ...options.props,
    } as never));
  });

  const sheet = () => mounted.document.querySelector('[role="dialog"][aria-labelledby="share-sheet-title"]') as any;
  const button = (label: string) => [...sheet().querySelectorAll('button')].find((node: any) => node.textContent.trim().startsWith(label)) as any;
  const block = () => sheet().querySelector('[data-share-video]') as any;
  return {
    ...mounted,
    calls,
    sheet,
    button,
    block,
    status: () => (block()?.querySelector('[role="status"]')?.textContent ?? '').trim(),
    press: async (label: string) => { await act(async () => { button(label).click(); await settle(); }); },
    wait: async () => { await act(async () => { await settle(); }); },
    unmount: async () => { await act(() => root.unmount()); globalThis.fetch = realFetch; },
  };
}

const tabLabels = (sheet: any) => [...sheet.querySelectorAll('button')]
  .map((node: any) => node.textContent.trim())
  .filter((label: string) => ['Feed', 'Groups', 'Send to', 'Elsewhere'].includes(label));

/** Everything the sheet had before this button: still there, still in order. */
function assertSheetIntact(sheet: any) {
  assert.equal(sheet.querySelector('h2').textContent.trim(), 'Share post');
  assert.equal(sheet.querySelector('input[aria-label="Post link"]').value, 'https://hyper.co.ke/post/41');
  assert.deepEqual(tabLabels(sheet), ['Feed', 'Groups', 'Send to', 'Elsewhere']);
  assert.match(sheet.textContent, /Share to your feed/);
  assert.ok([...sheet.querySelectorAll('button')].some((node: any) => node.textContent.trim() === 'Copy'));
}

test('without a video, or on a device that cannot send a file, the sheet is the sheet it was', async () => {
  const noVideo = await mountSheet({ video: null });
  assert.equal(noVideo.block(), null);
  assert.equal(noVideo.button('Send the video'), undefined);
  assertSheetIntact(noVideo.sheet());
  await noVideo.unmount();

  for (const canShare of [false, null] as const) {
    const view = await mountSheet({ canShare });
    assert.equal(view.block(), null, canShare === null ? 'no share menu' : 'a share menu that refuses video');
    assert.equal(view.button('Send the video'), undefined);
    assertSheetIntact(view.sheet());
    assert.deepEqual(view.calls.fetched, [], 'and nothing is fetched');
    await view.unmount();
  }
});

test('the button sits above the link, says what it is for, and fetches nothing until it is pressed', async () => {
  const view = await mountSheet();
  const sheet = view.sheet();
  const button = view.button('Send the video');
  assert.ok(button, 'the button is offered');
  assert.match(button.textContent, /So it plays inside WhatsApp, Facebook and other apps\./);
  assert.equal(view.block().getAttribute('data-share-video'), 'idle');
  const link = sheet.querySelector('input[aria-label="Post link"]');
  assert.ok(button.compareDocumentPosition(link) & view.window.Node.DOCUMENT_POSITION_FOLLOWING, 'above the link field');
  assertSheetIntact(sheet);
  assert.deepEqual(view.calls.fetched, []);
  assert.deepEqual(view.calls.shared, []);
  assert.equal(view.status(), '');
  await view.unmount();
});

test('first press gets the file ready; second press hands it to the share menu with its caption', async () => {
  const view = await mountSheet();
  await view.press('Send the video');
  assert.deepEqual(view.calls.fetched, ['/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.mp4']);
  assert.deepEqual(view.calls.shared, [], 'the first press does not open the menu');
  assert.equal(view.block().getAttribute('data-share-video'), 'ready');
  const ready = view.button('Send video');
  assert.ok(ready);
  assert.match(ready.textContent, /Ready \u00b7 2\.5 MB\. Press to choose an app\./);

  await view.press('Send video');
  assert.equal(view.calls.shared.length, 1);
  // `deepEqual(…, [])` above narrowed the list to empty for the type checker.
  const shared = (view.calls.shared as Shared[])[0];
  assert.deepEqual(Object.keys(shared).sort(), ['files', 'text']);
  assert.equal(shared.files!.length, 1);
  assert.equal(shared.files![0].name, 'hyper-video-41.mp4');
  assert.equal(shared.files![0].type, 'video/mp4');
  assert.equal(shared.files![0].size, 2.5 * 1024 * 1024);
  assert.equal(shared.text, 'Check out this post by Maya Patel on Hyper https://hyper.co.ke/post/41');
  assert.equal(view.status(), 'Done. Finish sending it in the app you chose.');
  assert.deepEqual(view.calls.recorded, ['video']);
  assert.deepEqual(view.calls.copied, [], 'the clipboard is left alone when the caption travels with the video');
  assert.equal(view.calls.closed, 0, 'the sheet stays, so it can be sent to another app as well');

  // A second app: the file is not fetched again.
  await view.press('Send video');
  assert.equal(view.calls.shared.length, 2);
  assert.equal(view.calls.fetched.length, 1);
  assertSheetIntact(view.sheet());
  await view.unmount();
});

test('while the file is on its way the button says how far along it is, and Cancel stops it', async () => {
  let push: (chunk: Uint8Array) => void = () => {};
  const body = new ReadableStream<Uint8Array>({ start(controller) { push = (chunk) => controller.enqueue(chunk); } });
  const view = await mountSheet({
    fetch: async () => new Response(body, { status: 200, headers: { 'content-length': String(4 * 1024 * 1024) } }),
  });
  await view.press('Send the video');
  assert.equal(view.block().getAttribute('data-share-video'), 'preparing');
  let button = view.button('Preparing video');
  assert.match(button.textContent, /Preparing video\u2026 0%/);
  assert.equal(button.disabled, true, 'a press while it is preparing does nothing');
  assert.equal(button.getAttribute('aria-busy'), 'true');

  push(bytes(1024 * 1024));
  await view.wait();
  button = view.button('Preparing video');
  assert.match(button.textContent, /Preparing video\u2026 25%/);
  assert.match(button.textContent, /1 MB of 4 MB/);
  assert.equal(view.sheet().querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '25');

  await view.press('Cancel');
  assert.equal(view.calls.signals[0].aborted, true, 'the download is stopped');
  assert.equal(view.block().getAttribute('data-share-video'), 'idle');
  assert.ok(view.button('Send the video'));
  assert.equal(view.status(), '', 'cancelling is not an error');
  assert.deepEqual(view.calls.shared, []);
  await view.unmount();
});

test('a video too large to send says so, takes the button away, and leaves the link and every other way', async () => {
  const view = await mountSheet({
    fetch: async () => videoResponse([bytes(1024)], { length: MAX_SHARE_VIDEO_BYTES + 1 }).response,
  });
  await view.press('Send the video');
  assert.equal(view.status(), 'This video is too large to send. Share the link instead.');
  assert.equal(view.block().getAttribute('data-share-video'), 'too_large');
  assert.equal(view.button('Send the video'), undefined, 'it cannot succeed, so it is not offered again');
  assert.equal(view.button('Send video'), undefined);
  assert.deepEqual(view.calls.shared, []);
  assert.deepEqual(view.calls.recorded, []);
  assert.equal(view.calls.closed, 0);
  assertSheetIntact(view.sheet());
  await view.unmount();
});

test('a download that fails says so and can be tried again', async () => {
  let attempt = 0;
  const view = await mountSheet({
    fetch: async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError('Failed to fetch');
      return videoResponse([bytes(2048)]).response;
    },
  });
  await view.press('Send the video');
  assert.equal(view.status(), 'The video could not be prepared. Share the link instead.');
  assert.equal(view.block().getAttribute('data-share-video'), 'idle');
  assertSheetIntact(view.sheet());
  assert.deepEqual(view.calls.shared, []);

  await view.press('Send the video');
  assert.equal(view.status(), '', 'the old message is cleared');
  assert.ok(view.button('Send video'));
  await view.unmount();
});

test('closing the share menu is not an error; a device that refuses the file gets one line and keeps the sheet', async () => {
  let outcome: 'dismiss' | 'refuse' = 'dismiss';
  const view = await mountSheet({
    share: async () => {
      throw Object.assign(new Error(outcome), { name: outcome === 'dismiss' ? 'AbortError' : 'NotAllowedError' });
    },
  });
  await view.press('Send the video');
  await view.press('Send video');
  assert.equal(view.status(), '');
  assert.ok(view.button('Send video'), 'still ready for another try');
  assert.deepEqual(view.calls.recorded, [], 'nothing was sent, so nothing is counted');

  outcome = 'refuse';
  await view.press('Send video');
  assert.equal(view.status(), 'This device could not send the video. Share the link instead.');
  assert.deepEqual(view.calls.recorded, []);
  assertSheetIntact(view.sheet());
  await view.unmount();
});

test('on an iPhone the video goes alone and its caption is put on the clipboard', async () => {
  const view = await mountSheet({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1' });
  await view.press('Send the video');
  await view.press('Send video');
  assert.equal(view.calls.shared.length, 1);
  assert.deepEqual(Object.keys(view.calls.shared[0]), ['files']);
  assert.equal(view.calls.shared[0].files![0].name, 'hyper-video-41.mp4');
  assert.deepEqual(view.calls.copied, ['Check out this post by Maya Patel on Hyper https://hyper.co.ke/post/41']);
  assert.equal(view.status(), 'Done. The caption and link are copied: paste them with the video.');
  await view.unmount();
});

test('a guest is offered it too, and a sheet closed part-way stops the download', async () => {
  let push: (chunk: Uint8Array) => void = () => {};
  const body = new ReadableStream<Uint8Array>({ start(controller) { push = (chunk) => controller.enqueue(chunk); } });
  const view = await mountSheet({
    props: { canShareInternally: false },
    fetch: async () => new Response(body, { status: 200, headers: { 'content-length': '4096' } }),
  });
  assert.deepEqual(tabLabels(view.sheet()), ['Elsewhere']);
  await view.press('Send the video');
  push(bytes(1024));
  await view.wait();
  assert.equal(view.calls.signals[0].aborted, false);
  await view.unmount();
  assert.equal(view.calls.signals[0].aborted, true);
});

/* ── What a post puts in the sheet ──────────────────────────────────────── */

test('a post carries its video into the sheet only when it may be sent', async () => {
  const { postShareSubject } = await import('../../src/components/ShareSheets');
  const withVideo = postShareSubject(publicPost());
  assert.deepEqual(withVideo.video, VIDEO);
  assert.equal(withVideo.link, '/post/41', 'everything else about the post is as it was');
  assert.equal(withVideo.title, 'Last-minute winner from the touchline');

  assert.equal(postShareSubject(publicPost({ privacy: 'private' })).video, null);
  assert.equal(postShareSubject(publicPost({ videoUrl: null })).video, null);
  assert.equal(postShareSubject(publicPost({ videoUrl: 'https://media.video-cdn.espn.com/clip.mp4' })).video, null);
  // A repost of a video post is shared as a repost: its own link, no file.
  assert.equal(postShareSubject({ id: 9, content: '\ud83d\udd01 Reposted', privacy: 'public', user: { name: 'Alex', profileVisibility: 'public' }, repostOf: publicPost() }).video, null);
});
