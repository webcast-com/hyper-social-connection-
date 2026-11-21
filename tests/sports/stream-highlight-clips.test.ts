import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * "Latest Highlights" on the live-stream page: a clip plays in its own row.
 *
 * Mounted in jsdom, which has a `<video>` element but no media engine, so
 * `play` and `pause` are stood in for and the element's own events are sent by
 * hand. What is checked is the row's behaviour around them: one clip at a time,
 * nothing fetched before a press, no navigation, and an honest fallback.
 */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://hyper.co.ke/sports/live', pretendToBeVisual: true });
const g = globalThis as any;
g.window = dom.window;
g.self = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
for (const name of ['HTMLElement', 'Element', 'Node', 'Event', 'HTMLImageElement']) g[name] = (dom.window as any)[name];
g.IS_REACT_ACT_ENVIRONMENT = true;

/** A stand-in media engine: records what was asked, and keeps `paused` true to it. */
const calls: string[] = [];
let playResult: () => Promise<void> = () => Promise.resolve();
const proto = (dom.window as any).HTMLMediaElement.prototype;
const state = new WeakMap<object, boolean>();
Object.defineProperty(proto, 'paused', { configurable: true, get() { return state.get(this) !== true; } });
proto.play = function play() { calls.push(`play ${this.getAttribute('src').split('/').pop()}`); state.set(this, true); return playResult(); };
proto.pause = function pause() { calls.push(`pause ${this.getAttribute('src').split('/').pop()}`); state.set(this, false); this.dispatchEvent(new dom.window.Event('pause')); };
proto.requestFullscreen = function requestFullscreen() { calls.push(`fullscreen ${this.getAttribute('src').split('/').pop()}`); return Promise.resolve(); };

const ITEMS = [
  { id: 'a', title: 'Saka opens the scoring', thumbnail: 'https://a.espncdn.com/a.jpg', duration: '1:02', href: '/sports/highlights/a', mp4: 'https://media.video-cdn.espn.com/a.mp4' },
  { id: 'b', title: 'Palmer equalises', thumbnail: null, duration: '5:04', href: '/sports/highlights/b', mp4: 'https://media.video-cdn.espn.com/b.mp4' },
  { id: 'c', title: 'No file for this one', thumbnail: null, duration: null, href: '/sports/highlights/c', mp4: null },
  { id: 'd', title: 'An unsafe file', thumbnail: null, duration: null, href: '/sports/highlights/d', mp4: 'http://insecure.test/d.mp4' },
];

async function mount(props: Record<string, unknown> = {}) {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const Clips = (await import('../../src/components/StreamHighlightClips')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  calls.length = 0;
  playResult = () => Promise.resolve();
  const container = dom.window.document.getElementById('root')!;
  container.innerHTML = '';
  const root = createRoot(container);
  const render = (next: Record<string, unknown>) => act(async () => { root.render(React.createElement(Clips as never, { items: ITEMS, ...next } as never)); });
  await render(props);
  const rows = () => [...container.querySelectorAll('.sx-clips > li')] as any[];
  const click = async (target: any) => {
    assert.ok(target, 'the control to click exists');
    await act(async () => { target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
  };
  /** One of the video element's own events, the way the browser would send it. */
  const send = async (row: any, type: string, set: Record<string, number> = {}) => {
    const video = row.querySelector('video');
    for (const [key, value] of Object.entries(set)) Object.defineProperty(video, key, { configurable: true, writable: true, value });
    await act(async () => { video.dispatchEvent(new dom.window.Event(type)); });
  };
  return { container, rows, click, send, render, unmount: async () => { await act(() => root.unmount()); } };
}

test('a clip with a file is a play button in a row of the same parts; one without is still the link', async () => {
  const view = await mount();
  try {
    const [a, b, c, d] = view.rows();
    // Playable rows: a player behind the picture, one labelled button, a full-screen button. No link.
    for (const row of [a, b]) {
      assert.equal(row.querySelector('a'), null);
      assert.equal(row.querySelectorAll('.sx-clips__thumb').length, 1);
      assert.equal(row.querySelectorAll('.sx-clips__title').length, 1);
      assert.equal(row.querySelectorAll('button').length, 2);
    }
    const video = a.querySelector('video');
    assert.equal(video.getAttribute('src'), 'https://media.video-cdn.espn.com/a.mp4');
    // Nothing is fetched until the reader presses play, and the picture is never a tab stop or a control strip.
    assert.equal(video.getAttribute('preload'), 'none');
    assert.equal(video.hasAttribute('controls'), false);
    assert.equal(video.hasAttribute('autoplay'), false);
    assert.equal(video.hasAttribute('playsinline'), true);
    assert.equal(video.tabIndex, -1);
    assert.equal(a.querySelector('.sx-clips__toggle').getAttribute('aria-label'), 'Play highlight: Saka opens the scoring');
    assert.equal(a.querySelector('.sx-clips__toggle').getAttribute('aria-pressed'), 'false');
    assert.equal(a.querySelector('.sx-clips__time').textContent, '1:02');
    assert.equal(a.querySelector('img.sx-clips__img').getAttribute('src'), 'https://a.espncdn.com/a.jpg');
    assert.equal(a.querySelector('.sx-clips__full').getAttribute('aria-label'), 'Play full screen: Saka opens the scoring');
    // No file, or a file that is not https: the link to the clip's own page, as before.
    for (const [row, href] of [[c, '/sports/highlights/c'], [d, '/sports/highlights/d']] as const) {
      assert.equal(row.querySelector('video'), null);
      assert.equal(row.querySelector('button'), null);
      assert.equal(row.querySelector('a.sx-clips__link').getAttribute('href'), href);
    }
    assert.doesNotMatch(view.container.innerHTML, /insecure\.test/);
    assert.deepEqual(calls, []);
  } finally { await view.unmount(); }
});

test('pressing a row plays the clip in it, pressing again pauses, and starting another stops the first', async () => {
  const view = await mount();
  try {
    await view.click(view.rows()[0].querySelector('.sx-clips__toggle'));
    assert.deepEqual(calls, ['play a.mp4']);
    assert.equal(dom.window.location.href, 'https://hyper.co.ke/sports/live', 'the reader stays on the page');
    await view.send(view.rows()[0], 'play');
    let a = view.rows()[0];
    assert.match(a.className, /is-active/);
    assert.match(a.className, /is-playing/);
    assert.equal(a.querySelector('.sx-clips__toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(a.querySelector('.sx-clips__toggle').getAttribute('aria-label'), 'Pause highlight: Saka opens the scoring');
    // The picture gives way to the player, in the same box; the length gives way to a progress bar.
    assert.equal(a.querySelector('img'), null);
    assert.equal(a.querySelector('.sx-clips__time'), null);
    assert.equal(a.querySelectorAll('.sx-clips__thumb').length, 1);
    await view.send(a, 'timeupdate', { currentTime: 15.5, duration: 62 });
    assert.equal(a.querySelector('.sx-clips__bar span').style.width, '25%');

    // The second clip: the first is paused before the second starts.
    await view.click(view.rows()[1].querySelector('.sx-clips__toggle'));
    assert.deepEqual(calls, ['play a.mp4', 'pause a.mp4', 'play b.mp4']);
    await view.send(view.rows()[1], 'play');
    assert.doesNotMatch(view.rows()[0].className, /is-active|is-playing/);
    assert.ok(view.rows()[0].querySelector('img'), 'the first row shows its picture again');
    assert.match(view.rows()[1].className, /is-playing/);

    // Pressing the playing row pauses it; it stays the active row, paused.
    await view.click(view.rows()[1].querySelector('.sx-clips__toggle'));
    assert.equal(calls.at(-1), 'pause b.mp4');
    assert.match(view.rows()[1].className, /is-active/);
    assert.doesNotMatch(view.rows()[1].className, /is-playing/);
    assert.equal(view.rows()[1].querySelector('.sx-clips__toggle').getAttribute('aria-pressed'), 'false');

    // At the end the row goes back to its picture.
    await view.click(view.rows()[1].querySelector('.sx-clips__toggle'));
    await view.send(view.rows()[1], 'play');
    await view.send(view.rows()[1], 'ended');
    assert.doesNotMatch(view.rows()[1].className, /is-active|is-playing/);
    assert.equal(view.rows()[1].querySelector('.sx-clips__time').textContent, '5:04');
  } finally { await view.unmount(); }
});

test('the full-screen button starts the clip and asks for full screen; the row follows the video\'s own events', async () => {
  const view = await mount();
  try {
    await view.click(view.rows()[0].querySelector('.sx-clips__full'));
    assert.deepEqual(calls, ['play a.mp4', 'fullscreen a.mp4']);
    await view.send(view.rows()[0], 'play');
    // The browser's controls are on only while the clip fills the screen.
    const video = view.rows()[0].querySelector('video');
    Object.defineProperty(dom.window.document, 'fullscreenElement', { configurable: true, get: () => video });
    const React = await import('react');
    const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
    await act(async () => { dom.window.document.dispatchEvent(new dom.window.Event('fullscreenchange')); });
    assert.equal(view.rows()[0].querySelector('video').hasAttribute('controls'), true);
    // Paused from the full-screen controls: the row says so too.
    await view.send(view.rows()[0], 'pause');
    assert.equal(view.rows()[0].querySelector('.sx-clips__toggle').getAttribute('aria-pressed'), 'false');
    Object.defineProperty(dom.window.document, 'fullscreenElement', { configurable: true, get: () => null });
    await act(async () => { dom.window.document.dispatchEvent(new dom.window.Event('fullscreenchange')); });
    assert.equal(view.rows()[0].querySelector('video').hasAttribute('controls'), false);
  } finally { await view.unmount(); }
});

test('a clip that will not play here becomes the link to its own page; the others are untouched', async () => {
  const view = await mount();
  try {
    await view.click(view.rows()[0].querySelector('.sx-clips__toggle'));
    await view.send(view.rows()[0], 'error');
    const a = view.rows()[0];
    assert.equal(a.querySelector('video'), null);
    assert.equal(a.querySelector('button'), null);
    assert.equal(a.querySelector('a.sx-clips__link').getAttribute('href'), '/sports/highlights/a');
    assert.match(a.querySelector('a').getAttribute('title'), /could not be played here/);
    assert.ok(view.rows()[1].querySelector('video'));

    // A file the browser cannot decode rejects `play()` without an `error` event in some browsers.
    playResult = () => Promise.reject(Object.assign(new Error('no supported source'), { name: 'NotSupportedError' }));
    await view.click(view.rows()[1].querySelector('.sx-clips__toggle'));
    assert.equal(view.rows()[1].querySelector('video'), null);
    assert.equal(view.rows()[1].querySelector('a.sx-clips__link').getAttribute('href'), '/sports/highlights/b');
  } finally { await view.unmount(); }
  // A refused autoplay is not a broken file: the row stays a player.
  const again = await mount();
  try {
    playResult = () => Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }));
    await again.click(again.rows()[0].querySelector('.sx-clips__toggle'));
    assert.ok(again.rows()[0].querySelector('video'));
  } finally { await again.unmount(); }
});

test('a clip stops when the page\'s main player starts', async () => {
  const view = await mount();
  try {
    await view.click(view.rows()[0].querySelector('.sx-clips__toggle'));
    await view.send(view.rows()[0], 'play');
    await view.render({ paused: true });
    assert.equal(calls.at(-1), 'pause a.mp4');
    assert.doesNotMatch(view.rows()[0].className, /is-playing/);
  } finally { await view.unmount(); }
});

test('only an https file with no credentials is given to a player', async () => {
  const { playableClipFile } = await import('../../src/components/StreamHighlightClips');
  assert.equal(playableClipFile('https://media.video-cdn.espn.com/a.mp4'), 'https://media.video-cdn.espn.com/a.mp4');
  for (const bad of ['http://x.test/a.mp4', 'javascript:alert(1)', 'data:video/mp4;base64,AAAA', '//x.test/a.mp4', 'https://user:pw@x.test/a.mp4', '', null, undefined, 7, `https://x.test/${'a'.repeat(2100)}`]) {
    assert.equal(playableClipFile(bad), null, String(bad).slice(0, 40));
  }
});
