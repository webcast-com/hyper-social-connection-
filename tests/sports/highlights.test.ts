import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundledHighlights, normalizeHighlights, type SportsHighlightContext } from '../../src/lib/espn-highlights';

/**
 * The normaliser reads the shapes ESPN's video collection actually sends. The
 * fixtures below are copied from a live response (Champions League event
 * 401915383, read back on 2026-11-09), trimmed to the fields that matter.
 */

const context: SportsHighlightContext = {
  eventId: '401915383',
  eventName: 'AEK Athens vs Real Madrid',
  sport: 'football',
  league: 'ucl',
  leagueName: 'Champions League',
  home: 'AEK Athens',
  away: 'Real Madrid',
  homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/887.png',
  awayLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png',
  startAt: '2026-11-04T17:45:00.000Z',
  status: 'final',
};

test('a live video entry becomes a playable clip with the match it belongs to', () => {
  const [clip] = normalizeHighlights({
    videos: [{
      id: 50383009,
      cerebroId: '6aebbd002f5e962a8dcb471c',
      source: 'espn',
      headline: 'Klinsmann: Real Madrid understand when it is important to step it up',
      description: 'Klinsmann: Real Madrid understand when it is important to step it up',
      duration: 97,
      thumbnail: 'https://espnmedia-cdn.akamaized.net/espn/media/common/2026/1104/dm_261104_Klinsmann.jpg',
      links: {
        api: { self: { href: 'https://content.core.api.espn.com/v1/video/clips/50383009' } },
        mobile: {
          href: 'https://watch.auth.api.espn.com/video/auth/brightcove/64c61209/asset?UMADPARAMreferer=https://www.espn.com/video/clip/_/id/50383009',
          source: { href: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1104/dm_261104_Klinsmann.mp4' },
        },
        source: {
          href: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1104/dm_261104_Klinsmann.mp4',
          HD: { href: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1104/dm_261104_Klinsmann.mp4' },
          HLS: { href: 'https://cmp-espn.media.dssott.com/opp/hls/espn/2026/1104/dm_261104_Klinsmann/playlist.m3u8' },
        },
      },
      // The clip's own page is a top-level key, a sibling of `links`.
      web: { href: 'https://www.espn.com/video/clip/_/id/50383009/real-madrid-understand-important-step-up' },
    }],
  }, context);

  // ESPN sends the id as a number, not a string.
  assert.equal(clip.id, '50383009');
  assert.equal(clip.title, 'Klinsmann: Real Madrid understand when it is important to step it up');
  assert.equal(clip.description, 'Klinsmann: Real Madrid understand when it is important to step it up');
  assert.equal(clip.duration, 97);
  assert.equal(clip.thumbnail, 'https://espnmedia-cdn.akamaized.net/espn/media/common/2026/1104/dm_261104_Klinsmann.jpg');
  assert.equal(clip.mp4, 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1104/dm_261104_Klinsmann.mp4');
  assert.equal(clip.hls, 'https://cmp-espn.media.dssott.com/opp/hls/espn/2026/1104/dm_261104_Klinsmann/playlist.m3u8');
  assert.equal(clip.playable, true);
  assert.equal(clip.page, 'https://www.espn.com/video/clip/_/id/50383009/real-madrid-understand-important-step-up');
  // The fixture travels with the clip, so the card can show it.
  assert.equal(clip.eventName, 'AEK Athens vs Real Madrid');
  assert.equal(clip.leagueName, 'Champions League');
  assert.equal(clip.home, 'AEK Athens');
  assert.equal(clip.homeLogo, context.homeLogo);
  assert.equal(clip.status, 'final');
  assert.equal(clip.startAt, context.startAt);
});

test('an auth-gated rendition is never handed to a <video> element', () => {
  const [clip] = normalizeHighlights({
    videos: [{
      id: 50390519,
      headline: 'Jude Bellingham visits Atlanta Falcons training session',
      duration: 25,
      thumbnail: 'https://espnmedia-cdn.akamaized.net/espn/media/common/2026/1105/dm_261105_Bellingham.jpg',
      links: {
        mobile: {
          href: 'https://watch.auth.api.espn.com/video/auth/brightcove/e771786b/asset?UMADPARAMreferer=https://www.espn.com/video/clip/_/id/50390519',
          progressiveDownload: { href: 'https://watch.auth.api.espn.com/video/auth/brightcove/e771786b/asset?UMADPARAMreferer=https://www.espn.com/video/clip/_/id/50390519' },
        },
        source: { href: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1105/dm_261105_Bellingham.mp4' },
      },
      web: { href: 'https://www.espn.com/video/clip/_/id/50390519/jude-bellingham-visits-atlanta-falcons-training-session' },
    }],
  }, context);

  assert.equal(clip.mp4, 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1105/dm_261105_Bellingham.mp4');
  assert.equal(clip.playable, true);
  // `links.web` is accepted as well as the top-level `web` key.
  assert.equal(clip.page, 'https://www.espn.com/video/clip/_/id/50390519/jude-bellingham-visits-atlanta-falcons-training-session');
});

test('clips are read from the highlights key and from playback renditions', () => {
  const [clip] = normalizeHighlights({
    highlights: [{
      id: '77',
      headline: 'Full match highlights',
      playback: [{ name: 'HD', url: 'https://cdn.example.espn.com/video/77/master.m3u8' }],
    }],
  }, context);

  assert.equal(clip.title, 'Full match highlights');
  assert.equal(clip.hls, 'https://cdn.example.espn.com/video/77/master.m3u8');
  assert.equal(clip.mp4, null);
  // HLS needs Safari, so the card must not pretend to play it inline.
  assert.equal(clip.playable, false);
  assert.equal(clip.page, 'https://www.espn.com/video/clip/_/id/77');
});

test('a clip with only a link is kept, and a clip with nothing to watch is dropped', () => {
  const clips = normalizeHighlights({
    videos: [
      { id: '1', title: 'Watch on ESPN', links: [{ href: 'https://www.espn.com/video/clip/_/id/1' }] },
      { id: '2', title: 'No media anywhere' },
      // A relative media path is not a URL, so it is not played.
      { id: '3', title: 'Not a URL', source: { href: '/relative/path.mp4' } },
      { title: 'No id and no media' },
      'not-an-object',
    ],
  }, context);

  // Every video ESPN lists carries an id, so it keeps ESPN's clip page even
  // when no media file is published; only a clip with neither is dropped.
  assert.equal(clips.length, 3);
  assert.equal(clips[0].id, '1');
  assert.equal(clips[0].mp4, null);
  assert.equal(clips[0].page, 'https://www.espn.com/video/clip/_/id/1');
  assert.equal(clips[1].mp4, null);
  assert.equal(clips[1].page, 'https://www.espn.com/video/clip/_/id/2');
  assert.equal(clips[2].mp4, null);
  assert.equal(clips[2].page, 'https://www.espn.com/video/clip/_/id/3');
});

test('duplicate clips are de-duplicated and durations are read from clock strings', () => {
  const clips = normalizeHighlights({
    videos: [
      { id: '9', title: 'Same clip', duration: '1:05', source: { href: 'https://a.espncdn.com/media/video/9.mp4' } },
      { id: '9', title: 'Same clip again', duration: '1:05', source: { href: 'https://a.espncdn.com/media/video/9.mp4' } },
      { title: 'Clock string', duration: '2:09', source: { href: 'https://a.espncdn.com/media/video/10.mp4' } },
      { title: 'Numeric string', duration: '12', source: { href: 'https://a.espncdn.com/media/video/11.mp4' } },
    ],
  }, context);

  assert.equal(clips.length, 3);
  assert.deepEqual(clips.map((clip) => clip.duration), [65, 129, 12]);
  // Without an ESPN id the clip is keyed by the fixture plus its title.
  assert.deepEqual(clips.map((clip) => clip.id), ['9', '401915383:clock string', '401915383:numeric string']);
});

test('a game with no videos produces no clips', () => {
  assert.deepEqual(normalizeHighlights({ videos: [] }, context), []);
});

test('malformed payloads produce no clips', () => {
  assert.deepEqual(normalizeHighlights({}, context), []);
  assert.deepEqual(normalizeHighlights(null, context), []);
  assert.deepEqual(normalizeHighlights({ videos: 'nope' }, context), []);
  assert.deepEqual(normalizeHighlights({ videos: [{ id: '1' }] }, context), []);
});

test('the bundled sample clips carry no invented ESPN media URLs', () => {
  const clips = bundledHighlights();
  assert.ok(clips.length >= 4);
  for (const clip of clips) {
    assert.equal(clip.mp4, null, 'no invented media file');
    assert.equal(clip.hls, null, 'no invented stream');
    assert.equal(clip.page, null, 'no invented ESPN page');
    assert.equal(clip.playable, false);
    assert.match(clip.description!, /sample/i);
  }
});
