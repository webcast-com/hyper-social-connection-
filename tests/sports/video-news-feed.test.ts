import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  espnLeagueNewsUrl,
  getSportsVideoNews,
  getSportsVideoNewsForRender,
  hasResolvedNewsMedia,
  MAX_FEED_CLIPS,
  mediaProbeKey,
  resolveVideoNewsMedia,
  resetVideoNewsCaches,
  videoNewsLeagues,
} from '../../src/lib/espn-video-news-feed';
import { INDEX_EMPTY, INDEX_UNAVAILABLE, type HighlightsStore } from '../../src/lib/highlights-index';
import type { SportsVideoNewsMedia } from '../../src/lib/espn-video-news';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';

/**
 * The league video news feed: its own fan-out, cache and failure reporting,
 * sharing nothing with the match highlights board.
 *
 * The rule that matters most here is the one a feeds section cannot fake: when
 * ESPN does not answer, the board is empty. There is no bundled sample list to
 * stand in for it, because a made-up goal clip in a member's feed is worse than
 * no card at all.
 */

async function withFetch(run: () => Promise<void>, respond: (input: any) => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = respond as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

const article = (id: number, headline: string, published = '2026-11-08T18:05:00Z') => ({
  id,
  type: 'Video',
  headline,
  published,
  images: [{ url: `https://a.espncdn.com/photo/${id}.jpg` }],
  links: { web: { href: `https://www.espn.com/video/clip/_/id/${id}` } },
  categories: [{ type: 'team', team: { shortDisplayName: 'Arsenal' } }],
});

/** A news response for one league, keyed by the ESPN path it was asked for. */
const newsFeed = (entries: unknown[]) => Response.json({ articles: entries });

test('the feed asks only configured competitions, at URLs built from the catalog', async () => {
  resetVideoNewsCaches();
  const leagues = videoNewsLeagues();
  assert.ok(leagues.length >= 8, `expected a bounded league list, got ${leagues.length}`);
  assert.ok(leagues.length <= 16, 'the fan-out stays bounded');
  // Every slug resolves to a configured competition; none is invented here.
  for (const league of leagues) {
    const meta = ESPN_LEAGUES.find((entry) => entry.slug === league.slug);
    assert.ok(meta, `${league.slug} is configured in the catalog`);
    assert.equal(league.sport, meta!.sport);
    assert.equal(league.league, meta!.league);
    assert.equal(league.name, meta!.name);
  }
  assert.equal(
    espnLeagueNewsUrl({ sport: 'soccer', league: 'eng.1' }),
    'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news?limit=20',
  );
  assert.equal(espnLeagueNewsUrl({ sport: 'soccer', league: '../etc/passwd' }), null);

  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getSportsVideoNews(true);
    assert.equal(board.status, 'live');
    assert.equal(board.clips.length, leagues.length, 'one clip per league that answered');
    assert.equal(board.leagues, leagues.length);
    assert.equal(board.source.ok, true);
  }, (input) => {
    const url = String(input);
    urls.push(url);
    assert.match(url, /^https:\/\/site\.api\.espn\.com\/apis\/site\/v2\/sports\/[a-z-]+\/[a-z0-9.]+\/news\?limit=20$/);
    return newsFeed([article(Number(urls.length) * 1000, `Clip from ${url.split('/sports/')[1].split('/news')[0]}`)]);
  });
  assert.equal(urls.length, leagues.length, 'exactly one request per league');
  resetVideoNewsCaches();
});

test('a league that answers with no videos is a normal answer, not a failure', async () => {
  resetVideoNewsCaches();
  await withFetch(async () => {
    const board = await getSportsVideoNews(true);
    assert.equal(board.status, 'live', 'every league answered');
    assert.equal(board.clips.length, 1);
    assert.equal(board.leagues, 1, 'only the league that published a clip counts');
    assert.equal(board.clips[0].title, 'Real clip');
  }, (input) => {
    const url = String(input);
    // The Premier League collection is the documented empty case.
    if (url.includes('/soccer/eng.1/')) return newsFeed([article(49983806, 'Real clip')]);
    if (url.includes('/soccer/esp.1/')) return newsFeed([{ id: 1, type: 'Headline', headline: 'A text story', links: { web: { href: 'https://www.espn.com/soccer/story/_/id/1' } } }]);
    return newsFeed([]);
  });
  resetVideoNewsCaches();
});

test('some leagues failing is reported as partial, and the rest still show', async () => {
  resetVideoNewsCaches();
  await withFetch(async () => {
    const board = await getSportsVideoNews(true);
    assert.equal(board.status, 'partial');
    assert.equal(board.clips.length, 2);
    assert.equal(board.source.ok, true, 'the board reports a source that answered');
  }, (input) => {
    const url = String(input);
    if (url.includes('/soccer/uefa.champions/')) return newsFeed([article(70000001, 'UCL clip', '2026-11-09T09:00:00Z')]);
    if (url.includes('/basketball/nba/')) return newsFeed([article(60000001, 'NBA clip', '2026-11-08T09:00:00Z')]);
    return Promise.reject(new Error(`ESPN unreachable for ${url}`));
  });
  resetVideoNewsCaches();
});

test('when ESPN does not answer the board is empty — no clips are invented', async () => {
  resetVideoNewsCaches();
  await withFetch(async () => {
    const board = await getSportsVideoNews(true);
    assert.equal(board.status, 'unavailable');
    assert.deepEqual(board.clips, [], 'a feeds section shows nothing rather than a fake clip');
    assert.equal(board.leagues, 0);
    assert.equal(board.source.ok, false);
    assert.ok(board.source.error, 'the failure is reported, not swallowed');
  }, (input) => Promise.reject(new Error(`ESPN unreachable for ${String(input)}`)));

  // An HTTP refusal is the same story, with the status recorded.
  await withFetch(async () => {
    const board = await getSportsVideoNews(true);
    assert.equal(board.status, 'unavailable');
    assert.deepEqual(board.clips, []);
    assert.equal(board.source.httpStatus, 403);
  }, () => new Response('denied', { status: 403 }));
  resetVideoNewsCaches();
});

test('the board is cached, shared across concurrent renders, and bypassed by a refresh', async () => {
  resetVideoNewsCaches();
  let requests = 0;
  const respond = () => {
    requests += 1;
    return newsFeed([article(requests * 1000, `Clip ${requests}`)]);
  };
  await withFetch(async () => {
    const [first, second] = await Promise.all([getSportsVideoNews(), getSportsVideoNews()]);
    assert.equal(first, second, 'concurrent renders share one fan-out');
    const perLeague = videoNewsLeagues().length;
    assert.equal(requests, perLeague, `one request per league, got ${requests}`);

    await getSportsVideoNews();
    assert.equal(requests, perLeague, 'a cached board costs nothing');

    const refreshed = await getSportsVideoNews(true);
    assert.equal(requests, perLeague * 2, 'refresh=1 bypasses the cache');
    assert.notEqual(refreshed.clips[0].title, first.clips[0].title);
  }, respond);
  resetVideoNewsCaches();
});

test('a render is never held up by a cold fan-out', async () => {
  resetVideoNewsCaches();
  let slow = 0;
  await withFetch(async () => {
    // Every league stalls past the render budget.
    const board = await getSportsVideoNewsForRender(40);
    assert.equal(board.status, 'unavailable');
    assert.deepEqual(board.clips, []);
    assert.match(board.source.error ?? '', /did not answer within 40ms/);
    assert.equal(board.source.errorKind, 'timeout');
    // The work is not thrown away: the job keeps running and fills the cache.
    const settled = await getSportsVideoNews();
    assert.equal(settled.clips.length, videoNewsLeagues().length);
    const next = await getSportsVideoNewsForRender(40);
    assert.equal(next.status, 'live', 'the next render is served from the cache');
  }, () => new Promise<Response>((resolve) => {
    // One distinct clip per league, answered only after the render budget.
    const id = 900_000 + slow++;
    setTimeout(() => resolve(newsFeed([article(id, `Slow clip ${id}`)])), 60);
  }));
  resetVideoNewsCaches();
});

test('the feeds section gets a bounded number of clips', () => {
  assert.equal(MAX_FEED_CLIPS, 2);
});

test('a clip\u2019s media is fetched only from ESPN\u2019s clip-record host, and only once', async () => {
  resetVideoNewsCaches();
  const urls: string[] = [];
  await withFetch(async () => {
    const media = await resolveVideoNewsMedia('49983806');
    assert.equal(media.mp4, 'https://espnmedia-cdn.akamaized.net/a/b.mp4');
    assert.equal(media.duration, 47);

    // A hover followed by a play is one request, not two.
    const [again, andAgain] = await Promise.all([resolveVideoNewsMedia('49983806'), resolveVideoNewsMedia('49983806')]);
    assert.deepEqual(again, media);
    assert.deepEqual(andAgain, media);
    assert.equal(urls.length, 1, `one clip-record request, got ${urls.length}`);
  }, (input) => {
    urls.push(String(input));
    return Response.json({ links: { source: { href: 'https://espnmedia-cdn.akamaized.net/a/b.mp4' } }, duration: 47 });
  });
  assert.deepEqual(urls, ['https://content.core.api.espn.com/v1/video/clips/49983806']);

  // Nothing that is not a numeric ESPN clip id reaches the network at all.
  let refused = 0;
  await withFetch(async () => {
    for (const bad of ['', 'abc', '../../etc/passwd', 'https://evil.test/v1/video/clips/1', '1'.repeat(21)]) {
      const media = await resolveVideoNewsMedia(bad);
      assert.deepEqual(media, { mp4: null, hls: null, page: null, thumbnail: null, duration: null });
    }
    assert.equal(refused, 0, 'an invalid id is refused without a request');
  }, () => {
    refused += 1;
    return newsFeed([]);
  });

  // A clip ESPN will not serve is asked again later, not cached as unplayable.
  let attempts = 0;
  await withFetch(async () => {
    const first = await resolveVideoNewsMedia('55555555');
    assert.equal(first.mp4, null);
    const second = await resolveVideoNewsMedia('55555555');
    assert.equal(second.mp4, 'https://espnmedia-cdn.akamaized.net/late.mp4', 'a refusal is not remembered');
    assert.equal(attempts, 2);
  }, () => {
    attempts += 1;
    return attempts === 1
      ? new Response('geofenced', { status: 403 })
      : Response.json({ links: { source: { href: 'https://espnmedia-cdn.akamaized.net/late.mp4' } } });
  });
  resetVideoNewsCaches();
});

/**
 * A store for the rendition path only: it remembers what was looked up, written
 * and probed, and is inert everywhere else. The write mirrors the real one — a
 * rendition that cannot play stores nothing and updates no row.
 */
function mediaStore(seed: Map<string, SportsVideoNewsMedia> = new Map()) {
  const stored = seed;
  const lookups: string[] = [];
  const writes: { clipId: string; media: SportsVideoNewsMedia | null }[] = [];
  const probes: { key: string; clips: number }[] = [];
  const store: HighlightsStore = {
    available: () => true,
    summary: async () => INDEX_UNAVAILABLE,
    read: async () => INDEX_EMPTY,
    store: async () => 0,
    probeable: async (keys) => new Set(keys),
    recordProbes: async (entries) => { probes.push(...entries); },
    freshCells: async () => new Set<string>(),
    recordCells: async () => {},
    findNewsMedia: async (clipId) => { lookups.push(clipId); return stored.get(clipId) ?? null; },
    storeNewsMedia: async (clipId, media) => {
      writes.push({ clipId, media });
      if (!media || (!media.mp4 && !media.hls)) return 0;
      stored.set(clipId, media);
      return 1;
    },
    newsClipsNeedingMedia: async () => [],
  };
  return { store, stored, lookups, writes, probes };
}

const rendition = (over: Partial<SportsVideoNewsMedia> = {}): SportsVideoNewsMedia => ({
  mp4: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1108/49983806_3600k.mp4',
  hls: null,
  page: 'https://www.espn.com/video/clip/_/id/49983806',
  thumbnail: 'https://a.espncdn.com/media/2026/1108/49983806.jpg',
  duration: 94,
  ...over,
});

/** Let the un-awaited write-back and probe land before asserting on them. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a rendition already stored plays without asking ESPN at all', async () => {
  resetVideoNewsCaches();
  const fake = mediaStore(new Map([['49983806', rendition()]]));
  const urls: string[] = [];
  await withFetch(async () => {
    const media = await resolveVideoNewsMedia('49983806', fake.store);
    assert.deepEqual(media, rendition(), 'the stored rendition is the answer');
    assert.equal(fake.lookups.length, 1);
    assert.equal(hasResolvedNewsMedia('49983806'), true, 'and it seeds the in-memory cache, so a sweep counts no request for it');
    // A second reader, and a second deploy, cost nothing either.
    const again = await resolveVideoNewsMedia('49983806', fake.store);
    assert.deepEqual(again, rendition());
  }, async (input) => {
    urls.push(String(input));
    return Response.json({});
  });
  assert.deepEqual(urls, [], 'zero requests: the clip was resolved once, before this reader arrived');
  assert.deepEqual(fake.writes, [], 'nothing to write back for a rendition that was already stored');
  assert.deepEqual(fake.probes, [], 'and nothing to probe: ESPN was not asked');
  resetVideoNewsCaches();
});

test('a rendition resolved for a reader is stored beside the clip, so the next one is free', async () => {
  resetVideoNewsCaches();
  const fake = mediaStore();
  let requests = 0;
  await withFetch(async () => {
    const media = await resolveVideoNewsMedia('49983806', fake.store);
    assert.equal(media.mp4, 'https://espnmedia-cdn.akamaized.net/a/b.mp4');
    await settle();
    assert.equal(fake.writes.length, 1, 'written back onto its row');
    assert.equal(fake.writes[0]!.clipId, '49983806');
    assert.equal(fake.writes[0]!.media?.mp4, 'https://espnmedia-cdn.akamaized.net/a/b.mp4');
    assert.deepEqual(fake.probes, [{ key: mediaProbeKey('49983806'), clips: 1 }], 'remembered as answered');
  }, async () => {
    requests += 1;
    return Response.json({ links: { source: { href: 'https://espnmedia-cdn.akamaized.net/a/b.mp4' } }, duration: 47 });
  });
  assert.equal(requests, 1);

  // The round trip that matters: with the in-memory cache gone — a deploy, a new
  // instance — the stored rendition answers and ESPN is not asked again.
  resetVideoNewsCaches();
  let after = 0;
  await withFetch(async () => {
    const media = await resolveVideoNewsMedia('49983806', fake.store);
    assert.equal(media.mp4, 'https://espnmedia-cdn.akamaized.net/a/b.mp4', 'still the rendition that was resolved');
    assert.equal(media.duration, 47);
  }, async () => {
    after += 1;
    return Response.json({});
  });
  assert.equal(after, 0, 'one clip is resolved once per row, not once per process');
  resetVideoNewsCaches();
});

test('a refusal is stored nowhere, but is remembered so a sweep stops re-asking', async () => {
  resetVideoNewsCaches();
  const fake = mediaStore();
  let attempts = 0;
  await withFetch(async () => {
    const first = await resolveVideoNewsMedia('55555555', fake.store);
    assert.equal(first.mp4, null);
    await settle();
    assert.deepEqual(fake.writes, [], 'a rendition that cannot play is not worth keeping permanently');
    assert.deepEqual(fake.probes, [{ key: mediaProbeKey('55555555'), clips: 0 }], 'but the refusal is recorded');

    // A reader who presses play again still gets a fresh attempt: the probe steers
    // a sweep's pre-warm, it does not lock a reader out.
    const second = await resolveVideoNewsMedia('55555555', fake.store);
    assert.equal(second.mp4, 'https://espnmedia-cdn.akamaized.net/late.mp4', 'a refusal is not remembered as unplayable');
    await settle();
    assert.equal(attempts, 2);
    assert.equal(fake.writes.length, 1, 'and the late answer is stored');
    assert.deepEqual(fake.probes.map((entry) => entry.clips), [0, 1]);
  }, async () => {
    attempts += 1;
    return attempts === 1
      ? new Response('geofenced', { status: 403 })
      : Response.json({ links: { source: { href: 'https://espnmedia-cdn.akamaized.net/late.mp4' } } });
  });
  resetVideoNewsCaches();
});

test('an invalid clip id reaches neither the network nor the database', async () => {
  resetVideoNewsCaches();
  const fake = mediaStore();
  const urls: string[] = [];
  await withFetch(async () => {
    for (const bad of ['', 'abc', '../../etc/passwd', 'https://evil.test/v1/video/clips/1', '1'.repeat(21)]) {
      const media = await resolveVideoNewsMedia(bad, fake.store);
      assert.deepEqual(media, { mp4: null, hls: null, page: null, thumbnail: null, duration: null });
    }
  }, async (input) => {
    urls.push(String(input));
    return Response.json({});
  });
  assert.deepEqual(urls, [], 'no request');
  assert.deepEqual(fake.lookups, [], 'and no query: the id is refused before anything is touched');
  assert.deepEqual(fake.probes, []);
  resetVideoNewsCaches();
});
