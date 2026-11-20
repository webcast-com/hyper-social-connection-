import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SPONSOR_BANNERS, SPONSOR_REL, sponsorLayout, usableSponsorBanners } from '../../src/lib/sponsor-banners';

/**
 * The sponsored banners: where a click goes and how the link is marked, that a
 * creative which does not load leaves no empty box, and that nothing is asked
 * of the advertiser's host for a visitor saving data.
 */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://hyper.co.ke/', pretendToBeVisual: true });
const g = globalThis as any;
g.window = dom.window;
g.self = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
for (const name of ['HTMLElement', 'Element', 'Node', 'Event']) g[name] = (dom.window as any)[name];
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (callback: any) => setTimeout(callback, 0);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no media playback: record what the banner asks of a video instead.
const played: string[] = [];
dom.window.HTMLMediaElement.prototype.play = function play(this: HTMLVideoElement) { played.push(`play:${this.dataset.sponsorVideo}`); return Promise.resolve(); };
dom.window.HTMLMediaElement.prototype.pause = function pause(this: HTMLVideoElement) { played.push(`pause:${this.dataset.sponsorVideo}`); };

test('the two banners link to the advertiser, over https, with the creatives it supplied', () => {
  assert.deepEqual(SPONSOR_BANNERS.map((banner) => banner.href), [
    'https://r1wovcg.com/betting?open=register&p=xtz5',
    'https://r1wovcg.com/betting?open=register&p=xtz5',
  ]);
  assert.deepEqual(SPONSOR_BANNERS.map((banner) => banner.video), [
    'https://1w-aff.run/promo-files-uploads/0a45daadc7366df1f4c3e4fda01294aa1dafb663f1ecd7a36e.mp4',
    'https://1w-aff.run/promo-files-uploads/2b95b9df4b0f8070e078b4faf542d1b69d258cb6cce655374e.mp4',
  ]);
  assert.equal(usableSponsorBanners().length, 2);
  // A paid link says so, and the opened page gets no handle on this one.
  assert.deepEqual(SPONSOR_REL.split(' ').sort(), ['nofollow', 'noopener', 'sponsored']);
});

test('an entry that is not https on both addresses, or repeats an id, is not shown', () => {
  const ok = { id: 'a', href: 'https://ads.example/go', video: 'https://ads.example/a.mp4' };
  assert.deepEqual(usableSponsorBanners([
    ok,
    { ...ok, id: 'b', href: 'javascript:alert(1)' },
    { ...ok, id: 'c', video: 'http://ads.example/a.mp4' },
    { ...ok, id: 'd', href: 'not a url' },
    { ...ok, id: 'e', href: 'https://user:pass@ads.example/go' },
    { ...ok, id: '' },
    { ...ok },
  ]).map((banner) => banner.id), ['a']);
  assert.deepEqual(usableSponsorBanners([]), []);
});

test('strips are stacked at full width; squares and portraits sit side by side', () => {
  assert.equal(sponsorLayout([728 / 90, 728 / 90]), 'stack');
  assert.equal(sponsorLayout([1200 / 200, 1]), 'stack');
  assert.equal(sponsorLayout([300 / 250, 300 / 250]), 'pair');
  assert.equal(sponsorLayout([9 / 16, 1]), 'pair');
  // One banner, or one whose size is not known yet, has the column to itself.
  assert.equal(sponsorLayout([1]), 'stack');
  assert.equal(sponsorLayout([1, NaN]), 'stack');
  assert.equal(sponsorLayout([]), 'stack');
});

/* ── The block itself, mounted ──────────────────────────────────────────── */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TWO = [
  { id: 'one', href: 'https://ads.example/go?p=1&q=2', video: 'https://cdn.example/one.mp4' },
  { id: 'two', href: 'https://ads.example/go?p=1&q=2', video: 'https://cdn.example/two.mp4' },
];

async function mount(banners = TWO, settleMs = 0) {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const Banners = (await import('../../src/components/SponsorBanners')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  const container = dom.window.document.getElementById('root')!;
  container.innerHTML = '';
  played.length = 0;
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Banners as never, { banners, placement: 'test', className: 'mt-4' } as never)); });
  // The block mounts in two steps (allowed to show, then near the viewport).
  // Wait for its videos; where none are expected, wait a fixed moment instead.
  if (settleMs) await act(async () => { await wait(settleMs); });
  else for (let waited = 0; waited < 1_000 && !container.querySelector('video'); waited += 10) await act(async () => { await wait(10); });
  const block = () => container.querySelector('[data-sponsor-banners]') as any;
  const video = (id: string) => container.querySelector(`[data-sponsor-video="${id}"]`) as any;
  /** What a browser does once it has read a video's header, or failed to. */
  const loaded = async (id: string, width: number, height: number) => {
    const node = video(id);
    Object.defineProperty(node, 'videoWidth', { value: width, configurable: true });
    Object.defineProperty(node, 'videoHeight', { value: height, configurable: true });
    await act(async () => { node.dispatchEvent(new dom.window.Event('loadedmetadata')); await wait(5); });
  };
  const broke = async (id: string) => { await act(async () => { video(id).dispatchEvent(new dom.window.Event('error')); await wait(5); }); };
  return { container, block, video, loaded, broke, act, unmount: async () => { await act(() => root.unmount()); } };
}

test('the slot takes no room and cannot be reached until a creative has loaded', async () => {
  const view = await mount();
  try {
    assert.equal(view.block().getAttribute('data-ready'), 'false');
    assert.equal(view.block().hasAttribute('inert'), true);
    assert.equal(view.block().style.height, '0px');
    assert.equal(view.block().style.margin, '0px');
    assert.equal(played.length, 0, 'nothing plays unseen');

    await view.loaded('one', 600, 500);
    assert.equal(view.block().getAttribute('data-ready'), 'true');
    assert.equal(view.block().hasAttribute('inert'), false);
    assert.equal(view.block().style.height, '');
    assert.equal(view.block().className, 'mt-4');
    // The tile takes the creative's own proportions.
    const link = view.container.querySelector('[data-sponsor-link="one"]') as any;
    assert.equal(link.style.aspectRatio, '600 / 500');
    assert.ok(played.includes('play:one'));
  } finally {
    await view.unmount();
  }
});

test('each banner is a marked, labelled link that opens the advertiser in a new tab', async () => {
  const view = await mount();
  try {
    await view.loaded('one', 300, 250);
    await view.loaded('two', 300, 250);
    const links = [...view.container.querySelectorAll('a')] as any[];
    assert.equal(links.length, 2);
    for (const link of links) {
      assert.equal(link.getAttribute('href'), 'https://ads.example/go?p=1&q=2');
      assert.equal(link.getAttribute('target'), '_blank');
      assert.equal(link.getAttribute('rel'), 'sponsored nofollow noopener');
      assert.match(link.getAttribute('aria-label'), /Sponsored.*new tab/);
    }
    assert.equal(view.block().getAttribute('aria-label'), 'Sponsored');
    assert.match(view.block().textContent, /Sponsored/);
    assert.match(view.block().textContent, /18\+/);
    assert.equal(view.block().getAttribute('data-layout'), 'pair');

    // A video, not an image: muted, looped, inline, and not announced or tabbed to.
    const video = view.video('one');
    assert.equal(video.tagName, 'VIDEO');
    assert.equal(video.getAttribute('src'), 'https://cdn.example/one.mp4#t=0.001');
    assert.equal(video.muted, true);
    assert.equal(video.loop, true);
    assert.equal(video.hasAttribute('playsinline'), true);
    assert.equal(video.hasAttribute('autoplay'), false, 'it is played only once on screen');
    assert.equal(video.hasAttribute('controls'), false);
    assert.equal(video.getAttribute('aria-hidden'), 'true');
    assert.equal(video.getAttribute('preload'), 'metadata');
    assert.equal(view.container.querySelector('img'), null);
  } finally {
    await view.unmount();
  }
});

test('two strips are stacked', async () => {
  const view = await mount();
  try {
    await view.loaded('one', 728, 90);
    await view.loaded('two', 728, 90);
    assert.equal(view.block().getAttribute('data-layout'), 'stack');
  } finally {
    await view.unmount();
  }
});

test('a creative that fails is removed, and with none left the block is gone', async () => {
  const view = await mount();
  try {
    await view.loaded('one', 600, 500);
    await view.broke('two');
    assert.deepEqual([...view.container.querySelectorAll('a')].map((link: any) => link.dataset.sponsorLink), ['one']);
    assert.equal(view.block().getAttribute('data-layout'), 'stack');
    await view.broke('one');
    assert.equal(view.block(), null);
    assert.equal(view.container.innerHTML, '');
  } finally {
    await view.unmount();
  }
  // Blocked before anything loaded: the slot never opens.
  const blocked = await mount();
  try {
    await blocked.broke('one');
    await blocked.broke('two');
    assert.equal(blocked.container.innerHTML, '');
  } finally {
    await blocked.unmount();
  }
});

test('with reduced motion the banner is shown but not played', async () => {
  const before = dom.window.matchMedia;
  (dom.window as any).matchMedia = (query: string) => ({ matches: /reduced-motion/.test(query), media: query, addEventListener() {}, removeEventListener() {} });
  try {
    const view = await mount();
    try {
      await view.loaded('one', 600, 500);
      assert.equal(view.block().getAttribute('data-ready'), 'true');
      assert.ok(!played.some((entry) => entry.startsWith('play:')), played.join(','));
    } finally {
      await view.unmount();
    }
  } finally {
    (dom.window as any).matchMedia = before;
  }
});

test('a visitor saving data, or an empty list, gets no banner and no request', async () => {
  Object.defineProperty(dom.window.navigator, 'connection', { value: { saveData: true }, configurable: true });
  try {
    const view = await mount(TWO, 80);
    try {
      assert.equal(view.container.innerHTML, '');
    } finally {
      await view.unmount();
    }
  } finally {
    Object.defineProperty(dom.window.navigator, 'connection', { value: undefined, configurable: true });
  }
  const none = await mount([], 80);
  try {
    assert.equal(none.container.innerHTML, '');
  } finally {
    await none.unmount();
  }
});

test('nothing is rendered on the server: no advertiser address in the page’s HTML', async () => {
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');
  const Banners = (await import('../../src/components/SponsorBanners')).default;
  assert.equal(renderToString(React.createElement(Banners as never, {} as never)), '');
});
