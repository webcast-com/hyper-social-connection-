import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  combineVideoNews,
  durationSeconds,
  espnClipRecordUrl,
  isEspnClipPageUrl,
  isEspnClipRecordUrl,
  isVideoArticle,
  parseVideoNews,
  parseVideoNewsMedia,
  type VideoNewsLeague,
} from '../../src/lib/espn-video-news';

/**
 * League video news, parsed.
 *
 * This reader is separate from the match highlights stack, so its rules are its
 * own: a clip must be a genuine video with a validated ESPN page, a league clip
 * never carries an invented fixture, and no media URL exists until a reader asks
 * for one.
 */

const league: VideoNewsLeague = { slug: 'epl', name: 'Premier League', kind: 'football', sport: 'soccer', league: 'eng.1' };

const article = (over: Record<string, unknown> = {}) => ({
  id: 49983806,
  type: 'Media',
  headline: 'Saka curls Arsenal ahead at Brighton',
  description: 'A first-time finish from the edge of the box.',
  published: '2026-11-08T18:05:00Z',
  images: [{ url: 'https://a.espncdn.com/photo/49983806.jpg' }],
  links: {
    web: { href: 'https://www.espn.com/video/clip/_/id/49983806/brighton-arsenal' },
    api: { self: { href: 'https://content.core.api.espn.com/v1/video/clips/49983806' } },
  },
  categories: [
    { type: 'league', league: { description: 'English Premier League' } },
    { type: 'team', team: { shortDisplayName: 'Arsenal', description: 'Arsenal FC' } },
    { type: 'team', team: { shortDisplayName: 'Brighton' } },
  ],
  ...over,
});

test('an article is a video only when ESPN says so', () => {
  assert.equal(isVideoArticle({ type: 'Video' }), true);
  assert.equal(isVideoArticle({ type: 'Media', links: { web: { href: 'https://www.espn.com/video/clip/_/id/1' } } }), true);
  assert.equal(isVideoArticle({ type: 'Headline', videos: [{ id: 1 }] }), true);
  assert.equal(isVideoArticle({ type: 'Headline', links: { api: { videos: { href: 'https://content.core.api.espn.com/v1/video/clips/1' } } } }), true);
  // A text story that merely mentions a video is not a clip.
  assert.equal(isVideoArticle({ type: 'Headline', links: { web: { href: 'https://www.espn.com/soccer/story/_/id/1/transfer-news' } } }), false);
  assert.equal(isVideoArticle({ type: 'Media', links: { web: { href: 'https://www.espn.com/soccer/story/_/id/1' } } }), false);
  assert.equal(isVideoArticle({}), false);
});

test('a news article becomes a clip with ESPN\u2019s own labels and no invented fixture', () => {
  const clips = parseVideoNews({ articles: [article()] }, league);
  assert.equal(clips.length, 1);
  const clip = clips[0];
  assert.equal(clip.id, 'espn-video-epl-49983806');
  assert.equal(clip.clipId, '49983806');
  assert.equal(clip.title, 'Saka curls Arsenal ahead at Brighton');
  assert.equal(clip.description, 'A first-time finish from the edge of the box.');
  // ESPN's own category label wins over the catalog's name for this competition.
  assert.equal(clip.leagueName, 'English Premier League');
  assert.equal(clip.league, 'epl');
  assert.equal(clip.sport, 'football');
  assert.deepEqual(clip.teams, ['Arsenal', 'Brighton']);
  assert.equal(clip.publishedAt, '2026-11-08T18:05:00Z');
  assert.equal(clip.page, 'https://www.espn.com/video/clip/_/id/49983806/brighton-arsenal');
  assert.equal(clip.thumbnail, 'https://a.espncdn.com/photo/49983806.jpg');
});

test('a listing carries no media URL: the file is fetched only when a reader plays it', () => {
  const clip = parseVideoNews({ articles: [article()] }, league)[0];
  assert.deepEqual(Object.keys(clip).sort(), [
    'clipId', 'description', 'id', 'league', 'leagueName', 'page', 'publishedAt', 'sport', 'teams', 'thumbnail', 'title',
  ]);
  assert.equal('mp4' in clip, false, 'no media on a listing entry');
});

test('clips without a validated ESPN page, an id or a title are dropped, not guessed at', () => {
  const unsafe = article({ id: 2, links: { web: { href: 'javascript:alert(1)' } } });
  const lookalike = article({ id: 3, links: { web: { href: 'https://espn.com.evil.test/video/clip/_/id/3' } } });
  const story = article({ id: 4, type: 'Headline', links: { web: { href: 'https://www.espn.com/soccer/story/_/id/4' } } });
  const untitled = article({ id: 5, headline: '   ', description: '' });
  const noId = article({ id: 'abc', links: { web: { href: 'https://www.espn.com/video/clip/_/id/brighton-arsenal' }, api: {} } });
  assert.deepEqual(parseVideoNews({ articles: [unsafe, lookalike, story, untitled, noId] }, league), []);
  // Malformed responses are empty, not an error and not a fabricated clip.
  assert.deepEqual(parseVideoNews({}, league), []);
  assert.deepEqual(parseVideoNews(null, league), []);
  assert.deepEqual(parseVideoNews({ articles: [null, 'bad', 7] }, league), []);
});

test('the same clip syndicated across leagues is one card, newest first', () => {
  const epl = parseVideoNews({ articles: [article()] }, league);
  const ucl: VideoNewsLeague = { slug: 'ucl', name: 'Champions League', kind: 'football', sport: 'soccer', league: 'uefa.champions' };
  const later = parseVideoNews({
    articles: [
      article({ id: 70000001, published: '2026-11-09T09:00:00Z', links: { web: { href: 'https://www.espn.com/video/clip/_/id/70000001' } } }),
      // The same page as the EPL clip, reported again by another league's feed.
      article(),
    ],
  }, ucl);

  const combined = combineVideoNews([epl, later], 12);
  assert.equal(combined.length, 2, 'a repeated clip page is not a second card');
  assert.equal(combined[0].clipId, '70000001', 'newest first');
  assert.equal(combined[1].id, 'espn-video-epl-49983806');

  // A clip with no published date sorts behind one that has it, and the cap holds.
  const undated = parseVideoNews({ articles: [article({ id: 80000001, published: null, lastModified: null, links: { web: { href: 'https://www.espn.com/video/clip/_/id/80000001' } } })] }, league);
  assert.equal(combineVideoNews([undated, epl], 12)[0].clipId, '49983806');
  assert.equal(combineVideoNews([epl, later, undated], 2).length, 2);
});

test('a description that only repeats the headline adds nothing to a card', () => {
  const clip = parseVideoNews({ articles: [article({ description: 'Saka curls Arsenal ahead at Brighton' })] }, league)[0];
  assert.equal(clip.description, null);
});

test('clip record urls are built from a numeric id and accepted only from ESPN\u2019s own host', () => {
  assert.equal(espnClipRecordUrl('49983806'), 'https://content.core.api.espn.com/v1/video/clips/49983806');
  assert.equal(espnClipRecordUrl('49983806/../../admin'), null);
  assert.equal(espnClipRecordUrl('abc'), null);
  assert.equal(espnClipRecordUrl(''), null);
  assert.equal(espnClipRecordUrl(undefined), null);
  assert.equal(espnClipRecordUrl('1'.repeat(21)), null);

  assert.equal(isEspnClipRecordUrl('https://content.core.api.espn.com/v1/video/clips/5'), true);
  assert.equal(isEspnClipRecordUrl('https://evil.test/v1/video/clips/5'), false);
  assert.equal(isEspnClipRecordUrl('https://content.core.api.espn.com.evil.test/v1/video/clips/5'), false);
  assert.equal(isEspnClipRecordUrl('https://content.core.api.espn.com/v1/video/other/5'), false);
  assert.equal(isEspnClipRecordUrl('http://content.core.api.espn.com/v1/video/clips/5'), false);

  assert.equal(isEspnClipPageUrl('https://www.espn.com/video/clip/_/id/5'), true);
  assert.equal(isEspnClipPageUrl('https://espn.com/video/clip/_/id/5'), true);
  assert.equal(isEspnClipPageUrl('https://espn.co.uk/video/5'), false);
  assert.equal(isEspnClipPageUrl('https://www.espn.com/video/5?next=https://evil.test'), true, 'a query is not a host change');
});

test('a clip record resolves to a progressive file first, and ignores renditions that cannot play', () => {
  const media = parseVideoNewsMedia({
    headline: 'Saka curls Arsenal ahead',
    duration: 174,
    thumbnail: 'https://espnmedia-cdn.akamaized.net/thumb.jpg',
    web: { href: 'https://www.espn.com/video/clip/_/id/49983806' },
    links: {
      source: {
        href: 'https://espnmedia-cdn.akamaized.net/a/b.mp4',
        HLS: { href: 'https://cmp-espn.media.dssott.com/playlist.m3u8' },
      },
      // Auth-gated renditions carry no extension, so they are never playable.
      mobile: { source: { href: 'https://watch.auth.api.espn.com/video/auth/abc123' } },
    },
  });
  assert.equal(media.mp4, 'https://espnmedia-cdn.akamaized.net/a/b.mp4');
  assert.equal(media.hls, 'https://cmp-espn.media.dssott.com/playlist.m3u8');
  assert.equal(media.duration, 174);
  assert.equal(media.thumbnail, 'https://espnmedia-cdn.akamaized.net/thumb.jpg');
  assert.equal(media.page, 'https://www.espn.com/video/clip/_/id/49983806');

  // The wrapped shape ESPN also sends.
  const wrapped = parseVideoNewsMedia({ videos: [{ links: { source: { href: 'https://cdn.example/clip.mp4' } }, duration: '2:54' }] });
  assert.equal(wrapped.mp4, 'https://cdn.example/clip.mp4');
  assert.equal(wrapped.duration, 174);

  // HLS only: still media, but the card must check the browser can play it.
  const hlsOnly = parseVideoNewsMedia({ links: { source: { HLS: { href: 'https://cdn.example/playlist.m3u8' } } } });
  assert.equal(hlsOnly.mp4, null);
  assert.equal(hlsOnly.hls, 'https://cdn.example/playlist.m3u8');

  // Nothing playable, and nothing invented.
  const empty = parseVideoNewsMedia({ links: { source: { href: 'https://watch.auth.api.espn.com/video/auth/abc' } } });
  assert.deepEqual(empty, { mp4: null, hls: null, page: null, thumbnail: null, duration: null });
  assert.deepEqual(parseVideoNewsMedia(null), { mp4: null, hls: null, page: null, thumbnail: null, duration: null });
  // A page that is not ESPN's is not offered as a fallback.
  assert.equal(parseVideoNewsMedia({ web: { href: 'https://evil.test/watch' } }).page, null);
});

test('durations arrive as seconds, numeric strings or clock strings', () => {
  assert.equal(durationSeconds(47), 47);
  assert.equal(durationSeconds('47'), 47);
  assert.equal(durationSeconds('2:54'), 174);
  assert.equal(durationSeconds('0:00'), 0);
  assert.equal(durationSeconds(0), null);
  assert.equal(durationSeconds(-3), null);
  assert.equal(durationSeconds('soon'), null);
  assert.equal(durationSeconds(null), null);
});
