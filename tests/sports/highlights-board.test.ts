import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_BUDGET_MS, MIN_STORED_CLIPS, STORED_BOARD_CLIPS, STORED_BOARD_DAYS,
  getHighlightsBoardForRender, storedHighlightsBoard, topUpBoardClips,
} from '../../src/lib/highlights-board';
import { INDEX_EMPTY, INDEX_UNAVAILABLE, type HighlightsIndexQuery, type HighlightsIndexSummary, type HighlightsStore, type IndexedHighlights } from '../../src/lib/highlights-index';
import { nudgeHighlightsSweep, resetHighlightsSweep } from '../../src/lib/highlights-sweep';
import { getSportsBoard } from '../../src/lib/sports';
import {
  getSportsHighlights, resetRecentFinishedEvents, seedRecentFinishedEvents,
  type SportsHighlightsBoard,
} from '../../src/lib/espn-highlights-feed';
import type { SportsHighlightClip } from '../../src/lib/espn-highlights';
import { findButton, mountBoard } from './leaders-post-cards';

/**
 * The board the homepage renders: stored clips first, the live feed when storage
 * cannot answer.
 *
 * The rules worth locking are the ones a reader would notice. A stored board must
 * cost no ESPN request at all, or the homepage has not actually got cheaper. It
 * must report itself live, or the feed dresses real clips as sample cards and
 * takes their Like button away. And every way storage can fail — missing, slow,
 * throwing, empty, too few rows — has to land on exactly the board this page
 * rendered before the index existed.
 */

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const matchClip = (over: Partial<SportsHighlightClip> = {}): SportsHighlightClip => ({
  id: '49861382',
  title: 'Saka opens the scoring',
  description: 'A curled finish from the edge of the box.',
  duration: 47,
  thumbnail: 'https://a.espncdn.com/media/2026/0907/49861382.jpg',
  mp4: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/0907/49861382_3600k.mp4',
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

/** Five stored clips across three fixtures, the smallest interesting board. */
const storedClips = (): SportsHighlightClip[] => [
  matchClip({ id: '49861382', eventId: 'espn-epl-401111111' }),
  matchClip({ id: '49861383', title: 'Havertz adds a second', eventId: 'espn-epl-401111111' }),
  matchClip({ id: '49861384', title: 'Vinícius curls it in', eventId: 'espn-ucl-401222222', league: 'ucl', leagueName: 'Champions League' }),
  matchClip({ id: '49861385', title: 'Curry from the logo', eventId: 'espn-nba-401333333', league: 'nba', leagueName: 'NBA', sport: 'basketball' }),
  matchClip({ id: '49861386', title: 'Tatum answers', eventId: 'espn-nba-401333334', league: 'nba', leagueName: 'NBA', sport: 'basketball' }),
];

const summary = (over: Partial<HighlightsIndexSummary> = {}): HighlightsIndexSummary => ({
  ...INDEX_UNAVAILABLE, ok: true, clips: 5, matchClips: 5, competitions: 3, ...over,
});

type FakeRead = {
  match?: SportsHighlightClip[];
  sourceUrl?: string | null;
  ok?: boolean;
  /** Never resolving is the interesting case: the render budget decides. */
  delayMs?: number;
  throws?: boolean;
};

/** A store that records every query it was asked, and fails on demand. */
function fakeStore(options: { available?: boolean; read?: FakeRead } = {}) {
  const queries: HighlightsIndexQuery[] = [];
  const reads = options.read ?? {};
  const store: HighlightsStore = {
    available: () => options.available ?? true,
    summary: async () => summary(),
    read: async (query: HighlightsIndexQuery): Promise<IndexedHighlights> => {
      queries.push(query);
      if (reads.throws) throw new Error('connection lost');
      if (reads.delayMs) await new Promise((resolve) => setTimeout(resolve, reads.delayMs));
      if (reads.ok === false) return { ...INDEX_EMPTY, reason: 'query-failed' };
      return {
        ok: true,
        match: reads.match ?? [],
        league: [],
        sourceUrl: reads.sourceUrl ?? null,
        remaining: 0,
        byLeague: [],
        byStatus: [],
        summary: summary({ clips: (reads.match ?? []).length }),
      };
    },
    store: async () => 0,
    probeable: async () => new Set<string>(),
    recordProbes: async () => {},
    freshCells: async () => new Set<string>(),
    recordCells: async () => {},
  };
  return { store, queries };
}

async function withFetch(run: () => Promise<void>, respond: typeof fetch): Promise<string[]> {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    urls.push(String(input));
    return respond(input, init);
  };
  try { await run(); } finally { globalThis.fetch = original; }
  return urls;
}

/** A scoreboard payload for one competition, in the shape the Site API sends. */
const scoreboard = (eventId: string, name: string, state: string) => ({
  events: [{
    id: eventId,
    date: '2026-11-08T18:00:00Z',
    competitions: [{
      status: { type: { state, shortDetail: state === 'in' ? 'Live' : 'Final' } },
      competitors: [
        { homeAway: 'home', team: { displayName: name, abbreviation: name.slice(0, 3).toUpperCase() }, score: '2' },
        { homeAway: 'away', team: { displayName: 'Visitors', abbreviation: 'VIS' }, score: '1' },
      ],
    }],
  }],
});

const liveClip = (id: string, headline: string) => ({
  id: Number(id),
  source: 'espn',
  headline,
  description: headline,
  duration: 42,
  thumbnail: `https://espnmedia-cdn.akamaized.net/espn/media/common/2026/0907/${id}.jpg`,
  links: {
    source: { href: `https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/0907/${id}.mp4` },
    web: { href: `https://www.espn.com/video/clip/_/id/${id}` },
  },
});

/**
 * One live board, built through the real feed and shared by every fallback case.
 *
 * The feed caches for fifteen minutes, so the first case pays for it and the rest
 * make no request at all — which also means a fallback case cannot be told apart
 * from a stored case by counting URLs, and has to be asserted on the board.
 */
async function seedLiveBoard(): Promise<SportsHighlightsBoard> {
  seedRecentFinishedEvents([]);
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/soccer/eng.1/scoreboard')) return Response.json(scoreboard('401111111', 'Arsenal', 'post'));
    if (url.includes('/videos?event=')) {
      return Response.json({ videos: [liveClip('70000001', 'First live clip'), liveClip('70000002', 'Second live clip')] });
    }
    return Response.json({ events: [] });
  };
  try {
    await getSportsBoard();
    return await getSportsHighlights(true);
  } finally {
    globalThis.fetch = original;
  }
}

/** The board every fallback case must land on, verbatim. */
let livePromise: Promise<SportsHighlightsBoard> | null = null;
const live = () => (livePromise ??= seedLiveBoard());

test('the live board is what it has always been', async () => {
  resetRecentFinishedEvents();
  const liveBoard = await live();
  assert.equal(liveBoard.status, 'live', 'ESPN answered, so the board is live');
  assert.equal(liveBoard.clips.length, 2, 'both clips from the one collection asked');
  assert.equal(liveBoard.games, 1);
  assert.equal(liveBoard.provenance, undefined, 'the feed stamps nothing: only the render read does');
});

/* ── Storage answers ────────────────────────────────────────────────────── */

test('enough stored clips are the board, and ESPN is asked for nothing', async () => {
  const { store, queries } = fakeStore({
    read: { match: storedClips(), sourceUrl: 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/videos?event=401111111' },
  });
  const urls = await withFetch(async () => {
    const board = await getHighlightsBoardForRender({ store });
    assert.equal(board.provenance, 'stored');
    assert.equal(board.status, 'live', 'real clips, so real cards');
    assert.deepEqual(board.clips.map((clip) => clip.id), ['49861382', '49861383', '49861384', '49861385', '49861386']);
    // The games a board claims are the fixtures its clips name, not the rows read.
    assert.equal(board.games, 4, 'five clips across four fixtures');
    assert.equal(board.source.ok, true);
    assert.equal(board.source.url, 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/videos?event=401111111', 'the endpoint the newest stored row came from');
    assert.equal(board.source.httpStatus, null, 'this render received no HTTP response, so none is claimed');
    assert.equal(queries.length, 1);
  }, async () => { throw new Error('a stored board must not reach for ESPN'); });
  assert.deepEqual(urls, [], 'zero requests: the whole point of reading storage');
});

test('the stored read is bounded, and asks for match clips only', async () => {
  const { store, queries } = fakeStore({ read: { match: storedClips() } });
  await getHighlightsBoardForRender({ store });
  assert.deepEqual(queries, [{ kind: 'match', days: STORED_BOARD_DAYS, limit: STORED_BOARD_CLIPS }]);
  assert.equal(STORED_BOARD_DAYS, 7, "the live feed's own window, so the card copy still holds");
  assert.equal(STORED_BOARD_CLIPS, 12, "the live feed's own cap");
  assert.equal(BOARD_BUDGET_MS, 900);
});

test('a stored board never shows more clips than the live one would', async () => {
  // The query asks for twelve, but a store that ignores the limit must not be
  // able to turn the homepage card into a wall of video.
  const many = Array.from({ length: 20 }, (_, index) => matchClip({ id: `498613${index}`, eventId: `espn-epl-40111${index}` }));
  const { store } = fakeStore({ read: { match: many } });
  const board = await getHighlightsBoardForRender({ store });
  assert.equal(board.clips.length, STORED_BOARD_CLIPS);
  assert.equal(board.games, STORED_BOARD_CLIPS, 'each of those clips is its own fixture');
});

test('too few stored clips fall back to the live board, topped up without duplicates', async () => {
  const liveBoard = await live();
  assert.equal(MIN_STORED_CLIPS, 4, 'three rows from one competition are a thinner card than twelve live clips');
  const collide = liveBoard.clips[0]!.id;
  const { store } = fakeStore({
    read: {
      match: [
        matchClip({ id: collide }),
        matchClip({ id: '49861390', title: 'A stored clip the live board is missing' }),
        matchClip({ id: '49861391', title: 'Another one' }),
      ],
    },
  });
  const board = await getHighlightsBoardForRender({ store });
  assert.equal(board.provenance, 'live', 'the live board filled it');
  assert.equal(board.status, liveBoard.status);
  assert.equal(board.games, liveBoard.games, 'the live count is not rewritten by a top-up');
  assert.deepEqual(board.clips.map((clip) => clip.id), [liveBoard.clips[0]!.id, liveBoard.clips[1]!.id, '49861390', '49861391'],
    'live clips first, in their own order, then the stored ones it was missing');
  assert.equal(new Set(board.clips.map((clip) => clip.id)).size, board.clips.length, 'no clip is shown twice');
});

test('topping up keeps the live order and stops at the cap', () => {
  const live = [matchClip({ id: 'a' }), matchClip({ id: 'b' })];
  assert.deepEqual(topUpBoardClips(live, [matchClip({ id: 'b' }), matchClip({ id: 'c' })]).map((clip) => clip.id), ['a', 'b', 'c']);
  assert.deepEqual(topUpBoardClips(live, []), live, 'nothing stored, nothing added');
  const full = Array.from({ length: 12 }, (_, index) => matchClip({ id: `live-${index}` }));
  assert.deepEqual(topUpBoardClips(full, [matchClip({ id: 'stored' })]), full, 'a full board is left alone');
  assert.equal(topUpBoardClips([], Array.from({ length: 30 }, (_, index) => matchClip({ id: `s-${index}` }))).length, 12);
});

/* ── Every way storage can fail ─────────────────────────────────────────── */

test('storage that is too slow leaves the live board exactly as it was', async () => {
  const liveBoard = await live();
  const { store, queries } = fakeStore({ read: { match: storedClips(), delayMs: 5_000 } });
  const board = await getHighlightsBoardForRender({ store, budgetMs: 20 });
  assert.equal(board.provenance, 'live');
  assert.deepEqual(board.clips, liveBoard.clips, 'not one stored clip leaked in');
  assert.deepEqual(board.games, liveBoard.games);
  assert.equal(queries.length, 1, 'the query was asked, then left running rather than cancelled');
});

test('a store that throws, or reports a failed query, leaves the live board alone', async () => {
  const liveBoard = await live();
  const threw = fakeStore({ read: { throws: true } });
  const first = await getHighlightsBoardForRender({ store: threw.store });
  assert.equal(first.provenance, 'live');
  assert.deepEqual(first.clips, liveBoard.clips);

  const failed = fakeStore({ read: { ok: false } });
  const second = await getHighlightsBoardForRender({ store: failed.store });
  assert.equal(second.provenance, 'live');
  assert.deepEqual(second.clips, liveBoard.clips);
});

test('no database means the homepage behaves exactly as before', async () => {
  const liveBoard = await live();
  const { store, queries } = fakeStore({ available: false, read: { match: storedClips() } });
  const board = await getHighlightsBoardForRender({ store });
  assert.equal(board.provenance, 'live');
  assert.deepEqual(board.clips, liveBoard.clips);
  assert.deepEqual(board.status, liveBoard.status);
  assert.deepEqual(queries, [], 'a store that is not there is not even queried');
});

/* ── What the reader sees ───────────────────────────────────────────────── */

test('a stored board renders as real cards, not sample data, and stays likeable', async () => {
  const board = storedHighlightsBoard(
    [matchClip({ id: '49861382', title: 'Saka opens the scoring' }), matchClip({ id: '49861384', title: 'Vinícius curls it in', eventId: 'espn-ucl-401222222' })],
    'https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/videos?event=401111111',
  );
  assert.equal(board.status, 'live');

  // The feed only dresses cards as samples — and strips their anchor post — when
  // a board is neither live nor partial. Mounting the real component is the only
  // way to be sure a board of stored clips reads as real video.
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  const mounted = await mountBoard({
    basketball: { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } },
    football: { sport: 'football', league: 'nfl', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } },
  });
  const SportsHighlightsFeed = (await import('../../src/components/SportsHighlightsFeed')).default;
  const { createRoot } = await import('react-dom/client');
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(SportsHighlightsFeed as never, { board, engagement: {}, signedIn: false } as never));
    });
    const { document } = mounted;
    const section = document.querySelector('section[aria-label="Match highlights"]')!;
    assert.ok(section.textContent.includes('Highlights from 2 ESPN games'), `saw: ${section.textContent.slice(0, 200)}`);
    assert.ok(!section.textContent.includes('Sample cards'), 'stored clips are not placeholder data');
    assert.equal(document.querySelectorAll('article').length, 2);
    // A sample card gets no anchor, so no Like button: these are real cards.
    assert.ok(findButton(document, 'Like Saka opens the scoring'));
    assert.ok(findButton(document, 'Like Vinícius curls it in'));
  } finally {
    await act(() => root.unmount());
    container.remove();
    await mounted.unmount();
  }
});

/* ── The nudge ──────────────────────────────────────────────────────────── */

test('the nudge starts a pass outside a request scope instead of throwing', async () => {
  resetHighlightsSweep();
  const seen: string[] = [];
  const { store } = fakeStore({ available: false });
  const recording: HighlightsStore = { ...store, available: () => { seen.push('available'); return false; } };

  // No request scope here, so `after` throws and the nudge falls back to the
  // fire-and-forget call it replaced. Either way a pass is launched and the
  // caller is never made to handle one.
  assert.doesNotThrow(() => nudgeHighlightsSweep({ store: recording }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(seen.length > 0, 'a pass was launched, and it asked the store first');
  resetHighlightsSweep();
});
