import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundledHighlights, normalizeHighlights, type SportsHighlightContext } from '../../src/lib/espn-highlights';

const context: SportsHighlightContext = {
  eventId: '401584793',
  eventName: 'Arsenal vs Chelsea',
  sport: 'soccer',
  league: 'epl',
  leagueName: 'Premier League',
  home: 'Arsenal',
  away: 'Chelsea',
  homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
  awayLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/363.png',
  startAt: '2026-11-08T18:00:00.000Z',
  status: 'final',
};

test('a summary video becomes a playable clip with the match it belongs to', () => {
  const [clip] = normalizeHighlights({
    videos: [{
      id: '49861382',
      title: 'Saka opens the scoring',
      description: 'A curled finish from the edge of the box.',
      duration: 47,
      thumbnails: [{ href: 'https://a.espncdn.com/media/2026/0907/49861382.jpg' }],
      source: { href: 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4' },
      links: [{ rel: ['summary'], href: 'https://www.espn.com/video/clip/_/id/49861382' }],
    }],
  }, context);

  assert.equal(clip.title, 'Saka opens the scoring');
  assert.equal(clip.description, 'A curled finish from the edge of the box.');
  assert.equal(clip.duration, 47);
  assert.equal(clip.thumbnail, 'https://a.espncdn.com/media/2026/0907/49861382.jpg');
  assert.equal(clip.mp4, 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4');
  assert.equal(clip.hls, null);
  assert.equal(clip.playable, true);
  assert.equal(clip.page, 'https://www.espn.com/video/clip/_/id/49861382');
  // The fixture travels with the clip, so the card can show it.
  assert.equal(clip.eventName, 'Arsenal vs Chelsea');
  assert.equal(clip.leagueName, 'Premier League');
  assert.equal(clip.home, 'Arsenal');
  assert.equal(clip.homeLogo, context.homeLogo);
  assert.equal(clip.status, 'final');
  assert.equal(clip.startAt, context.startAt);
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
  assert.deepEqual(clips.map((clip) => clip.id), ['9', '401584793:clock string', '401584793:numeric string']);
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
