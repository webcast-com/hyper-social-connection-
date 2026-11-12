import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';
import type { SportsHighlightsBoard } from '../../src/lib/espn-highlights-feed';

/**
 * The highlights page.
 *
 * The homepage card shows four clips behind a "show all" control; this page is
 * the same board with nowhere to stop, plus the two filters the sports board
 * already speaks. What matters here is that it asks ESPN for nothing new, that
 * a filter can only narrow what the board really holds, that a sample board
 * stays labelled and read-only, and that a board with no clips says so instead
 * of substituting a reel.
 */

const clip = (over: Record<string, unknown> = {}) => ({
  id: '49861382',
  title: 'Saka opens the scoring',
  description: 'A curled finish from the edge of the box.',
  duration: 47,
  thumbnail: 'https://a.espncdn.com/media/2026/0907/49861382.jpg',
  mp4: 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4',
  hls: null,
  page: 'https://www.espn.com/video/clip/_/id/49861382',
  playable: true,
  eventId: 'espn-epl-401111111',
  eventName: 'Arsenal vs Chelsea',
  sport: 'football',
  league: 'epl',
  leagueName: 'Premier League',
  home: 'Arsenal',
  away: 'Chelsea',
  homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
  awayLogo: null,
  startAt: '2026-11-08T18:00:00.000Z',
  status: 'final',
  ...over,
});

const board = (clips: unknown[], status: SportsHighlightsBoard['status'] = 'live', over: Partial<SportsHighlightsBoard> = {}): SportsHighlightsBoard => ({
  clips: clips as never,
  status,
  games: clips.length,
  source: { ok: true, url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=401111111', httpStatus: 200 },
  ...over,
});

/** Five clips across three competitions and two match states. */
const fiveClips = () => [
  clip(),
  clip({ id: '2', eventId: 'espn-epl-401111112', eventName: 'Liverpool vs Everton', title: 'A late winner at Anfield' }),
  clip({ id: '3', eventId: 'espn-ucl-401111113', eventName: 'Real Madrid vs Bayern Munich', title: 'Madrid turn it around', sport: 'football', league: 'ucl', leagueName: 'UEFA Champions League' }),
  clip({ id: '4', eventId: 'espn-nba-401111114', eventName: 'Lakers vs Celtics', title: 'A fourth-quarter run', sport: 'basketball', league: 'nba', leagueName: 'NBA', status: 'live' }),
  clip({ id: '5', eventId: 'espn-ucl-401111115', eventName: 'Arsenal vs Milan', title: 'Arsenal hold on', sport: 'football', league: 'ucl', leagueName: 'UEFA Champions League', status: 'upcoming', startAt: '2026-11-19T20:00:00.000Z' }),
];

async function mountPage(initial: SportsHighlightsBoard, options: { engagement?: unknown; signedIn?: boolean; initialLeague?: string; initialStatus?: string } = {}) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  // An empty leaders board keeps the shared document clean for this page.
  const mounted = await mountBoard({
    basketball: { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } },
    football: { sport: 'football', league: 'nfl', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } },
  });
  const SportsHighlightsPage = (await import('../../src/components/SportsHighlightsPage')).default;
  const { createRoot } = await import('react-dom/client');
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);

  const original = globalThis.fetch;
  const urls: string[] = [];
  let respond: ((url: string) => Response | Promise<Response>) | null = null;
  globalThis.fetch = ((input: any) => {
    const url = String(input);
    urls.push(url);
    return Promise.resolve(respond ? respond(url) : new Response('not stubbed', { status: 500 }));
  }) as typeof fetch;

  const settle = async () => { await act(async () => { await new Promise((done) => setTimeout(done, 0)); }); };
  await act(async () => {
    root.render(React.createElement(SportsHighlightsPage as never, {
      initial,
      engagement: options.engagement ?? {},
      signedIn: options.signedIn ?? false,
      initialLeague: options.initialLeague ?? '',
      initialStatus: options.initialStatus ?? '',
      returnTo: '/sports',
    } as never));
  });

  /** A filter chip: only the two filter groups have them, never a clip card. */
  const chips = () => [...container.querySelectorAll('[role="group"] button[aria-pressed]')] as any[];
  const chip = (label: string) => chips().find((node) => node.textContent.trim().startsWith(label)) ?? null;
  const cards = () => [...container.querySelectorAll('article')];

  return {
    ...mounted,
    container,
    urls,
    settle,
    cards,
    chip,
    /** Answer the page's own refresh call. */
    stubApi: (next: (url: string) => Response | Promise<Response>) => { respond = next; },
    text: () => container.textContent ?? '',
    unmount: async () => {
      globalThis.fetch = original;
      await act(() => root.unmount());
      container.remove();
      await mounted.unmount();
    },
  };
}

test('every clip on the board is listed, and the filters only offer what it holds', async () => {
  const page = await mountPage(board(fiveClips()));
  try {
    // No four-clip limit and no "show all" control: this is the whole board.
    assert.equal(page.cards().length, 5);
    assert.ok(![...page.container.querySelectorAll('button')].some((node: any) => node.textContent.includes('Show all')),
      'nothing is held back behind the homepage card\u2019s "show all" control');
    assert.deepEqual(page.urls, [], 'the page asks ESPN and this site for nothing on load');

    assert.match(page.text(), /Clips from 5 ESPN games in the last seven days of finished fixtures\./);
    // Only competitions and states this board really has clips for are offered.
    const labels = [...page.container.querySelectorAll('[role="group"] button[aria-pressed]')].map((node: any) => node.textContent.trim());
    assert.deepEqual(labels, [
      'Every competition5', 'NBA1', 'Premier League2', 'UEFA Champions League2',
      'Any state5', 'Live1', 'Upcoming1', 'Full time3',
    ], 'a filter that would empty the page by construction is never offered');
    assert.ok(!labels.some((label) => label.includes('NFL')), 'a competition with no clips here is not offered');
    assert.deepEqual([...page.container.querySelectorAll('[role="group"]')].map((node: any) => node.getAttribute('aria-label')),
      ['Filter highlights by competition', 'Filter highlights by match state']);
  } finally {
    await page.unmount();
  }
});

test('a filter narrows the list, and a combination with nothing in it says so', async () => {
  const page = await mountPage(board(fiveClips()));
  try {
    await page.click(page.chip('UEFA Champions League')!);
    assert.equal(page.cards().length, 2);
    assert.match(page.text(), /Madrid turn it around/);
    assert.ok(!page.text().includes('Saka opens the scoring'), 'a filtered-out clip is not rendered');
    assert.equal(page.chip('UEFA Champions League')!.getAttribute('aria-pressed'), 'true');
    // The state counts follow the competition already chosen.
    assert.equal(page.chip('Full time')!.textContent.trim(), 'Full time1');
    assert.equal(page.chip('Upcoming')!.textContent.trim(), 'Upcoming1');
    assert.equal(page.chip('Live')!.textContent.trim(), 'Live0');

    await page.click(page.chip('Live')!);
    assert.equal(page.cards().length, 0);
    assert.match(page.text(), /No clips match those filters\./);
    assert.match(page.text(), /5 clips are on this board, none of them in UEFA Champions League and Live\./);

    const clear = [...page.container.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Show every clip')!;
    await page.click(clear);
    assert.equal(page.cards().length, 5, 'clearing the filters brings the whole board back');
    assert.equal(page.chip('Every competition')!.getAttribute('aria-pressed'), 'true');
    assert.equal(page.chip('Any state')!.getAttribute('aria-pressed'), 'true');
  } finally {
    await page.unmount();
  }
});

test('a filter chosen on the query string is honoured on the first render', async () => {
  const page = await mountPage(board(fiveClips()), { initialLeague: 'ucl', initialStatus: 'final' });
  try {
    assert.equal(page.cards().length, 1, 'only the Champions League clip that is full time');
    assert.match(page.text(), /Madrid turn it around/);
    assert.equal(page.chip('UEFA Champions League')!.getAttribute('aria-pressed'), 'true');
    assert.equal(page.chip('Full time')!.getAttribute('aria-pressed'), 'true');
  } finally {
    await page.unmount();
  }
});

test('a sample board stays labelled, and its cards stay read-only', async () => {
  // Signed in, so the only thing standing between this reader and engagement is
  // that a placeholder clip has no anchor post to engage with.
  const page = await mountPage(board(fiveClips(), 'unavailable'), { signedIn: true });
  try {
    assert.match(page.text(), /Sample cards · ESPN highlight videos are unreachable right now/);
    assert.equal(page.cards().length, 5);
    for (const card of page.cards()) {
      assert.equal(card.querySelectorAll('form').length, 0, 'no like, save, share or comment form on a sample card');
    }
    const comment = page.cards()[0].querySelector('button[aria-label^="Comment on"]')!;
    assert.ok(comment, 'the card still has its Comment control');
    await page.click(comment);
    assert.match(page.cards()[0].textContent, /Engagement is unavailable on sample cards\. It returns with the live feed\./);
    assert.match(page.cards()[0].textContent, /Comments open when this card has a live feed behind it\./);
    assert.equal(page.cards()[0].querySelectorAll('form').length, 0, 'opening the thread offers no composer to submit');

    const details = page.container.querySelector('details')!;
    details.setAttribute('open', '');
    assert.match(details.textContent, /Board: unavailable · 5 clips from 5 games · sample cards, no posts to engage with/);
  } finally {
    await page.unmount();
  }

  // The same reader on a live board can engage, so the difference is the board.
  const live = await mountPage(board(fiveClips(), 'live'), { signedIn: true });
  try {
    assert.ok(live.cards()[0].querySelectorAll('form').length > 0, 'a live clip offers the same engagement a post does');
    assert.ok(!live.text().includes('Sample cards'), 'and is not labelled as a sample');
  } finally {
    await live.unmount();
  }
});

test('a board with no clips says so, with the reason the feed reported', async () => {
  const page = await mountPage(board([], 'partial', {
    games: 0,
    source: { ok: false, url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=401111111', httpStatus: 403, errorKind: 'http', error: 'ESPN HTTP 403' },
  }));
  try {
    assert.equal(page.cards().length, 0);
    assert.match(page.text(), /No highlight clips right now\./);
    assert.match(page.text(), /ESPN published no clips for the fixtures this board asked about\./);
    assert.equal(page.container.querySelector('video'), null, 'no player is rendered for a clip that does not exist');
    // No filters are offered for a board that holds nothing.
    assert.equal(page.container.querySelectorAll('[role="group"]').length, 0);

    const details = page.container.querySelector('details')!;
    details.setAttribute('open', '');
    assert.match(details.textContent, /Board: partial · 0 clips from 0 games/);
    assert.match(details.textContent, /Not reported · HTTP 403 · http · ESPN HTTP 403/);
  } finally {
    await page.unmount();
  }
});

test('a refresh re-reads the highlights endpoint, and keeps the clips when it fails', async () => {
  const page = await mountPage(board([clip()]));
  try {
    const refresh = [...page.container.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Refresh highlights')!;

    // A good refresh replaces the board, and only asks the one existing endpoint.
    page.stubApi((url) => Response.json(board([
      clip({ id: '9', eventId: 'espn-ucl-401999999', eventName: 'Milan vs Madrid', title: 'A fresh clip', league: 'ucl', leagueName: 'UEFA Champions League' }),
    ])));
    await page.click(refresh);
    await page.settle();
    assert.deepEqual(page.urls, ['/api/sports/highlights?refresh=1'], 'one request, to the existing endpoint, bypassing its cache');
    assert.equal(page.cards().length, 1);
    assert.match(page.text(), /A fresh clip/);
    assert.ok(!page.text().includes('Saka opens the scoring'));

    // A broken response is not a new board: the clips on screen stay.
    page.stubApi(() => Response.json({ clips: 'not a list', status: 'live', games: 1, source: { ok: true, url: '', httpStatus: 200 } }));
    await page.click(refresh);
    await page.settle();
    assert.match(page.text(), /Could not refresh highlights\. Keeping the clips already shown\. Please try again\./);
    assert.match(page.text(), /A fresh clip/, 'the previous board survives a broken response');

    // So is a refused one.
    page.stubApi(() => new Response('denied', { status: 403 }));
    await page.click(refresh);
    await page.settle();
    assert.match(page.text(), /Could not refresh highlights\./);
    assert.equal(page.cards().length, 1);
    assert.equal(page.urls.length, 3, 'each press of the button is one request, and no more');
  } finally {
    await page.unmount();
  }
});
