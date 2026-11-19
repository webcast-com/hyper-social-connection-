import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyStreamBoard, parseStreamMatches, parseStreamSports, type StreamBoard } from '../../src/lib/sportsrc';
import { pickToastMatch, toastCandidates, toastHref } from '../../src/lib/stream-toast';
import { ARSENAL_ID, BARCA_ID, NOW, SOON_ID, matchesPayload, sportsPayload } from './sportsrc-fixture';

/**
 * The homepage's floating live-stream card: which match it names, that it comes
 * back with a different one, and that it stays out of the way — nothing when
 * there is nothing to watch, gone for good when closed.
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

// Fixture kickoffs are relative to a fixed instant; "can be watched now" reads the clock.
const RealDate = Date;
g.Date = class extends RealDate {
  constructor(...args: any[]) { if (args.length) super(...(args as [any])); else super(NOW); }
  static now() { return NOW; }
};

const matches = () => parseStreamMatches(matchesPayload()).matches;
const board = (): StreamBoard => ({ state: 'ok', sport: 'football', date: '', fetchedAt: '', sports: parseStreamSports(sportsPayload()), ...parseStreamMatches(matchesPayload()) });

test('the card names only matches that can be watched now, those in play first', () => {
  assert.deepEqual(toastCandidates(matches(), new RealDate(NOW)).map((match) => match.id), [ARSENAL_ID, BARCA_ID, SOON_ID]);
  // With nothing in play, a match about to start is still worth naming; one three hours away is not.
  assert.deepEqual(toastCandidates(matches().filter((match) => match.status !== 'live'), new RealDate(NOW)).map((match) => match.id), [SOON_ID]);
  assert.deepEqual(toastCandidates([], new RealDate(NOW)), []);
});

test('each appearance is a different match, and every match is shown before any is repeated', () => {
  const candidates = toastCandidates(matches(), new RealDate(NOW));
  let history: string[] = [];
  const shown: string[] = [];
  for (let round = 0; round < 7; round++) {
    const picked = pickToastMatch(candidates, history);
    history = picked.history;
    shown.push(picked.match!.id);
  }
  assert.deepEqual(shown.slice(0, 3), [ARSENAL_ID, BARCA_ID, SOON_ID]);
  // Starting over does not open with the match just shown.
  assert.notEqual(shown[3], shown[2]);
  for (let index = 1; index < shown.length; index++) assert.notEqual(shown[index], shown[index - 1], `appearance ${index + 1} repeats the one before`);
  assert.deepEqual(new Set(shown.slice(3, 6)).size, 3, 'the second round also shows all three');
});

test('a match that kicks off between appearances is shown before an old one comes round again', () => {
  const [arsenal, barca, soon] = toastCandidates(matches(), new RealDate(NOW));
  const first = pickToastMatch([arsenal, barca], []);
  const second = pickToastMatch([arsenal, barca], first.history);
  const third = pickToastMatch([arsenal, barca, soon], second.history);
  assert.equal(third.match!.id, SOON_ID);
});

test('with one match there is only that match to show, and with none there is no card', () => {
  const [only] = toastCandidates(matches(), new RealDate(NOW));
  const first = pickToastMatch([only], []);
  assert.equal(pickToastMatch([only], first.history).match!.id, only.id);
  assert.equal(pickToastMatch([], ['x']).match, null);
});

test('the card links to the live-stream screen, opened on its match', () => {
  assert.equal(toastHref({ id: ARSENAL_ID }), `/sports/live?match=${ARSENAL_ID}`);
  assert.equal(toastHref({ id: 'a b&c' }), '/sports/live?match=a%20b%26c');
});

/* ── The card itself, mounted ───────────────────────────────────────────── */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const QUICK = { firstMs: 10, showMs: 60, gapMs: 40, refreshMs: 60_000 };

async function mount(answer: StreamBoard | (() => StreamBoard)) {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const Toast = (await import('../../src/components/LiveStreamToast')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  const fetched: string[] = [];
  g.fetch = async (input: string) => {
    fetched.push(String(input));
    return new Response(JSON.stringify(typeof answer === 'function' ? answer() : answer), { status: 200 });
  };
  const container = dom.window.document.getElementById('root')!;
  container.innerHTML = '';
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Toast as never, { timing: QUICK } as never)); });
  const card = () => container.querySelector('[data-live-toast]') as any;
  const shown = () => (card()?.getAttribute('data-visible') === 'true' ? card().getAttribute('data-live-toast') as string : null);
  /** Let real time pass with React flushing, until `done` or the limit. */
  const until = async (done: () => boolean, limitMs = 1_500) => {
    for (let waited = 0; waited < limitMs && !done(); waited += 10) await act(async () => { await wait(10); });
    return done();
  };
  return { container, card, shown, until, fetched, act, unmount: async () => { await act(() => root.unmount()); } };
}

test('the card pops up, goes away after a few seconds, and comes back with a different match', async () => {
  dom.window.sessionStorage.clear();
  const view = await mount(board());
  try {
    assert.equal(view.card(), null, 'nothing is on screen before its first appearance');
    assert.ok(await view.until(() => view.shown() === ARSENAL_ID));
    const link = view.card().querySelector('a');
    assert.equal(link.getAttribute('href'), `/sports/live?match=${ARSENAL_ID}`);
    assert.match(view.card().textContent, /Live.*Premier League.*2H.*Arsenal.*2.*Chelsea.*1.*Watch/);
    assert.equal(view.card().hasAttribute('inert'), false);

    assert.ok(await view.until(() => view.shown() === null), 'it goes away by itself');
    // Hidden, it cannot be tabbed into or read out.
    assert.equal(view.card().hasAttribute('inert'), true);

    assert.ok(await view.until(() => view.shown() !== null));
    assert.equal(view.shown(), BARCA_ID, 'a different match the second time');
    assert.ok(await view.until(() => view.shown() === null));
    assert.ok(await view.until(() => view.shown() !== null));
    assert.equal(view.shown(), SOON_ID, 'and another the third');
    assert.match(view.card().textContent, /Soon/);

    // One read of the match list served all three appearances.
    assert.deepEqual(view.fetched, ['/api/sports/streams?sport=football']);
    // It is not a live region: it would interrupt a screen reader every round.
    assert.equal(view.card().hasAttribute('aria-live'), false);
    assert.equal(view.card().getAttribute('role'), null);
  } finally {
    await view.unmount();
  }
});

test('it does not vanish from under a pointer', async () => {
  dom.window.sessionStorage.clear();
  const view = await mount(board());
  try {
    assert.ok(await view.until(() => view.shown() === ARSENAL_ID));
    await view.act(async () => { view.card().dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })); });
    await view.act(async () => { await wait(QUICK.showMs + 120); });
    assert.equal(view.shown(), ARSENAL_ID, 'still there while the pointer is on it');
  } finally {
    await view.unmount();
  }
});

test('closing it ends it for the visit', async () => {
  dom.window.sessionStorage.clear();
  const view = await mount(board());
  try {
    assert.ok(await view.until(() => view.shown() === ARSENAL_ID));
    await view.act(async () => { view.card().querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert.equal(view.shown(), null);
    await view.act(async () => { await wait(QUICK.gapMs + QUICK.showMs + 100); });
    assert.equal(view.shown(), null, 'it does not come back');
    assert.equal(dom.window.sessionStorage.getItem('hyper:streams:toast-dismissed'), '1');
  } finally {
    await view.unmount();
  }
  // The next page of the same visit does not even ask.
  const again = await mount(board());
  try {
    await again.act(async () => { await wait(120); });
    assert.equal(again.card(), null);
    assert.deepEqual(again.fetched, []);
  } finally {
    await again.unmount();
  }
});

test('with the stream provider not connected, or nothing to watch, there is no card at all', async () => {
  dom.window.sessionStorage.clear();
  const off = await mount(emptyStreamBoard('missing-key'));
  try {
    await off.act(async () => { await wait(200); });
    assert.equal(off.card(), null);
    assert.equal(off.fetched.length, 1, 'asked once, then left alone');
  } finally {
    await off.unmount();
  }
  const quiet = await mount({ ...board(), matches: board().matches.filter((match) => match.status === 'finished') });
  try {
    await quiet.act(async () => { await wait(200); });
    assert.equal(quiet.card(), null);
  } finally {
    await quiet.unmount();
  }
});
