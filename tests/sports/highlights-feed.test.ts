import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSportsHighlights, seedRecentFinishedEvents, resetRecentFinishedEvents } from '../../src/lib/espn-highlights-feed';
import { getSportsBoard } from '../../src/lib/sports';

async function withFetch(run: () => Promise<void>, respond: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}

/** A scoreboard payload for one league, in the shape the Site API sends. */
const scoreboard = (eventId: string, name: string, state: string) => ({
  events: [{
    id: eventId,
    date: '2026-11-08T18:00:00Z',
    competitions: [{
      status: { type: { state, shortDetail: state === 'in' ? 'Live' : 'Final' } },
      competitors: [
        { homeAway: 'home', team: { displayName: name, abbreviation: name.slice(0, 3).toUpperCase(), logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${eventId}.png` }, score: '2' },
        { homeAway: 'away', team: { displayName: 'Visitors', abbreviation: 'VIS' }, score: '1' },
      ],
    }],
  }],
});

/** A video collection in the shape ESPN's /videos endpoint sends. */
const videoCollection = (clips: unknown[]) => ({ videos: clips });

const clip = (id: string, title: string) => ({
  id: Number(id),
  source: 'espn',
  headline: title,
  description: title,
  duration: 42,
  thumbnail: `https://espnmedia-cdn.akamaized.net/espn/media/common/2026/0907/${id}.jpg`,
  links: {
    source: { href: `https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/0907/${id}.mp4` },
    web: { href: `https://www.espn.com/video/clip/_/id/${id}` },
  },
});

/**
 * The board cache is shared with the page, so seed it once with a known set of
 * fixtures. After that the feed's own board read is free and the only requests
 * left are the game video collections under test.
 *
 * The finished-fixture pool is seeded too: sweeping a week of ESPN scoreboards
 * is a separate test, and leaving the pool cold here would send 121 requests
 * per competition per day through every case below.
 */
async function seedBoard(recent: Parameters<typeof seedRecentFinishedEvents>[0] = []) {
  seedRecentFinishedEvents(recent);
  await withFetch(async () => {
    await getSportsBoard();
  }, async (input) => {
    const url = String(input);
    if (url.includes('/soccer/eng.1/scoreboard')) return Response.json(scoreboard('401111111', 'Arsenal', 'post'));
    if (url.includes('/football/nfl/scoreboard')) return Response.json(scoreboard('401222222', 'Chiefs', 'in'));
    return Response.json({ events: [] });
  });
}

test('highlights come from ESPN video collections and keep their fixture', async () => {
  await seedBoard();
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'live');
    assert.equal(board.games, 2, 'one collection per competition');
    assert.equal(board.clips.length, 2);
    // Live fixtures come first, so the NFL clip leads the board.
    const [nfl, epl] = board.clips;
    assert.equal(epl.title, 'Saka scores');
    assert.equal(epl.mp4, 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/0907/49861382.mp4');
    assert.equal(epl.thumbnail, 'https://espnmedia-cdn.akamaized.net/espn/media/common/2026/0907/49861382.jpg');
    assert.equal(epl.duration, 42);
    assert.equal(epl.playable, true);
    assert.equal(epl.page, 'https://www.espn.com/video/clip/_/id/49861382');
    assert.equal(epl.eventName, 'Arsenal vs Visitors');
    assert.equal(epl.home, 'Arsenal');
    assert.equal(epl.homeLogo, 'https://a.espncdn.com/i/teamlogos/soccer/500/401111111.png');
    assert.equal(epl.status, 'final');
    assert.equal(epl.league, 'epl');
    assert.equal(epl.leagueName, 'Premier League');
    assert.equal(nfl.title, 'Mahomes finds Kelce');
    assert.equal(nfl.status, 'live');
    assert.equal(nfl.league, 'nfl');
    assert.equal(nfl.eventName, 'Chiefs vs Visitors');
    // The board id is namespaced; the video collection wants ESPN's own id.
    assert.ok(urls.some((url) => url.endsWith('/soccer/eng.1/videos?event=401111111')), urls.join(', '));
    assert.ok(urls.some((url) => url.endsWith('/football/nfl/videos?event=401222222')), urls.join(', '));
    // The game summary is not read for highlights: it carries no videos.
    assert.ok(urls.every((url) => !url.includes('/summary?')), urls.join(', '));
    assert.ok(urls.every((url) => new URL(url).hostname === 'site.api.espn.com'));
  }, async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/soccer/eng.1/videos')) return Response.json(videoCollection([clip('49861382', 'Saka scores')]));
    if (url.includes('/football/nfl/videos')) return Response.json(videoCollection([clip('49861383', 'Mahomes finds Kelce')]));
    throw new Error(`unexpected fetch ${url}`);
  });
});

test('a competition with no clips does not count as a game on the board', async () => {
  await seedBoard();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'live');
    assert.equal(board.clips.length, 1);
    // ESPN answers the Premier League collection with an empty list, so the
    // board reports the one game that actually carried a clip.
    assert.equal(board.games, 1);
    assert.equal(board.clips[0].title, 'Mahomes finds Kelce');
  }, async (input) => {
    const url = String(input);
    if (url.includes('/football/nfl/videos')) return Response.json(videoCollection([clip('49861383', 'Mahomes finds Kelce')]));
    return Response.json(videoCollection([]));
  });
});

test('a partial board is reported as partial, not as live', async () => {
  await seedBoard();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'partial');
    assert.equal(board.clips.length, 1);
    assert.equal(board.clips[0].title, 'Saka scores');
  }, async (input) => {
    const url = String(input);
    if (url.includes('/soccer/eng.1/videos')) return Response.json(videoCollection([clip('49861382', 'Saka scores')]));
    throw new Error(`collection failed for ${url}`);
  });
});

test('when ESPN does not answer the board falls back to the bundled sample clips', async () => {
  await seedBoard();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'unavailable');
    assert.equal(board.source.ok, false);
    assert.match(board.source.error!, /site\.api\.espn\.com|failed|timed out|unreachable/i);
    assert.ok(board.clips.length >= 4);
    // No invented ESPN media is served as if it were real.
    assert.ok(board.clips.every((entry) => entry.mp4 === null && entry.hls === null && entry.page === null));
    assert.ok(board.clips.every((entry) => /sample/i.test(entry.description ?? '')));
  }, async (input) => {
    throw new Error(`ESPN unreachable for ${String(input)}`);
  });
});

test('a collection with no videos falls back to the bundled sample clips', async () => {
  await seedBoard();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'unavailable');
    assert.match(board.source.error!, /no highlight videos/i);
    assert.ok(board.clips.length >= 4);
  }, async () => Response.json({ boxscore: {}, plays: [] }));
});

/* ── The finished-fixture pool ───────────────────────────────────────────── */

/** YYYYMMDD for N days ago, the only date form ESPN accepts. */
const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

/** The parsed fixture the sweep is expected to surface, as `getSportsBoard` would. */
const fixture = (id: string, league: string, name: string, daysAgo: number) => ({
  id: `espn-${league}-${id}`,
  source: 'espn' as const,
  sourceId: id,
  // The catalog's slug: the video collection resolves the provider path from it.
  league,
  leagueName: league === 'laliga' ? 'La Liga' : 'Champions League',
  sport: 'football' as const,
  startAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  status: 'final' as const,
  home: { name, short: name.slice(0, 3), logo: null, score: 1 },
  away: { name: 'Visitors', short: 'VIS', logo: null, score: 0 },
  venue: null,
});

test('finished matches from last week reach the board', async () => {
  await seedBoard([fixture('401882814', 'laliga', 'Elche', 1)]);
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    // The seeded pool carries a finished La Liga match the scores board does
    // not know about, and its clips are on the board.
    assert.equal(board.games, 3);
    assert.ok(urls.some((url) => url.endsWith('/soccer/esp.1/videos?event=401882814')), urls.join(', '));
    const laliga = board.clips.find((entry) => entry.league === 'laliga');
    assert.ok(laliga, 'a finished match from last week is on the board');
    assert.equal(laliga!.eventName, 'Elche vs Visitors');
    assert.equal(laliga!.status, 'final');
    assert.equal(laliga!.mp4, 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/0907/49861384.mp4');
    // A fixture already on the scores board is not asked twice.
    assert.equal(urls.filter((url) => url.includes('/soccer/eng.1/videos')).length, 1);
  }, async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/soccer/esp.1/videos')) return Response.json(videoCollection([clip('49861384', 'Riquelme scores')]));
    if (url.includes('/soccer/eng.1/videos')) return Response.json(videoCollection([clip('49861382', 'Saka scores')]));
    if (url.includes('/football/nfl/videos')) return Response.json(videoCollection([clip('49861383', 'Mahomes finds Kelce')]));
    throw new Error(`unexpected fetch ${url}`);
  });
});

test('one video collection per competition, newest pool fixture first', async () => {
  await seedBoard([]);
  // Two finished La Liga matches: only the newest is asked, so the board is not
  // all one competition, and the live board fixture still leads.
  const older = { ...fixture('401000001', 'laliga', 'Elche', 7), startAt: new Date(Date.now() - 7 * 86_400_000).toISOString() };
  const newer = { ...fixture('401000002', 'laliga', 'Valencia', 2), startAt: new Date(Date.now() - 2 * 86_400_000).toISOString() };
  seedRecentFinishedEvents([older, newer]);
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(urls.filter((url) => url.includes('/soccer/esp.1/videos')).length, 1);
    assert.ok(urls.some((url) => url.endsWith('/soccer/esp.1/videos?event=401000002')), urls.join(', '));
    assert.equal(board.clips[0].league, 'nfl', 'the live board fixture leads');
  }, async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/soccer/esp.1/videos')) return Response.json(videoCollection([clip('49861385', 'Valencia goal')]));
    if (url.includes('/soccer/eng.1/videos')) return Response.json(videoCollection([clip('49861382', 'Saka scores')]));
    if (url.includes('/football/nfl/videos')) return Response.json(videoCollection([clip('49861383', 'Mahomes finds Kelce')]));
    throw new Error(`unexpected fetch ${url}`);
  });
});

test('the sweep reads one scoreboard per competition per day, finished only', async () => {
  resetRecentFinishedEvents();
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'unavailable', 'every collection answered with no clips');
    // Two board fixtures plus the finished La Liga match the sweep found.
    assert.equal(board.games, 3);
  }, async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/videos?event=')) return Response.json(videoCollection([]));
    // The day before yesterday: a finished La Liga match and an upcoming NBA one.
    const date = new URL(url).searchParams.get('dates')!;
    if (url.includes('/soccer/esp.1/scoreboard') && date === day(2)) {
      return Response.json(scoreboard('401882814', 'Elche', 'post'));
    }
    if (url.includes('/basketball/nba/scoreboard') && date === day(2)) {
      return Response.json(scoreboard('401909886', 'Lakers', 'pre'));
    }
    return Response.json({ events: [] });
  });
  // ESPN accepts a single date per scoreboard, so a week of fixtures costs one
  // request per competition per day; there is no league-wide clip listing.
  assert.ok(urls.length > 200, `expected a full sweep, saw ${urls.length} requests`);
  const scoreboards = urls.filter((url) => url.includes('/scoreboard'));
  assert.ok(scoreboards.length > 200, `expected a full sweep, saw ${scoreboards.length} scoreboards`);
  assert.ok(scoreboards.every((url) => /dates=\d{8}/.test(url)), scoreboards[0]);
  assert.ok(scoreboards.every((url) => !/\d{8}-\d{8}/.test(url)), 'a date range is a 400');
  assert.ok(urls.some((url) => url.endsWith('/soccer/esp.1/videos?event=401882814')), urls.join(', '));
  // An upcoming fixture is not part of the pool: only a finished match carries
  // its full-match highlights.
  assert.equal(urls.filter((url) => url.includes('/basketball/nba/videos')).length, 0, urls.join(', '));
});

test('a day already remembered is not asked for again', async () => {
  await seedBoard([]);
  // Yesterday is remembered but the pool has gone stale, so this render looks
  // further back instead of asking for the same day twice.
  seedRecentFinishedEvents([fixture('401882814', 'laliga', 'Elche', 1)], 16 * 60_000);
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.games, 3, 'the board fixtures plus both remembered days');
    const laliga = board.clips.find((entry) => entry.league === 'laliga');
    assert.ok(laliga, 'a finished match from the week is on the board');
  }, async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/videos?event=')) return Response.json(videoCollection([clip('49861384', 'Riquelme scores')]));
    // The day before yesterday: a finished La Liga match.
    if (url.includes('/soccer/esp.1/scoreboard') && new URL(url).searchParams.get('dates') === day(2)) {
      return Response.json(scoreboard('401882814', 'Elche', 'post'));
    }
    return Response.json({ events: [] });
  });
  const scoreboards = urls.filter((url) => url.includes('/scoreboard'));
  assert.ok(scoreboards.length > 100, `expected a sweep, saw ${scoreboards.length} requests`);
  assert.ok(!scoreboards.some((url) => url.includes(`dates=${day(1)}`)), 'yesterday was asked again');
  assert.ok(scoreboards.some((url) => url.includes(`dates=${day(2)}`)), 'the sweep went further back');
});

test('a sweep that gets no answer does not hold the render', async () => {
  await seedBoard([]);
  resetRecentFinishedEvents();
  const started = Date.now();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    // The render is served from the scores board while the sweep is still
    // asking, so a silent ESPN costs history rather than the page.
    assert.equal(board.clips.length, 2);
    assert.equal(board.clips[0].league, 'nfl');
    const waited = Date.now() - started;
    assert.ok(waited > 3_000, `the sweep was abandoned too early: ${waited}ms`);
    assert.ok(waited < 6_000, `the render waited ${waited}ms for the sweep`);
  }, async (input, init) => {
    const url = String(input);
    if (url.includes('/videos?event=')) return Response.json(videoCollection([clip('49861382', 'Saka scores')]));
    // ESPN never answers, and honours the deadline the sweep gives it. The
    // timeout is a real timer so the render's wait is the deadline, not luck.
    return new Promise<Response>((_resolve, reject) => {
      // A real fetch rejects an already-aborted signal at once.
      if (init?.signal?.aborted) reject(new DOMException('aborted', 'AbortError'));
      else init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      setTimeout(() => reject(new Error('the sweep outlived its deadline')), 20_000);
    });
  });
});

test('a sweep that gets nowhere still renders the scores board', async () => {
  await seedBoard([]);
  resetRecentFinishedEvents();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.clips.length, 2);
    assert.equal(board.clips[0].league, 'nfl');
  }, async (input) => {
    const url = String(input);
    if (url.includes('/videos?event=')) return Response.json(videoCollection([clip('49861382', 'Saka scores')]));
    // Every scoreboard the sweep asks for is down.
    throw new Error(`scoreboard unreachable ${url}`);
  });
});
