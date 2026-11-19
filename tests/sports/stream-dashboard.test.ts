import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyStreamBoard, parseStreamDetail, parseStreamMatches, parseStreamSports, type StreamBoard } from '../../src/lib/sportsrc';
import { ARSENAL_ID, BARCA_ID, LATER_ID, SOON_ID, detailPayload, matchesPayload, sportsPayload } from './sportsrc-fixture';

/**
 * The live-stream dashboard, mounted for real in jsdom and read the way a
 * reader would: which matches are listed, what the player says, and — the part
 * that decides whether a stream plays at all — what the frame around the
 * provider's player is allowed to be.
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
(dom.window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
(dom.window as any).HTMLElement.prototype.scrollIntoView = () => {};

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

const NEWS = Array.from({ length: 6 }, (_, index) => ({
  id: `news-${index}`, title: `Story ${index + 1}`, href: `https://www.espn.com/video/clip?id=${index}`, thumbnail: null, date: '2026-11-18T10:00:00Z', sport: 'football',
}));
const CLIPS = [{ id: 'c1', title: 'Liverpool vs AC Milan: Semifinals Highlights', thumbnail: null, duration: '5:04', href: '/sports/highlights/50476535' }];

type Fetched = { url: string };

async function mount(board: StreamBoard, options: { detail?: (id: string) => { status: number; body: unknown } } = {}) {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const Dashboard = (await import('../../src/components/SportsStreamDashboard')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  dom.window.localStorage.clear();
  const fetched: Fetched[] = [];
  g.fetch = async (input: string) => {
    fetched.push({ url: String(input) });
    const url = new URL(String(input), 'https://hyper.co.ke');
    if (url.pathname === '/api/sports/streams/detail') {
      const id = url.searchParams.get('id') ?? '';
      const reply = options.detail?.(id) ?? { status: 200, body: { state: 'ok', detail: parseStreamDetail(detailPayload(id)) } };
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }
    return new Response(JSON.stringify(board), { status: 200 });
  };
  const container = dom.window.document.getElementById('root')!;
  container.innerHTML = '';
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Dashboard as never, { initial: board, news: NEWS, highlights: CLIPS, viewer: null } as never)); });
  const $ = (selector: string) => container.querySelector(selector) as any;
  const $$ = (selector: string) => [...container.querySelectorAll(selector)] as any[];
  const click = async (target: any) => {
    assert.ok(target, 'the control to click exists');
    await act(async () => { target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    // Let a fetch started by the click settle.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };
  // What a row says, without the crest fallback (a side's code, hidden from readers).
  const rows = () => $$('.sx-row').map((row) => {
    const main = row.querySelector('.sx-row__main').cloneNode(true);
    main.querySelectorAll('.sx-crest').forEach((crest: any) => crest.remove());
    return main.textContent.replace(/\s+/g, ' ').trim();
  });
  const tab = (label: string) => $$('.sx-tabs__tab').find((button) => button.textContent === label);
  return { container, $, $$, click, rows, tab, fetched, unmount: async () => { await act(() => root.unmount()); } };
}

test('the list opens on the matches in play, numbered, each with its score and clock', async () => {
  const view = await mount(liveBoard());
  try {
    assert.equal(view.$('.sx-title').textContent, 'Streaming Now');
    assert.equal(view.tab('Live').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(view.rows(), ['1.Arsenal2 - 1Chelsea2H', "2.Barcelona1 - 0Real Madrid24'"]);
    assert.deepEqual(view.$$('.sx-tabs__tab').map((button) => button.textContent), ['All', 'Live', 'Upcoming', 'Finished', 'Bookmarks']);
    // The sport tabs are the sports SportSRC lists.
    assert.deepEqual(view.$$('.sx-sports__tab').map((button) => button.textContent), ['Football']);
    // Leagues with a stream, in the sidebar, with how many matches each has.
    assert.deepEqual(view.$$('.sx-group__item').map((item) => item.textContent), ['Premier League2', 'La Liga2', 'Ligue 12']);
    // News: four until "See All"; highlights link to this site's clip pages.
    assert.equal(view.$$('.sx-news li').length, 4);
    assert.equal(view.$('.sx-clips__link').getAttribute('href'), '/sports/highlights/50476535');
  } finally {
    await view.unmount();
  }
});

test('no stream is requested until play is pressed', async () => {
  const view = await mount(liveBoard());
  try {
    assert.equal(view.$('iframe'), null);
    assert.equal(view.fetched.length, 0);
    assert.match(view.$('.sx-player__chips').textContent, /ARS\s*2 - 1\s*CHE/);
    assert.match(view.$('.sx-player__chips').textContent, /Premier League/);
    assert.match(view.$('.sx-chip--status').textContent, /Live/);
  } finally {
    await view.unmount();
  }
});

test('play frames the provider’s player the way SportSRC requires: no sandbox, a referrer, full screen allowed', async () => {
  const view = await mount(liveBoard());
  try {
    await view.click(view.$('.sx-player__big'));
    assert.deepEqual(view.fetched.map((call) => call.url), [`/api/sports/streams/detail?id=${ARSENAL_ID}`]);
    const frame = view.$('iframe');
    assert.equal(frame.getAttribute('src'), `https://embed.example.com/?id=${ARSENAL_ID}&source=lola`);
    // A sandboxed frame is refused outright by the player.
    assert.equal(frame.hasAttribute('sandbox'), false);
    // So is one that sends no referrer: the browser default is left alone.
    assert.equal(frame.hasAttribute('referrerpolicy'), false);
    assert.equal(frame.getAttribute('allow'), 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    assert.equal(frame.hasAttribute('allowfullscreen'), true);
    assert.match(frame.getAttribute('title'), /Arsenal vs Chelsea/);

    // The switcher stays on screen; only https sources are offered.
    assert.deepEqual(view.$$('.sx-sources__btn').map((button) => button.textContent), ['LOLAHD', 'HDTV']);
    await view.click(view.$$('.sx-sources__btn')[1]);
    assert.equal(view.$('iframe').getAttribute('src'), `https://embed.example.com/?id=${ARSENAL_ID}&source=hdtv`);

    // Stop removes the frame, so the third-party player is really gone.
    await view.click(view.$('[aria-label="Stop the stream"]'));
    assert.equal(view.$('iframe'), null);
  } finally {
    await view.unmount();
  }
});

test('choosing another match stops the stream that was playing', async () => {
  const view = await mount(liveBoard());
  try {
    await view.click(view.$('.sx-player__big'));
    assert.ok(view.$('iframe'));
    await view.click(view.$(`[data-stream-match="${BARCA_ID}"] .sx-row__main`));
    assert.equal(view.$('iframe'), null);
    assert.match(view.$('.sx-player__chips').textContent, /BAR\s*1 - 0\s*RMA/);
    assert.match(view.$(`[data-stream-match="${BARCA_ID}"]`).className, /is-selected/);
  } finally {
    await view.unmount();
  }
});

test('a match with no source yet says so and offers to check again', async () => {
  const view = await mount(liveBoard(), { detail: (id) => ({ status: 200, body: { state: 'ok', detail: { ...parseStreamDetail(detailPayload(id))!, sources: [] } } }) });
  try {
    await view.click(view.$('.sx-player__big'));
    assert.equal(view.$('iframe'), null);
    assert.match(view.$('.sx-player__note').textContent, /No stream source is listed for this match yet/);
    await view.click(view.$('.sx-player__note button'));
    assert.equal(view.fetched.length, 2);
  } finally {
    await view.unmount();
  }
});

test('a match that starts later cannot be played yet, and one about to start can', async () => {
  const view = await mount(liveBoard());
  try {
    await view.click(view.tab('Upcoming'));
    assert.deepEqual(view.rows().map((row) => row.replace(/\d\d:\d\d$/, '')), ['1.NewcastlevsEverton', '2.PSGvsBenfica']);
    await view.click(view.$(`[data-stream-match="${LATER_ID}"] .sx-row__main`));
    assert.match(view.$('.sx-player__note').textContent, /The stream opens about 30 minutes before kick-off/);
    assert.equal(view.$('.sx-player__big'), null);
    assert.equal(view.$('[aria-label="Play the stream"]').disabled, true);
    assert.equal(view.fetched.length, 0, 'no request is spent on a stream that cannot exist yet');

    await view.click(view.$(`[data-stream-match="${SOON_ID}"] .sx-row__main`));
    assert.ok(view.$('.sx-player__big'));
    // Only a fixture still to come can go in a calendar.
    assert.equal(view.$(`[data-stream-match="${SOON_ID}"] [aria-label="Add to calendar"]`).disabled, false);
    await view.click(view.tab('Live'));
    assert.equal(view.$(`[data-stream-match="${ARSENAL_ID}"] [aria-label="Add to calendar"]`).disabled, true);
  } finally {
    await view.unmount();
  }
});

test('a bookmark is kept in this browser and listed under Bookmarks', async () => {
  const view = await mount(liveBoard());
  try {
    await view.click(view.tab('Bookmarks'));
    assert.match(view.$('.sx-empty').textContent, /No bookmarked matches yet/);
    await view.click(view.tab('Live'));
    await view.click(view.$(`[data-stream-match="${BARCA_ID}"] [aria-label="Bookmark this match"]`));
    assert.equal(view.$(`[data-stream-match="${BARCA_ID}"] [aria-label="Remove bookmark"]`).getAttribute('aria-pressed'), 'true');
    await view.click(view.tab('Bookmarks'));
    assert.deepEqual(view.rows(), ["1.Barcelona1 - 0Real Madrid24'"]);
    const stored = JSON.parse(dom.window.localStorage.getItem('hyper:streams:saved:v1')!);
    assert.deepEqual(stored.matches.map((match: { id: string }) => match.id), [BARCA_ID]);
  } finally {
    await view.unmount();
  }
});

test('the info row shows what SportSRC reports about the match and lets a club be followed', async () => {
  const view = await mount(liveBoard());
  try {
    await view.click(view.$(`[data-stream-match="${ARSENAL_ID}"] [aria-label="Match information"]`));
    const info = view.$('.sx-info').textContent;
    assert.match(info, /Premier League · England · 2026\/2027 · Round 9/);
    assert.match(info, /Emirates Stadium · London · 60,383 seats/);
    assert.match(info, /Michael Oliver/);
    assert.match(info, /Mikel Arteta · Enzo Maresca/);
    assert.match(info, /LOLA HD, HDTV/);
    await view.click(view.$$('.sx-star')[0]);
    assert.deepEqual(view.$$('.sx-group__item').map((item) => item.textContent).slice(-1), ['Arsenal']);
  } finally {
    await view.unmount();
  }
});

test('the search box and a league narrow the list, and Clear undoes both', async () => {
  const view = await mount(liveBoard());
  try {
    await view.click(view.tab('All'));
    assert.equal(view.rows().length, 6);
    await view.click(view.$$('.sx-group__item').find((item) => item.textContent.startsWith('La Liga')));
    assert.deepEqual(view.rows().map((row) => row.slice(0, 12)), ['1.Barcelona1', '2.AC Milan2 ']);
    assert.match(view.$('.sx-filter').textContent, /Showing La Liga/);
    await view.click(view.$('.sx-filter button'));
    assert.equal(view.rows().length, 6);
  } finally {
    await view.unmount();
  }
});

test('with no key on the server, visitors are told streams are off, not shown an empty player', async () => {
  const view = await mount(emptyStreamBoard('missing-key'));
  try {
    assert.match(view.$('.sx-player__note').textContent, /Live streams are not switched on yet/);
    assert.match(view.$('.sx-empty').textContent, /Live streams are not switched on yet/);
    assert.equal(view.rows().length, 0);
    assert.equal(view.$('[aria-label="Play the stream"]').disabled, true);
    assert.equal(view.tab('All').getAttribute('aria-pressed'), 'true');
    // The rest of the page still works.
    assert.equal(view.$$('.sx-news li').length, 4);
  } finally {
    await view.unmount();
  }
});

test('a day with no streamed match says so plainly', async () => {
  const view = await mount({ ...emptyStreamBoard('ok'), sports: parseStreamSports(sportsPayload()) });
  try {
    assert.match(view.$('.sx-player__note').textContent, /No match with a stream right now/);
    assert.match(view.$('.sx-empty').textContent, /No matches with a stream are listed for this day/);
  } finally {
    await view.unmount();
  }
});
