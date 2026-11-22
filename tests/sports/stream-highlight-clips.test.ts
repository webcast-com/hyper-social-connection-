import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseStreamDetail, parseStreamMatches, parseStreamSports, type StreamBoard } from '../../src/lib/sportsrc';
import { BARCA_ID, detailPayload, matchesPayload, sportsPayload } from './sportsrc-fixture';

/**
 * "Latest Highlights" on the live-stream page: pressing a clip plays it in the
 * page's large player, where a match stream would be.
 *
 * Mounted in jsdom, which has a `<video>` element but no media engine, so
 * `play` is stood in for and the element's own events are sent by hand. What is
 * checked is the page's behaviour around them: the rows keep their parts, the
 * reader stays on the page, a match and a clip are never in the player
 * together, and a clip that will not play has an honest way out.
 */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://hyper.co.ke/sports/live', pretendToBeVisual: true });
const g = globalThis as any;
g.window = dom.window;
g.self = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
for (const name of ['HTMLElement', 'Element', 'Node', 'Event', 'StorageEvent', 'HTMLInputElement', 'HTMLImageElement', 'Blob']) g[name] = (dom.window as any)[name];
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (callback: any) => setTimeout(callback, 0);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;
// A desktop: the player is beside the rail, so nothing is scrolled.
let narrow = false;
(dom.window as any).matchMedia = () => ({ matches: narrow, addEventListener() {}, removeEventListener() {} });
const scrolled: string[] = [];
(dom.window as any).Element.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this.className); };

/** A stand-in media engine: records which file was started. */
const started: string[] = [];
let playResult: () => Promise<void> = () => Promise.resolve();
(dom.window as any).HTMLMediaElement.prototype.play = function play() { started.push(this.getAttribute('src').split('/').pop()); return playResult(); };

const CLIPS = [
  { id: 'a', title: 'Saka opens the scoring', thumbnail: 'https://a.espncdn.com/a.jpg', duration: '1:02', href: '/sports/highlights/a', mp4: 'https://media.video-cdn.espn.com/a.mp4' },
  { id: 'b', title: 'Palmer equalises', thumbnail: null, duration: '5:04', href: '/sports/highlights/b', mp4: 'https://media.video-cdn.espn.com/b.mp4' },
  { id: 'c', title: 'No file for this one', thumbnail: null, duration: null, href: '/sports/highlights/c', mp4: null },
  { id: 'd', title: 'An unsafe file', thumbnail: null, duration: null, href: '/sports/highlights/d', mp4: 'http://insecure.test/d.mp4' },
];

// Fixture times are relative to a fixed instant; the component reads the clock.
const RealDate = Date;
const FIXED = RealDate.parse('2026-11-19T18:00:00Z');
g.Date = class extends RealDate {
  constructor(...args: any[]) { if (args.length) super(...(args as [any])); else super(FIXED); }
  static now() { return FIXED; }
};

const liveBoard = (): StreamBoard => ({
  state: 'ok', sport: 'football', date: '', fetchedAt: new RealDate(FIXED).toISOString(),
  sports: parseStreamSports(sportsPayload()), ...parseStreamMatches(matchesPayload()),
});

async function mount() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const Dashboard = (await import('../../src/components/SportsStreamDashboard')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  dom.window.localStorage.clear();
  started.length = 0; scrolled.length = 0; narrow = false;
  playResult = () => Promise.resolve();
  const board = liveBoard();
  g.fetch = async (input: string) => {
    const url = new URL(String(input), 'https://hyper.co.ke');
    if (url.pathname === '/api/sports/streams/detail') return new Response(JSON.stringify({ state: 'ok', detail: parseStreamDetail(detailPayload(url.searchParams.get('id') ?? '')) }), { status: 200 });
    return new Response(JSON.stringify(board), { status: 200 });
  };
  const container = dom.window.document.getElementById('root')!;
  container.innerHTML = '';
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Dashboard as never, { initial: board, news: [], highlights: CLIPS, viewer: null } as never)); });
  const $ = (selector: string) => container.querySelector(selector) as any;
  const $$ = (selector: string) => [...container.querySelectorAll(selector)] as any[];
  const click = async (target: any) => {
    assert.ok(target, 'the control to click exists');
    await act(async () => { target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };
  const send = async (target: any, type: string) => { await act(async () => { target.dispatchEvent(new dom.window.Event(type)); }); };
  const rows = () => $$('.sx-clips > li');
  return { container, $, $$, click, send, rows, unmount: async () => { await act(() => root.unmount()); } };
}

test('a clip with a file is a button of the link\'s own shape; one without is still the link', async () => {
  const view = await mount();
  try {
    const [a, b, c, d] = view.rows();
    for (const row of [a, b]) {
      const button = row.querySelector('button');
      assert.ok(button);
      assert.equal(row.querySelector('a'), null);
      // The same class, so the same box, as the link it replaces; the same two parts inside.
      assert.match(button.className, /(^| )sx-clips__link( |$)/);
      assert.deepEqual([...button.children].map((child: any) => child.className), ['sx-clips__thumb', 'sx-clips__title']);
      // The rail holds no player of its own.
      assert.equal(row.querySelector('video'), null);
    }
    assert.equal(a.querySelector('button').getAttribute('aria-label'), 'Play in the player: Saka opens the scoring');
    assert.equal(a.querySelector('.sx-clips__time').textContent, '1:02');
    assert.equal(a.querySelector('img').getAttribute('src'), 'https://a.espncdn.com/a.jpg');
    // No file, or a file that is not https: the link to the clip's own page, as before.
    for (const [row, href] of [[c, '/sports/highlights/c'], [d, '/sports/highlights/d']] as const) {
      assert.equal(row.querySelector('button'), null);
      assert.equal(row.querySelector('a.sx-clips__link').getAttribute('href'), href);
      assert.deepEqual([...row.querySelector('a').children].map((child: any) => child.className), ['sx-clips__thumb', 'sx-clips__title']);
    }
    // Nothing is loaded or played before a press.
    assert.equal(view.$('video'), null);
    assert.doesNotMatch(view.container.innerHTML, /insecure\.test|\.mp4/);
    assert.deepEqual(started, []);
  } finally { await view.unmount(); }
});

test('pressing a clip plays it in the large player, on this page, and marks its row', async () => {
  const view = await mount();
  try {
    await view.click(view.rows()[0].querySelector('button'));
    const video = view.$('.sx-player__stage video');
    assert.ok(video, 'the clip is in the stream player\'s stage');
    assert.equal(video.getAttribute('src'), 'https://media.video-cdn.espn.com/a.mp4');
    assert.equal(video.getAttribute('poster'), 'https://a.espncdn.com/a.jpg');
    assert.equal(video.hasAttribute('controls'), true);
    assert.equal(video.hasAttribute('playsinline'), true);
    assert.equal(video.getAttribute('aria-label'), 'Saka opens the scoring');
    // Started from the press itself, not by an `autoplay` attribute.
    assert.equal(video.hasAttribute('autoplay'), false);
    assert.deepEqual(started, ['a.mp4']);
    assert.equal(dom.window.location.href, 'https://hyper.co.ke/sports/live', 'the reader stays on the page');
    assert.equal(view.$('.sx-player__stage iframe'), null);
    assert.equal(view.$('.sx-player').getAttribute('data-playing'), 'true');
    // The bar names the clip and calls it what it is, not a live broadcast.
    assert.equal(view.$('.sx-player__now').textContent, 'Saka opens the scoring');
    assert.equal(view.$('.sx-player__live').textContent, 'Highlight');
    assert.equal(view.$('.sx-player__bar button[aria-label="Full screen"]').disabled, false);
    // Its row is marked; the others are not.
    const button = view.rows()[0].querySelector('button');
    assert.match(button.className, /is-active/);
    assert.equal(button.getAttribute('aria-current'), 'true');
    assert.equal(button.getAttribute('aria-label'), 'Now in the player: Saka opens the scoring');
    assert.doesNotMatch(view.rows()[1].querySelector('button').className, /is-active/);
    assert.deepEqual(scrolled, [], 'on a desktop the player is already in view');

    // Another clip replaces it: one player, one clip.
    await view.click(view.rows()[1].querySelector('button'));
    assert.equal(view.$$('.sx-player__stage video').length, 1);
    assert.equal(view.$('.sx-player__stage video').getAttribute('src'), 'https://media.video-cdn.espn.com/b.mp4');
    assert.equal(view.$('.sx-player__stage video').hasAttribute('poster'), false);
    assert.deepEqual(started, ['a.mp4', 'b.mp4']);
    assert.doesNotMatch(view.rows()[0].querySelector('button').className, /is-active/);
    assert.match(view.rows()[1].querySelector('button').className, /is-active/);

    // "Close" puts the match player back.
    await view.click(view.$('.sx-player__bar button[aria-label="Close the highlight"]'));
    assert.equal(view.$('.sx-player__stage video'), null);
    assert.equal(view.$('.sx-player').getAttribute('data-playing'), 'false');
    assert.ok(view.$('.sx-player__bar button[aria-label="Play the stream"]'));
    assert.equal(view.$$('.sx-clips__button.is-active').length, 0);
  } finally { await view.unmount(); }
});

test('a match and a clip are never in the player together', async () => {
  const view = await mount();
  try {
    // A stream is playing…
    await view.click(view.$('.sx-player__big'));
    assert.ok(view.$('.sx-player__stage iframe'));
    // …a clip takes the player: the stream's frame is removed, not left running behind it.
    await view.click(view.rows()[0].querySelector('button'));
    assert.equal(view.$('.sx-player__stage iframe'), null);
    assert.ok(view.$('.sx-player__stage video'));
    assert.equal(view.$('.sx-sources'), null);
    // Choosing a match closes the clip.
    await view.click(view.$(`[data-stream-match="${BARCA_ID}"] .sx-row__main`));
    assert.equal(view.$('.sx-player__stage video'), null);
    assert.equal(view.$$('.sx-clips__button.is-active').length, 0);
    assert.ok(view.$('.sx-player__big'), 'the match is ready to be played');
  } finally { await view.unmount(); }
});

test('on a phone the player is scrolled into view, because the rail is below it', async () => {
  const view = await mount();
  try {
    narrow = true;
    await view.click(view.rows()[0].querySelector('button'));
    assert.deepEqual(scrolled, ['sx-player']);
  } finally { await view.unmount(); }
});

test('a clip that will not play says so in the player, offers its page, and its row becomes the link', async () => {
  const view = await mount();
  try {
    await view.click(view.rows()[0].querySelector('button'));
    await view.send(view.$('.sx-player__stage video'), 'error');
    assert.equal(view.$('.sx-player__stage video'), null);
    const note = view.$('.sx-player__note');
    assert.match(note.textContent, /could not be played here/);
    assert.equal(note.querySelector('a').getAttribute('href'), '/sports/highlights/a');
    assert.equal(view.$('.sx-player__bar button[aria-label="Full screen"]').disabled, true);
    const row = view.rows()[0];
    assert.equal(row.querySelector('button'), null);
    assert.equal(row.querySelector('a.sx-clips__link').getAttribute('href'), '/sports/highlights/a');
    assert.match(row.querySelector('a').getAttribute('title'), /could not be played here/);
    // The other clips still play.
    await view.click(view.rows()[1].querySelector('button'));
    assert.equal(view.$('.sx-player__stage video').getAttribute('src'), 'https://media.video-cdn.espn.com/b.mp4');
    assert.equal(view.rows()[0].querySelector('button'), null, 'the failed clip stays a link');
  } finally { await view.unmount(); }
});

test('a refused start is not a broken clip: the player stays, with its own controls to press', async () => {
  const view = await mount();
  try {
    playResult = () => Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }));
    await view.click(view.rows()[0].querySelector('button'));
    const video = view.$('.sx-player__stage video');
    assert.ok(video);
    assert.equal(video.hasAttribute('controls'), true);
    assert.ok(view.rows()[0].querySelector('button'));
  } finally { await view.unmount(); }
});

test('only an https file with no credentials is given to a player', async () => {
  const { playableClipFile } = await import('../../src/components/StreamHighlightClips');
  assert.equal(playableClipFile('https://media.video-cdn.espn.com/a.mp4'), 'https://media.video-cdn.espn.com/a.mp4');
  for (const bad of ['http://x.test/a.mp4', 'javascript:alert(1)', 'data:video/mp4;base64,AAAA', '//x.test/a.mp4', 'https://user:pw@x.test/a.mp4', '', null, undefined, 7, `https://x.test/${'a'.repeat(2100)}`]) {
    assert.equal(playableClipFile(bad), null, String(bad).slice(0, 40));
  }
});
