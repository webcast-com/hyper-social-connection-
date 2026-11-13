import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';
import type { SportsHighlightsBoard } from '../../src/lib/espn-highlights-feed';
import type { IndexedHighlights } from '../../src/lib/highlights-index';
import type { SportsHighlightClip } from '../../src/lib/espn-highlights';
import type { SportsVideoNewsClip } from '../../src/lib/espn-video-news';

/**
 * The highlights page.
 *
 * The homepage card shows four clips behind a "show all" control; this page is
 * the same board with nowhere to stop, plus the two filters the sports board
 * already speaks. What matters here is that it asks ESPN for nothing new on load,
 * that a filter can only narrow what the board really holds, that a sample board
 * stays labelled and read-only, and that a board with no clips says so instead of
 * substituting a reel.
 *
 * The second half of this file is the stored index: clips a background sweeper
 * kept in Postgres, rendered in their own section, filtered and paged through the
 * endpoint rather than in memory, and reported with counts that say what they
 * count. Without a database none of that exists, and the page must look exactly
 * as it did before the index did — which is what the first half still asserts.
 */

const clip = (over: Partial<SportsHighlightClip> = {}): SportsHighlightClip => ({
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

const summary = (over: Record<string, unknown> = {}) => ({
  ok: true, clips: 0, matchClips: 0, leagueClips: 0, competitions: 0,
  oldestAt: null, newestAt: null, lastSweepAt: null, sweptCells: 0, ...over,
});

/** An index that is there but holds nothing: valid, ok, empty. */
const noClipsIndex = (over: Partial<IndexedHighlights> = {}): IndexedHighlights => ({
  ok: true, match: [], league: [], remaining: 0, byLeague: [], byStatus: [],
  summary: summary(), ...over,
});

/** No database, so nothing is stored and nothing can be queried. */
const unavailableIndex = (reason: 'no-database' | 'query-failed' = 'no-database'): IndexedHighlights => ({
  ok: false, reason, match: [], league: [], remaining: 0, byLeague: [], byStatus: [],
  summary: { ...summary({ ok: false, reason }), },
});

/** A league video clip: no fixture, no score, no match page, and none invented. */
const leagueClip = (over: Partial<SportsVideoNewsClip> = {}): SportsVideoNewsClip => ({
  id: 'espn-video-epl-31053444',
  clipId: '31053444',
  title: 'Arsenal 2-1 Chelsea | Premier League highlights',
  description: 'Goals from the north London derby.',
  league: 'epl',
  leagueName: 'Premier League',
  sport: 'football',
  teams: ['Arsenal', 'Chelsea'],
  publishedAt: '2026-11-08T19:40:00.000Z',
  page: 'https://www.espn.com/video/clip/_/id/31053444',
  thumbnail: 'https://a.espncdn.com/media/2026/1108/31053444.jpg',
  ...over,
});

async function mountPage(initial: SportsHighlightsBoard, options: {
  engagement?: unknown; signedIn?: boolean; initialLeague?: string; initialStatus?: string;
  initialIndex?: IndexedHighlights | null; initialDays?: number; initialLimit?: number; initialOffset?: number;
} = {}) {
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
      initialIndex: options.initialIndex ?? null,
      engagement: options.engagement ?? {},
      signedIn: options.signedIn ?? false,
      currentUser: options.signedIn ? { id: 7, name: 'Asha', username: 'asha' } : null,
      initialLeague: options.initialLeague ?? '',
      initialStatus: options.initialStatus ?? '',
      initialDays: options.initialDays ?? 0,
      initialLimit: options.initialLimit ?? 24,
      initialOffset: options.initialOffset ?? 0,
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
    /** A section heading, when the page renders the indexed layout. */
    section: (label: string) => [...container.querySelectorAll('section')].find((node: any) => node.getAttribute('aria-label') === label) ?? null,
    button: (label: string) => [...container.querySelectorAll('button')].find((node: any) => node.textContent.trim() === label) ?? null,
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
    assert.match(details.textContent, /Live board: unavailable · 5 clips from 5 games · sample cards, no posts to engage with/);
    assert.match(details.textContent, /Stored index: not read for this page/);
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
    assert.match(page.text(), /ESPN published no clips for the fixtures this board asked about, and nothing is stored yet\./);
    assert.equal(page.container.querySelector('video'), null, 'no player is rendered for a clip that does not exist');
    // No filters are offered for a board that holds nothing.
    assert.equal(page.container.querySelectorAll('[role="group"]').length, 0);

    const details = page.container.querySelector('details')!;
    details.setAttribute('open', '');
    assert.match(details.textContent, /Live board: partial · 0 clips from 0 games/);
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
    // The page reads the indexed shape, so the response carries both halves; the
    // stored half says "no database", which is the truth on a deployment without
    // one, and the page carries on showing the live board.
    page.stubApi(() => Response.json({
      board: board([
        clip({ id: '9', eventId: 'espn-ucl-401999999', eventName: 'Milan vs Madrid', title: 'A fresh clip', league: 'ucl', leagueName: 'UEFA Champions League' }),
      ]),
      index: unavailableIndex(),
    }));
    await page.click(refresh);
    await page.settle();
    assert.deepEqual(page.urls, ['/api/sports/highlights?index=1&limit=24&refresh=1'], 'one request, to the existing endpoint, bypassing its cache');
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

/* ── The stored index ───────────────────────────────────────────────────── */

test('stored clips render in their own section, and a clip on both is shown once', async () => {
  const index: IndexedHighlights = noClipsIndex({
    match: [
      clip({ id: '77', eventId: 'espn-ucl-401777777', eventName: 'Madrid vs Milan', title: 'A stored Champions League clip', league: 'ucl', leagueName: 'UEFA Champions League' }),
      // Also on the live board: one clip, one card.
      clip(),
    ],
    league: [leagueClip()],
    byLeague: [
      { league: 'ucl', leagueName: 'UEFA Champions League', total: 1 },
      { league: 'epl', leagueName: 'Premier League', total: 2 },
    ],
    byStatus: [{ status: 'final', total: 3 }],
    summary: summary({
      clips: 3, matchClips: 2, leagueClips: 1, competitions: 2, sweptCells: 48,
      lastSweepAt: new Date(Date.now() - 120_000).toISOString(),
      oldestAt: '2026-10-01T18:00:00.000Z',
    }),
  });
  const page = await mountPage(board([clip()]), { initialIndex: index, signedIn: true });
  try {
    assert.deepEqual(page.urls, [], 'reading the stored index costs no request on load');

    assert.match(page.text(), /3 clips stored across 2 competitions/);
    assert.match(page.text(), /2 match, 1 league video/);
    assert.match(page.text(), /last swept 2 min ago/);
    assert.match(page.text(), /oldest Oct 1, 2026/);

    const live = page.section('Live highlights board')!;
    assert.ok(live, 'the board keeps its own labelled section');
    assert.match(live.textContent, /On the live board now/);
    assert.equal(live.querySelectorAll('article').length, 1);

    const storedSection = page.section('Stored match highlights')!;
    assert.equal(storedSection.querySelectorAll('article').length, 1, 'the clip the board already shows is not rendered twice');
    assert.match(storedSection.textContent, /A stored Champions League clip/);
    assert.equal(page.cards().length, 3, 'one live card, one stored card, one league video card');

    const leagueSection = page.section('Stored league video')!;
    assert.match(leagueSection.textContent, /Arsenal 2-1 Chelsea \| Premier League highlights/);
    assert.match(leagueSection.textContent, /They have no fixture behind them, so no score, kickoff or match page is\s*shown for one\./);
    assert.ok(!leagueSection.querySelector('video'), 'a league clip resolves its media only when a reader presses play');

    // Counts are stored counts, and the page says that out loud.
    assert.equal(page.chip('UEFA Champions League')!.textContent.trim(), 'UEFA Champions League1');
    assert.equal(page.chip('UEFA Champions League')!.getAttribute('title'), 'Stored clips in UEFA Champions League');
    assert.equal(page.chip('Premier League')!.textContent.trim(), 'Premier League2');
    assert.equal(page.chip('Every competition')!.textContent.trim(), 'Every competition3');
    assert.equal(page.chip('Full time')!.textContent.trim(), 'Full time3');
    assert.equal(page.chip('Any state')!.getAttribute('title'), null);
    assert.match(page.text(), /Counts on these chips are clips stored in the index, not clips on this page\./);

    assert.deepEqual([...page.container.querySelectorAll('[role="group"]')].map((node: any) => node.getAttribute('aria-label')),
      ['Filter highlights by competition', 'Filter highlights by match state', 'Filter highlights by age'],
      'an age filter exists only when there is storage to filter');
    assert.ok(page.chip('7 days') && page.chip('A year'));
    assert.equal(page.chip('Any age')!.getAttribute('aria-pressed'), 'true');

    const details = page.container.querySelector('details')!;
    details.setAttribute('open', '');
    assert.match(details.textContent, /Stored index: read · 3 clips \(2 match, 1 league video\) across 2 competitions · 48 scoreboards walked · showing 3/);
    assert.match(details.textContent, /Clips are kept permanently: nothing deletes a stored clip\./);
  } finally {
    await page.unmount();
  }
});

test('a filter or a further page is read from the endpoint when clips are stored', async () => {
  const first = noClipsIndex({
    match: [clip({ id: '60', eventId: 'espn-ucl-401606060', eventName: 'Milan vs Madrid', title: 'A stored clip', league: 'ucl', leagueName: 'UEFA Champions League' })],
    remaining: 7,
    byLeague: [{ league: 'ucl', leagueName: 'UEFA Champions League', total: 8 }],
    byStatus: [{ status: 'final', total: 8 }],
    summary: summary({ clips: 8, matchClips: 8, competitions: 1 }),
  });
  const page = await mountPage(board([clip()]), { initialIndex: first, initialLimit: 2 });
  try {
    assert.deepEqual(page.urls, []);

    // Typed so a clip literal keeps its match state instead of widening to string.
    const responses: { board: SportsHighlightsBoard; index: IndexedHighlights }[] = [
      { board: board([clip()]), index: noClipsIndex({ ...first, match: [clip({ id: '61', eventId: 'espn-ucl-401616161', eventName: 'Milan vs Madrid', title: 'A week-old stored clip', league: 'ucl', leagueName: 'UEFA Champions League' })], remaining: 5, byLeague: first.byLeague, byStatus: first.byStatus, summary: first.summary }) },
      { board: board([clip()]), index: noClipsIndex({ ...first, match: [clip({ id: '62', eventId: 'espn-ucl-401626262', eventName: 'Milan vs Madrid', title: 'An older stored clip', league: 'ucl', leagueName: 'UEFA Champions League' })], remaining: 3, byLeague: first.byLeague, byStatus: first.byStatus, summary: first.summary }) },
    ];
    page.stubApi(() => Response.json(responses.shift() ?? responses[0]));

    await page.click(page.chip('7 days')!);
    await page.settle();
    assert.deepEqual(page.urls, ['/api/sports/highlights?index=1&limit=2&days=7'], 'an age filter is one indexed read');
    assert.equal(page.chip('7 days')!.getAttribute('aria-pressed'), 'true', 'the chip follows what loaded');
    assert.match(page.text(), /A week-old stored clip/);
    assert.ok(!page.text().includes('A stored clip'), 'the previous page is replaced, not kept');

    const more = page.button('Load 2 more stored clips')!;
    assert.ok(more, 'the button says how many clips are next');
    await page.click(more);
    await page.settle();
    assert.deepEqual(page.urls[1], '/api/sports/highlights?index=1&limit=2&days=7&offset=2', 'the next slice, from where the last one stopped');
    assert.match(page.text(), /A week-old stored clip/);
    assert.match(page.text(), /An older stored clip/, 'a further page is appended to what is already shown');
    assert.match(page.text(), /3 more match this filter/);
  } finally {
    await page.unmount();
  }
});

test('the sweep button reports what the pass asked and stored, including a pass that did nothing', async () => {
  const page = await mountPage(board([clip()]), { initialIndex: noClipsIndex({ summary: summary({ clips: 41, matchClips: 34, leagueClips: 7, competitions: 9 }) }) });
  try {
    page.stubApi((url) => (url.includes('/sweep')
      ? Response.json({
        pass: {
          ok: true, cells: 24, games: 18, clips: 41, leagueClips: 7, requests: 54,
          truncated: true, startedAt: new Date().toISOString(), durationMs: 3120,
          summary: summary({ clips: 48, competitions: 9, sweptCells: 72 }),
        },
        summary: summary({ clips: 48, competitions: 9, sweptCells: 72 }),
      })
      : Response.json({
        board: board([clip()]),
        index: noClipsIndex({
          byLeague: [{ league: 'epl', leagueName: 'Premier League', total: 48 }],
          byStatus: [{ status: 'final', total: 41 }],
          summary: summary({ clips: 48, matchClips: 41, leagueClips: 7, competitions: 9, sweptCells: 72 }),
        }),
      })));

    await page.click(page.button('Sweep more competitions')!);
    await page.settle();
    await page.settle();

    assert.equal(page.urls[0], '/api/sports/highlights/sweep?force=1');
    assert.match(page.text(), /Sweep: 24 scoreboards walked, 18 games asked, 41 match clips and 7 league clips stored, 54 requests in 3\.1s\./);
    assert.match(page.text(), /The pass stopped at its deadline or its slice; the rest of the catalog waits for the next one\./);
    assert.match(page.text(), /48 clips stored across 9 competitions/, 'a pass that stored clips re-reads the index');
    assert.ok(page.urls.some((url) => url.startsWith('/api/sports/highlights?index=1')));
    assert.match(page.text(), /72 scoreboards walked/);
  } finally {
    await page.unmount();
  }

  const limited = await mountPage(board([clip()]), { initialIndex: noClipsIndex() });
  try {
    limited.stubApi(() => Response.json({
      pass: { ok: false, reason: 'rate-limited', cells: 0, games: 0, clips: 0, leagueClips: 0, requests: 0, truncated: false, startedAt: new Date().toISOString(), durationMs: 0, summary: summary() },
      summary: summary(),
    }));
    await limited.click(limited.button('Sweep more competitions')!);
    await limited.settle();
    assert.match(limited.text(), /A sweep ran moments ago, so this one did nothing\. Coverage advances a bounded slice at a time, on a rate limit, so ESPN is never hammered\./);
    assert.equal(limited.urls.length, 1, 'a pass that did nothing re-reads nothing');
    // An index that is readable but empty must not badge the board's own clips
    // with stored counts: a zero next to a card would be a lie about that card.
    assert.equal(limited.chip('Premier League')!.textContent.trim(), 'Premier League1');
    assert.equal(limited.chip('Premier League')!.getAttribute('title'), 'Clips on the live board in Premier League');
    assert.ok(!limited.text().includes('Counts on these chips are clips stored in the index'), 'and the caption says which count is which');
  } finally {
    await limited.unmount();
  }

  const broken = await mountPage(board([clip()]), { initialIndex: noClipsIndex() });
  try {
    broken.stubApi(() => Response.json({ pass: { ok: true, cells: 'many' } }));
    await broken.click(broken.button('Sweep more competitions')!);
    await broken.settle();
    assert.match(broken.text(), /Could not run a sweep\. Nothing stored changed\./, 'a report that is not a report changes nothing');
  } finally {
    await broken.unmount();
  }
});

test('an index that cannot be read says why, and the page carries on from the board', async () => {
  const page = await mountPage(board(fiveClips()), { initialIndex: unavailableIndex('query-failed') });
  try {
    assert.match(page.text(), /The stored clip index could not be read, so this page is showing the live board only\. Stored clips are kept, not lost\./);
    assert.equal(page.cards().length, 5);
    assert.deepEqual(page.urls, []);
    assert.equal(page.section('Stored match highlights'), null);
    assert.equal(page.container.querySelectorAll('[role="group"]').length, 2, 'no age filter without storage');
    assert.equal(page.chip('Premier League')!.textContent.trim(), 'Premier League2', 'counts fall back to the board');
    assert.ok(!page.button('Load 24 more stored clips'));

    await page.click(page.chip('NBA')!);
    await page.settle();
    assert.deepEqual(page.urls, [], 'with nothing stored, a filter narrows in memory and asks for nothing');
    assert.equal(page.cards().length, 1);

    const details = page.container.querySelector('details')!;
    details.setAttribute('open', '');
    assert.match(details.textContent, /Stored index: unavailable \(query-failed\) · 0 clips/);
  } finally {
    await page.unmount();
  }

  // No database at all is a different sentence, and equally not an error.
  const none = await mountPage(board([clip()]), { initialIndex: unavailableIndex('no-database') });
  try {
    assert.match(none.text(), /No database is configured on this deployment, so there is nowhere to keep clips between requests\. Showing the live board only\./);
    assert.equal(none.cards().length, 1);
  } finally {
    await none.unmount();
  }
});

test('a stored clip that is also on the board is one card, and a broken indexed response keeps both', async () => {
  const index: IndexedHighlights = noClipsIndex({
    match: [clip()],
    summary: summary({ clips: 1, matchClips: 1, competitions: 1 }),
    byLeague: [{ league: 'epl', leagueName: 'Premier League', total: 1 }],
    byStatus: [{ status: 'final', total: 1 }],
  });
  const page = await mountPage(board([clip()]), { initialIndex: index });
  try {
    assert.equal(page.cards().length, 1, 'the same clip on the board and in the index is one card');
    assert.equal(page.section('Stored match highlights'), null, 'and an empty stored section is not rendered');
    assert.match(page.text(), /1 clip stored across 1 competition/);

    // The indexed response must carry both halves; one without the other is a
    // broken response, and what is on screen stays.
    page.stubApi(() => Response.json(board([clip()])));
    await page.click(page.button('Refresh highlights')!);
    await page.settle();
    assert.match(page.text(), /Could not refresh highlights\. Keeping the clips already shown\. Please try again\./);
    assert.equal(page.cards().length, 1);

    page.stubApi(() => Response.json({ board: board([clip()]), index: { ...index, match: 'not a list' } }));
    await page.click(page.button('Refresh highlights')!);
    await page.settle();
    assert.match(page.text(), /Could not refresh highlights\./);
    assert.match(page.text(), /Saka opens the scoring/, 'the clips already shown survive a malformed stored half');
  } finally {
    await page.unmount();
  }
});
