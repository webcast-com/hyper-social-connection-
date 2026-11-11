import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  espnLeagueNewsUrl,
  getSportsVideoNews,
  getSportsVideoNewsForRender,
  MAX_FEED_CLIPS,
  resolveVideoNewsMedia,
  resetVideoNewsCaches,
  videoNewsLeagues,
} from '../../src/lib/espn-video-news-feed';
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
