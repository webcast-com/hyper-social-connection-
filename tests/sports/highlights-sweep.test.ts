import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELLS_PER_PASS, GAMES_PER_PASS, LEAGUE_GAMES_MAX, MEDIA_WARM_PER_PASS, REPROBE_EMPTY_AFTER_MS,
  candidateGames, cellPlan, espnDate, resetHighlightsSweep, runHighlightsSweep,
} from '../../src/lib/highlights-sweep';
import {
  leagueRow, matchRow, probeKey, sweepCellKey,
  type HighlightsStore, type NewsClipRef, type StoredClip,
} from '../../src/lib/highlights-index';
import { mediaProbeKey, resetVideoNewsCaches } from '../../src/lib/espn-video-news-feed';
import type { SportsVideoNewsMedia } from '../../src/lib/espn-video-news';
import type { SportsEvent } from '../../src/lib/sports';

/**
 * The bounded sweeper that fills the stored highlights index.
 *
 * What is under test is the bound, not the parsing: the parsers have their own
 * suites. A pass must ask at most its slice of scoreboards and its slice of game
 * collections, must never ask for a game whose clips are already stored, must
 * record what it asked so the next pass continues instead of restarting, must
 * survive one competition refusing, and must never ask upstream for anything when
 * there is nowhere to store the answer.
 *
 * The store is injected, so none of this needs a database; `fetch` is stubbed, so
 * none of it needs ESPN.
 */

/** A scoreboard payload for one league, in the shape the Site API sends. */
const scoreboard = (eventId: string, name: string, state: string) => ({
  events: [{
    id: eventId,
    date: '2026-11-08T18:00:00Z',
    competitions: [{
      status: { type: { state, shortDetail: state === 'in' ? 'Live' : state === 'pre' ? 'Scheduled' : 'Final' } },
      competitors: [
        { homeAway: 'home', team: { displayName: name, abbreviation: name.slice(0, 3).toUpperCase(), logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${eventId}.png` }, score: '2' },
        { homeAway: 'away', team: { displayName: 'Visitors', abbreviation: 'VIS' }, score: '1' },
      ],
    }],
  }],
});

/** A video collection, in the shape ESPN's `/videos` endpoint sends. */
const collection = (id: string, title: string) => ({
  videos: [{
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
  }],
});

/** One league video news article: a clip with no fixture behind it. */
const newsArticle = (id: number) => ({
  id,
  type: 'Media',
  headline: 'Saka curls Arsenal ahead at Brighton',
  description: 'A first-time finish from the edge of the box.',
  published: '2026-11-08T18:05:00Z',
  images: [{ url: `https://a.espncdn.com/photo/${id}.jpg` }],
  links: {
    web: { href: `https://www.espn.com/video/clip/_/id/${id}/brighton-arsenal` },
    api: { self: { href: `https://content.core.api.espn.com/v1/video/clips/${id}` } },
  },
  categories: [
    { type: 'league', league: { description: 'English Premier League' } },
    { type: 'team', team: { shortDisplayName: 'Arsenal' } },
    { type: 'team', team: { shortDisplayName: 'Brighton' } },
  ],
});

type Fake = HighlightsStore & {
  written: StoredClip[];
  probes: { key: string; clips: number }[];
  cells: { key: string; games: number; clips: number }[];
  reprobeAfter: number[];
  /** The limits each pre-warm asked for, so the ceiling is asserted not assumed. */
  needingLimits: number[];
  /** Renditions written back, by clip id. */
  media: { clipId: string; mp4: string | null; hls: string | null }[];
};

/**
 * A store that remembers what the sweeper did to it.
 *
 * `probed` seeds the history the real table would carry: a key with a clip count
 * above zero is a collection that already answered, so it must never be asked
 * again; one at zero was asked and found empty, and is askable again only once it
 * is older than the reprobe window.
 */
function fakeStore(options: {
  available?: boolean;
  probed?: Map<string, number>;
  probedAge?: number;
  fresh?: string[];
  /** Stored league rows with no rendition yet, which a pass may pre-warm. */
  needing?: NewsClipRef[];
  /** Renditions already stored, by clip id. */
  storedMedia?: Map<string, SportsVideoNewsMedia>;
} = {}): Fake {
  const written: StoredClip[] = [];
  const probes: { key: string; clips: number }[] = [];
  const cells: { key: string; games: number; clips: number }[] = [];
  const reprobeAfter: number[] = [];
  const needingLimits: number[] = [];
  const media: { clipId: string; mp4: string | null; hls: string | null }[] = [];
  const probed = options.probed ?? new Map<string, number>();
  const probedAt = Date.now() - (options.probedAge ?? 0);
  const fresh = new Set(options.fresh ?? []);
  const needing = options.needing ?? [];
  const storedMedia = options.storedMedia ?? new Map<string, SportsVideoNewsMedia>();

  const summary = async () => ({
    ok: true, clips: written.length, matchClips: written.filter((clip) => clip.kind === 'match').length,
    leagueClips: written.filter((clip) => clip.kind === 'league').length, competitions: 0,
    oldestAt: null, newestAt: null, lastSweepAt: new Date().toISOString(), sweptCells: cells.length,
  });

  return {
    written, probes, cells, reprobeAfter, needingLimits, media,
    available: () => options.available ?? true,
    summary,
    read: async () => ({ ok: true, match: [], league: [], remaining: 0, byLeague: [], byStatus: [], summary: await summary() }),
    store: async (clips) => { written.push(...clips); return clips.length; },
    probeable: async (keys, reprobeEmptyAfterMs) => {
      reprobeAfter.push(reprobeEmptyAfterMs);
      return new Set(keys.filter((key) => {
        const found = probed.get(key);
        if (found === undefined) return true;
        // A collection that answered with clips is stored permanently; an empty
        // one is worth asking again once ESPN has had time to publish.
        return found === 0 && probedAt <= Date.now() - reprobeEmptyAfterMs;
      }));
    },
    recordProbes: async (entries) => { probes.push(...entries); for (const entry of entries) probed.set(entry.key, entry.clips); },
    freshCells: async (keys) => new Set(keys.filter((key) => fresh.has(key))),
    recordCells: async (entries) => { cells.push(...entries); },
    findNewsMedia: async (clipId) => storedMedia.get(clipId) ?? null,
    storeNewsMedia: async (clipId, resolved) => {
      // The real write refuses a rendition that cannot play, and reports the rows
      // it updated — a probe is only recorded when something was stored.
      if (!resolved || (!resolved.mp4 && !resolved.hls)) return 0;
      media.push({ clipId, mp4: resolved.mp4, hls: resolved.hls });
      storedMedia.set(clipId, resolved);
      return 1;
    },
    // A row stops appearing here the moment its rendition is stored, which is what
    // makes the pre-warm converge instead of repeating the same clips each pass.
    newsClipsNeedingMedia: async (limit) => {
      needingLimits.push(limit);
      return needing.filter((row) => !storedMedia.has(row.clipId)).slice(0, Math.max(1, limit));
    },
  };
}

type Responder = (url: string) => Response;

async function withFetch(run: () => Promise<void>, respond: Responder): Promise<string[]> {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: unknown) => {
    const url = String(input);
    urls.push(url);
    return Promise.resolve(respond(url));
  }) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
  return urls;
}

/** A distinct event id per scoreboard date: a week of cells is a week of games. */
const eventIdFor = (url: string) => `4011${url.match(/dates=(\d{8})/)?.[1] ?? '00000000'}`;

const scoreboards = (urls: string[]) => urls.filter((url) => url.includes('/scoreboard'));
const collections = (urls: string[]) => urls.filter((url) => url.includes('/videos?event='));
const news = (urls: string[]) => urls.filter((url) => url.includes('/news?'));
const mediaRecords = (urls: string[]) => urls.filter((url) => url.includes('/v1/video/clips/'));

/** Stored league rows with no rendition yet, which a pass may pre-warm. */
const needingMedia = (count: number, from = 49900001): NewsClipRef[] =>
  Array.from({ length: count }, (_, index) => ({
    clipId: String(from + index),
    externalKey: `league:espn-video-epl-${from + index}`,
  }));

/**
 * Answers the league listing with one clip and every clip-record request with a
 * playable rendition, so a pre-warm has something to resolve.
 */
function answerMedia(status = 200): Responder {
  return (url) => {
    if (url.includes('/v1/video/clips/')) {
      const id = url.split('/').pop() ?? '0';
      return status === 200
        ? Response.json({ links: { source: { href: `https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1108/${id}_3600k.mp4` } }, duration: 62 })
        : new Response('geofenced', { status });
    }
    if (url.includes('/news?')) {
      return url.includes('/soccer/eng.1/news') ? Response.json({ articles: [newsArticle(49983806)] }) : Response.json({ articles: [] });
    }
    if (url.includes('/videos?event=')) return Response.json({ videos: [] });
    return Response.json(scoreboard(eventIdFor(url), 'Arsenal', 'post'));
  };
}

/**
 * One finished game per competition, each with its own event id, so a pass has
 * something to ask everywhere it looks.
 */
function answerEverything(state = 'post'): Responder {
  const ids = new Map<string, number>();
  return (url) => {
    if (url.includes('/news?')) return Response.json({ articles: [] });
    const path = url.match(/\/sports\/([^/]+\/[^/?]+)\//)?.[1] ?? url;
    if (url.includes('/videos?event=')) {
      const event = url.match(/event=(\d+)/)?.[1] ?? '0';
      return Response.json(collection(`49${event.slice(-6)}`, `Highlights ${event}`));
    }
    const next = (ids.get(path) ?? 401100000) + 1;
    ids.set(path, next);
    return Response.json(scoreboard(String(next), 'Arsenal', state));
  };
}

test('the plan walks today across every competition before yesterday anywhere', () => {
  const now = Date.parse('2026-11-10T12:00:00.000Z');
  const plan = cellPlan(null, 2, now);
  // 121 competitions, two days: day-major, so the first 121 cells are all today.
  assert.equal(plan.length, 242);
  assert.equal(plan[0].date, '20261110');
  assert.equal(plan[120].date, '20261110');
  assert.equal(plan[121].date, '20261109');
  assert.equal(plan[0].key, sweepCellKey(plan[0].meta.slug, '20261110'));
  assert.equal(new Set(plan.map((cell) => cell.meta.slug)).size, 121, 'every configured competition is in the plan');

  const one = cellPlan('epl', 7, now);
  assert.equal(one.length, 7, 'a named competition is a week of its own scoreboards');
  assert.ok(one.every((cell) => cell.meta.slug === 'epl'));
  assert.deepEqual(cellPlan('not-a-league', 7, now), [], 'an unknown competition plans nothing rather than guessing');
  assert.equal(cellPlan(null, 9999, now).length / 121, 30, 'a huge window is clamped, not honoured');
  assert.equal(espnDate(now), '20261110');
});

test('only a live or finished game with a provider id is a candidate, live first', () => {
  const event = (over: Partial<SportsEvent>): SportsEvent => ({
    id: 'espn-epl-1', source: 'espn', sourceId: '401111111', sport: 'football', league: 'epl',
    leagueName: 'Premier League', status: 'final', startAt: '2026-11-08T18:00:00.000Z',
    home: { name: 'Arsenal' }, away: { name: 'Chelsea' }, ...over,
  } as SportsEvent);

  const chosen = candidateGames([
    event({ id: 'a', sourceId: '1', status: 'upcoming', startAt: '2026-11-20T20:00:00.000Z' }),
    event({ id: 'b', sourceId: '2', status: 'final', startAt: '2026-11-01T20:00:00.000Z' }),
    event({ id: 'c', sourceId: '3', status: 'live', startAt: '2026-11-08T20:00:00.000Z' }),
    event({ id: 'd', sourceId: '4', status: 'final', startAt: '2026-11-07T20:00:00.000Z' }),
    event({ id: 'e', sourceId: null, status: 'final' }),
    event({ id: 'f', sourceId: 'not-numeric', status: 'final' }),
    event({ id: 'c-duplicate', sourceId: '3', status: 'live' }),
  ]);

  assert.deepEqual(chosen.map((candidate) => candidate.id), ['c', 'd', 'b'],
    'live before finished, newest first, and an upcoming fixture or an unaddressable one is never asked');
  assert.deepEqual(chosen.map((candidate) => probeKey(candidate)), ['probe:epl:3', 'probe:epl:4', 'probe:epl:2']);
  assert.deepEqual(candidateGames([]), []);
});

test('with no database a pass asks ESPN for nothing at all', async () => {
  resetHighlightsSweep();
  const store = fakeStore({ available: false });
  const urls = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store });
    assert.equal(pass.ok, false);
    assert.equal(pass.reason, 'no-database', 'there is nowhere to put a clip, so none is fetched');
    assert.equal(pass.requests, 0);
    assert.equal(pass.summary.ok, false);
  }, answerEverything());
  assert.deepEqual(urls, []);
  assert.deepEqual(store.written, []);
});

test('one pass is bounded: a slice of scoreboards, a slice of collections', async () => {
  resetHighlightsSweep();
  const store = fakeStore();
  const urls = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store });
    assert.equal(pass.ok, true);
    assert.equal(pass.cells, CELLS_PER_PASS, 'the catalog is 847 cells; a pass walks 24 of them');
    assert.equal(pass.games, GAMES_PER_PASS);
    assert.equal(pass.truncated, true, 'and says so: coverage is behind by design');
    assert.equal(pass.clips, GAMES_PER_PASS, 'one clip stored per game asked');
    assert.equal(store.written.length, GAMES_PER_PASS);
    assert.ok(store.written.every((stored) => stored.kind === 'match'));
    // Every stored clip carries the collection it came from, so a card can be
    // honest about where its media was read.
    assert.ok(store.written.every((stored) => !!stored.sourceUrl && stored.sourceUrl.includes('/videos?event=')));
    const first = store.written[0];
    if (first.kind !== 'match') throw new Error('a swept clip is a match clip');
    const row = matchRow(first);
    assert.equal(row?.status, 'final', 'the state ESPN reported travels with the clip');
    assert.equal(row?.playable, true);
    assert.ok(row?.anchor_key, 'a stored match clip can be found again by its anchor id');
    assert.ok(row?.event_id, 'and keeps the fixture it belongs to');
  }, answerEverything());

  assert.equal(scoreboards(urls).length, CELLS_PER_PASS, 'one scoreboard per cell, and no more');
  assert.equal(collections(urls).length, GAMES_PER_PASS, 'one collection per game, and no more');
  assert.equal(news(urls).length, 12, 'the league video fan-out is the existing twelve competitions');
  assert.equal(store.cells.length, CELLS_PER_PASS, 'every walked cell is recorded, so the next pass continues');
  assert.equal(store.probes.length, GAMES_PER_PASS, 'every collection asked is recorded');
  assert.ok(store.probes.every((probe) => probe.clips === 1));
  assert.deepEqual(store.reprobeAfter, [REPROBE_EMPTY_AFTER_MS], 'the reprobe window is the sweeper’s own constant');
});

test('a collection that already answered is never asked again', async () => {
  resetHighlightsSweep();
  const probed = new Map<string, number>();
  // Seed history for the first three cells' games, as an earlier pass would have.
  const plan = cellPlan(null, 1, Date.now()).slice(0, 3);
  const store = fakeStore({ probed });
  // The stub gives each competition its own event id, in plan order, so the keys
  // the sweeper will compute can be seeded exactly.
  let counter = 401100000;
  const ids = new Map<string, number>();
  const keys: string[] = [];
  for (const cell of plan) {
    counter += 1;
    keys.push(`probe:${cell.meta.slug}:${counter}`);
    ids.set(`${cell.meta.sport}/${cell.meta.league}`, counter);
  }
  for (const key of keys) probed.set(key, 3);

  const urls = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store });
    assert.equal(pass.ok, true);
    assert.equal(pass.cells, CELLS_PER_PASS);
    assert.equal(pass.games, GAMES_PER_PASS - keys.length, 'three games were already stored, so three fewer were asked');
    assert.ok(!store.probes.some((probe) => keys.includes(probe.key)), 'and they are not re-recorded');
  }, (url) => {
    if (url.includes('/news?')) return Response.json({ articles: [] });
    if (url.includes('/videos?event=')) {
      const event = url.match(/event=(\d+)/)?.[1] ?? '0';
      return Response.json(collection(`49${event.slice(-6)}`, `Highlights ${event}`));
    }
    const path = url.match(/\/sports\/([^/]+\/[^/?]+)\//)?.[1] ?? url;
    const next = ids.get(path) ?? 0;
    if (next) { ids.delete(path); return Response.json(scoreboard(String(next), 'Arsenal', 'post')); }
    const fresh = (counter += 1);
    return Response.json(scoreboard(String(fresh), 'Arsenal', 'post'));
  });
  assert.equal(collections(urls).length, GAMES_PER_PASS - keys.length);
});

test('an empty collection is recorded as asked, so the next pass skips it', async () => {
  resetHighlightsSweep();
  const store = fakeStore();
  await withFetch(async () => {
    const pass = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(pass.ok, true);
    assert.equal(pass.games, 7, 'a named competition walks its whole week');
    assert.equal(pass.clips, 0, 'ESPN published nothing for these games');
    assert.equal(store.written.length, 0, 'and nothing is invented to fill the gap');
    assert.equal(store.probes.length, 7);
    assert.ok(store.probes.every((probe) => probe.clips === 0), 'an empty answer is still recorded');
    assert.equal(store.cells.length, 7, 'a cell with no clips is still walked, so the cursor advances');
  }, (url) => {
    if (url.includes('/news?')) return Response.json({ articles: [] });
    if (url.includes('/videos?event=')) return Response.json({ videos: [] });
    return Response.json(scoreboard(eventIdFor(url), 'Arsenal', 'post'));
  });

  // Asked again the same day, the store says those collections are not askable.
  resetHighlightsSweep();
  const again = fakeStore({ probed: new Map(store.probes.map((probe) => [probe.key, probe.clips])) });
  await withFetch(async () => {
    const pass = await runHighlightsSweep({ store: again, league: 'epl' });
    assert.equal(pass.games, 0, 'nothing is asked twice inside the reprobe window');
    assert.equal(pass.clips, 0);
  }, (url) => {
    if (url.includes('/news?')) return Response.json({ articles: [] });
    if (url.includes('/videos?event=')) return Response.json({ videos: [] });
    return Response.json(scoreboard(eventIdFor(url), 'Arsenal', 'post'));
  });

  // Once the empty answer is old enough, the same collection is worth one more
  // look: ESPN publishes highlights hours after full time.
  resetHighlightsSweep();
  const later = fakeStore({
    probed: new Map(store.probes.map((probe) => [probe.key, probe.clips])),
    probedAge: REPROBE_EMPTY_AFTER_MS + 60_000,
  });
  await withFetch(async () => {
    const pass = await runHighlightsSweep({ store: later, league: 'epl' });
    assert.equal(pass.games, 7, 'an empty answer from yesterday is asked again');
  }, (url) => {
    if (url.includes('/news?')) return Response.json({ articles: [] });
    if (url.includes('/videos?event=')) return Response.json({ videos: [] });
    return Response.json(scoreboard(eventIdFor(url), 'Arsenal', 'post'));
  });
});

test('an upcoming fixture is never asked, and a refused competition does not lose the pass', async () => {
  resetHighlightsSweep();
  const store = fakeStore();
  const urls = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(pass.ok, true);
    assert.equal(pass.cells, 7);
    assert.equal(pass.games, 6, 'six finished days and one day of fixtures still to play');
    assert.equal(store.cells.length, 7, 'the day with nothing to ask is still recorded as walked');
    assert.ok(store.cells.some((cell) => cell.games === 0 && cell.clips === 0));
  }, (url) => {
    if (url.includes('/news?')) return Response.json({ articles: [] });
    if (url.includes('/videos?event=')) return Response.json(collection('49861382', 'Full match highlights'));
    // Today's scoreboard is all fixtures still to play.
    if (url.includes(`dates=${espnDate(Date.now())}`)) return Response.json(scoreboard(eventIdFor(url), 'Arsenal', 'pre'));
    return Response.json(scoreboard(eventIdFor(url), 'Arsenal', 'post'));
  });
  assert.ok(!collections(urls).some((url) => url.includes('event=401999999')), 'no request for a game that has not been played');

  resetHighlightsSweep();
  const refused = fakeStore();
  await withFetch(async () => {
    const pass = await runHighlightsSweep({ store: refused, league: 'epl' });
    assert.equal(pass.ok, true, 'one refusal is not a failed pass');
    assert.equal(pass.cells, 6, 'the refused day is not recorded as walked, so it is retried');
    assert.equal(refused.cells.length, 6);
    assert.equal(pass.games, 6);
    assert.equal(pass.clips, 6);
  }, (url) => {
    if (url.includes('/news?')) return Response.json({ articles: [] });
    if (url.includes('/videos?event=')) return Response.json(collection('49861382', 'Full match highlights'));
    if (url.includes(`dates=${espnDate(Date.now() - 86_400_000)}`)) return new Response('denied', { status: 403 });
    return Response.json(scoreboard(eventIdFor(url), 'Arsenal', 'post'));
  });
});

test('a named competition is walked completely, ignoring the cell cursor', async () => {
  resetHighlightsSweep();
  const plan = cellPlan('epl', 7, Date.now()).map((cell) => cell.key);
  const store = fakeStore({ fresh: plan, probed: new Map() });
  await withFetch(async () => {
    const pass = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(pass.cells, 7, 'every cell was walked recently, and the reader asked anyway');
    assert.equal(pass.games, Math.min(7, LEAGUE_GAMES_MAX));
    assert.equal(pass.truncated, false, 'a competition walked end to end is not behind');
  }, answerEverything());

  resetHighlightsSweep();
  const unknown = fakeStore();
  const pass = await runHighlightsSweep({ store: unknown, league: 'not-a-league' });
  assert.equal(pass.ok, false);
  assert.equal(pass.reason, 'unknown-competition');
  assert.deepEqual(unknown.cells, [], 'nothing is recorded for a competition this site does not cover');
});

test('league video news is stored as league clips, with no fixture attached', async () => {
  resetHighlightsSweep();
  const store = fakeStore();
  await withFetch(async () => {
    const pass = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(pass.leagueClips, 1);
    const stored = store.written.filter((clip) => clip.kind === 'league');
    assert.equal(stored.length, 1);
    const leagueStored = stored[0];
    if (leagueStored.kind !== 'league') throw new Error('expected a league clip');
    const row = leagueRow(leagueStored);
    assert.equal(row?.kind, 'league');
    assert.equal(row?.league, 'epl');
    assert.equal(row?.event_id, null, 'a league clip has no fixture');
    assert.equal(row?.home, null);
    assert.equal(row?.away, null);
    assert.equal(row?.status, null, 'and no match state, so it is never offered under Live');
    assert.equal(row?.playable, false, 'its rendition is resolved when a reader presses play');
    assert.equal(row?.anchor_key, null, 'a league clip gets no anchor post');
    assert.deepEqual(JSON.parse(row?.teams ?? '[]'), ['Arsenal', 'Brighton'], 'only the labels ESPN reported');
  }, (url) => {
    if (url.includes('/news?')) return url.includes('/soccer/eng.1/news') ? Response.json({ articles: [newsArticle(49983806)] }) : Response.json({ articles: [] });
    if (url.includes('/videos?event=')) return Response.json({ videos: [] });
    return Response.json(scoreboard(eventIdFor(url), 'Arsenal', 'post'));
  });
});

test('a pass pre-warms a bounded few renditions, and counts every request it makes', async () => {
  resetHighlightsSweep();
  resetVideoNewsCaches();
  // Twenty stored league clips have no rendition; the ceiling says six may be
  // resolved per pass, and the rest wait for the next one.
  const store = fakeStore({ needing: needingMedia(20) });
  let pass: Awaited<ReturnType<typeof runHighlightsSweep>> | null = null;
  const urls = await withFetch(async () => {
    pass = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(pass.ok, true);
    assert.equal(pass.leagueClips, 1, 'the listing is stored exactly as before');
    assert.equal(pass.mediaWarmed, MEDIA_WARM_PER_PASS, 'six renditions resolved and written onto their rows');
    assert.deepEqual(store.needingLimits, [MEDIA_WARM_PER_PASS], 'the ceiling is asked for, not assumed');
    assert.equal(store.media.length, MEDIA_WARM_PER_PASS, 'each written back beside its clip');
    assert.deepEqual(store.media.map((entry) => entry.clipId), needingMedia(MEDIA_WARM_PER_PASS).map((row) => row.clipId), 'newest first, in the order the store returned');
  }, answerMedia());

  const asked = mediaRecords(urls);
  assert.equal(asked.length, MEDIA_WARM_PER_PASS, 'six clip-record requests for twenty clips that need one');
  assert.equal(pass!.requests, scoreboards(urls).length + collections(urls).length + news(urls).length + asked.length,
    'the report counts exactly the requests made, pre-warm included');
  // Each resolved rendition is remembered as answered, so nothing asks twice.
  const mediaProbes = store.probes.filter((entry) => entry.key.startsWith('media:'));
  assert.equal(mediaProbes.length, MEDIA_WARM_PER_PASS);
  assert.deepEqual(mediaProbes.map((entry) => entry.clips), Array.from({ length: MEDIA_WARM_PER_PASS }, () => 1));
  resetVideoNewsCaches();
});

test('a clip that already refused a rendition is not asked again until the window passes', async () => {
  resetHighlightsSweep();
  resetVideoNewsCaches();
  // The first clip said no an hour ago; the second has never been asked.
  const refused = mediaProbeKey('49900001');
  const store = fakeStore({ needing: needingMedia(2), probed: new Map([[refused, 0]]), probedAge: 60 * 60_000 });
  const urls = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(pass.mediaWarmed, 1, 'only the clip that has not refused is resolved');
  }, answerMedia());
  assert.deepEqual(mediaRecords(urls).map((url) => url.split('/').pop()), ['49900002'],
    'a geofenced rendition must not eat the budget on every pass');

  // The same rule the collection probe uses: after 24 h a refusal is worth one
  // more attempt, because ESPN may have lifted it.
  resetHighlightsSweep();
  resetVideoNewsCaches();
  const aged = fakeStore({ needing: needingMedia(2), probed: new Map([[refused, 0]]), probedAge: 25 * 60 * 60_000 });
  const later = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store: aged, league: 'epl' });
    assert.equal(pass.mediaWarmed, 2);
  }, answerMedia());
  assert.equal(mediaRecords(later).length, 2, 'both asked once the window has passed');
  resetVideoNewsCaches();
});

test('the pre-warm converges: a rendition once stored is never resolved again', async () => {
  resetHighlightsSweep();
  resetVideoNewsCaches();
  const store = fakeStore({ needing: needingMedia(2) });
  await withFetch(async () => {
    const first = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(first.mediaWarmed, 2);
  }, answerMedia());

  // A deploy, or simply the next pass: the in-memory cache is gone and the news
  // window has reopened, so this is the moment the old design would ask again.
  resetHighlightsSweep();
  resetVideoNewsCaches();
  const second = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(pass.mediaWarmed, 0, 'both rows already carry a rendition');
  }, answerMedia());
  assert.deepEqual(mediaRecords(second), [], 'no clip-record request at all');
  assert.equal(store.media.length, 2, 'and nothing was written twice');
  resetVideoNewsCaches();
});

test('a rendition ESPN refuses does not fail the pass, and is not counted as warmed', async () => {
  resetHighlightsSweep();
  resetVideoNewsCaches();
  const store = fakeStore({ needing: needingMedia(2) });
  const urls = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store, league: 'epl' });
    assert.equal(pass.ok, true, 'a refusal upstream is an answer, not a failure');
    assert.equal(pass.mediaWarmed, 0);
    assert.equal(pass.leagueClips, 1, 'the listing itself is still stored');
  }, answerMedia(403));
  assert.equal(mediaRecords(urls).length, 2, 'both were asked, and both are counted in the report');
  assert.deepEqual(store.media, [], 'a rendition that cannot play is stored nowhere');
  const probes = store.probes.filter((entry) => entry.key.startsWith('media:'));
  assert.deepEqual(probes.map((entry) => [entry.key, entry.clips]), [[mediaProbeKey('49900001'), 0], [mediaProbeKey('49900002'), 0]],
    'recorded as refused, so the next pass skips them for 24 h');
  resetVideoNewsCaches();
});

test('with nowhere to store a rendition, a pass asks for none', async () => {
  resetHighlightsSweep();
  resetVideoNewsCaches();
  const store = fakeStore({ available: false, needing: needingMedia(6) });
  const urls = await withFetch(async () => {
    const pass = await runHighlightsSweep({ store });
    assert.equal(pass.ok, false);
    assert.equal(pass.reason, 'no-database');
    assert.equal(pass.mediaWarmed, 0);
    assert.equal(pass.requests, 0);
  }, answerMedia());
  assert.deepEqual(urls, []);
  resetVideoNewsCaches();
});

test('a pass is rate-limited, and the limit applies after a failure too', async () => {
  resetHighlightsSweep();
  const store = fakeStore();
  const start = Date.now();
  const clock = { at: start };
  const now = () => clock.at;

  const urls = await withFetch(async () => {
    const first = await runHighlightsSweep({ store, now });
    assert.equal(first.ok, true);
    assert.ok(first.requests > 0);

    const second = await runHighlightsSweep({ store, now });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'rate-limited', 'a page load a second later does not start a second fan-out');
    assert.equal(second.requests, 0);

    const forced = await runHighlightsSweep({ store, now, force: true });
    assert.equal(forced.reason, 'rate-limited', '`force` shortens the interval, it does not remove it');

    clock.at = start + 31_000;
    const later = await runHighlightsSweep({ store, now, force: true });
    assert.equal(later.ok, true, 'an explicit sweep is allowed again after its own interval');

    // A different competition has its own interval.
    clock.at = start + 31_500;
    const league = await runHighlightsSweep({ store, now, league: 'epl', force: true });
    assert.equal(league.ok, true);
  }, answerEverything());

  assert.equal(scoreboards(urls).length, CELLS_PER_PASS * 2 + 7, 'two catalog passes and one competition pass, no more');

  // A pass that finds nothing to do still backs off, so a refused ESPN is not
  // asked again on every page load.
  resetHighlightsSweep();
  const denied = fakeStore();
  clock.at = start;
  await withFetch(async () => {
    const first = await runHighlightsSweep({ store: denied, now });
    assert.equal(first.ok, true);
    assert.equal(first.clips, 0, 'ESPN refused everything');
    const second = await runHighlightsSweep({ store: denied, now });
    assert.equal(second.reason, 'rate-limited');
  }, () => new Response('denied', { status: 403 }));
});

test('concurrent callers share one pass', async () => {
  resetHighlightsSweep();
  const store = fakeStore();
  const urls = await withFetch(async () => {
    const [first, second, third] = await Promise.all([
      runHighlightsSweep({ store }),
      runHighlightsSweep({ store }),
      runHighlightsSweep({ store }),
    ]);
    assert.equal(first, second, 'the in-flight pass is shared, not duplicated');
    assert.equal(second, third);
    assert.equal(first.ok, true);
  }, answerEverything());
  assert.equal(scoreboards(urls).length, CELLS_PER_PASS, 'three callers, one fan-out');
});
