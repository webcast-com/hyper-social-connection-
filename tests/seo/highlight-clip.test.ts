import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIP_PAGE_ROOT, CLIP_STATUS_LABEL, clipBreadcrumbFor, clipFixtureHref, clipHref, clipMedia,
  clipPageDescription, clipPageTitle, clockDuration, iso8601Duration, videoObjectFor,
} from '../../src/lib/highlight-clip';
import { highlightAnchorId } from '../../src/lib/sports-anchor';
import type { SportsHighlightClip } from '../../src/lib/espn-highlights';

/**
 * A stored highlight clip as a page of its own.
 *
 * Every rule here is one a search result is made of, so every one of them is about
 * not claiming something ESPN did not report: a clip with no thumbnail gets no
 * `VideoObject` at all rather than one with an invented image, a clip with no
 * reported length gets no duration, and a clip whose description was only its title
 * again gets one assembled from the fixture and competition it did report.
 */

const ORIGIN = 'https://hyper.co.ke';

const clip = (over: Partial<SportsHighlightClip> = {}): SportsHighlightClip => ({
  id: '50476535',
  title: 'Gabe Perreault lights the lamp for Rangers',
  description: 'Gabe Perreault lights the lamp for Rangers',
  duration: 48,
  thumbnail: 'https://espnmedia-cdn.akamaized.net/espn/media/common/wsc/2026/1114/f1136ae8.jpg',
  mp4: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/wsc/2026/1114/f1136ae8.mp4',
  hls: null,
  page: 'https://www.espn.com/video/clip/_/id/50476535',
  playable: true,
  eventId: 'espn-nhl-401892706',
  eventName: 'Vancouver Canucks vs New York Rangers',
  sport: 'ice-hockey',
  league: 'nhl',
  leagueName: 'National Hockey League',
  home: 'Vancouver Canucks',
  away: 'New York Rangers',
  homeLogo: null,
  awayLogo: null,
  startAt: '2026-11-14T02:00:00.000Z',
  status: 'live',
  ...over,
});

/* ── Identity ───────────────────────────────────────────────────────────── */

test('a clip page is keyed by the same identity as its post anchor', () => {
  const subject = clip();
  assert.equal(clipHref(subject), `${CLIP_PAGE_ROOT}/${highlightAnchorId(subject)}`);
  assert.equal(clipHref(subject), '/sports/highlights/50476535');
  assert.equal(CLIP_PAGE_ROOT, '/sports/highlights', 'under the list the clip came from');
});

test('every match state a clip can carry has a label a reader reads', () => {
  assert.deepEqual(CLIP_STATUS_LABEL, { live: 'Live', final: 'Full time', upcoming: 'Upcoming' });
});

/* ── Lengths ────────────────────────────────────────────────────────────── */

test('a length is ISO 8601 as VideoObject wants it, and absent when it is not known', () => {
  assert.equal(iso8601Duration(146), 'PT2M26S');
  assert.equal(iso8601Duration(17), 'PT17S');
  assert.equal(iso8601Duration(3600), 'PT1H');
  assert.equal(iso8601Duration(3725), 'PT1H2M5S');
  assert.equal(iso8601Duration(47.9), 'PT47S', 'a fraction of a second is dropped, not rounded up');
  for (const value of [0, -5, null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(iso8601Duration(value as number | null | undefined), null, `${String(value)} is not a length`);
  }
});

test('a length reads the way a player shows it', () => {
  assert.equal(clockDuration(146), '2:26');
  assert.equal(clockDuration(17), '0:17');
  assert.equal(clockDuration(3725), '1:02:05');
  assert.equal(clockDuration(null), null);
});

/* ── Title and description ──────────────────────────────────────────────── */

test('the title names the fixture only when the clip title does not already', () => {
  assert.equal(
    clipPageTitle(clip({ title: 'Saka opens the scoring' })),
    'Saka opens the scoring — Vancouver Canucks vs New York Rangers highlights',
  );
  // Both sides named is the same thing as naming the fixture.
  assert.equal(
    clipPageTitle(clip({ title: 'Perreault scores as Canucks hold off Rangers' })),
    'Perreault scores as Canucks hold off Rangers',
  );
  assert.equal(clipPageTitle(clip({ title: 'Vancouver Canucks vs New York Rangers highlights' })), 'Vancouver Canucks vs New York Rangers highlights');
  assert.equal(clipPageTitle(clip({ eventName: null as unknown as string })), 'Gabe Perreault lights the lamp for Rangers', 'no fixture reported, none invented');
  // A clip ESPN gave no title for is headed by its fixture rather than by a
  // placeholder that would repeat the word "highlights" and name nothing.
  assert.equal(clipPageTitle(clip({ title: '   ' })), 'Vancouver Canucks vs New York Rangers highlights');
  assert.equal(clipPageTitle(clip({ title: '   ', eventName: null as unknown as string })), 'Match highlight', 'with no fixture either, a heading still exists');
});

test("the description is ESPN's when it says something, and assembled from facts when it does not", () => {
  assert.equal(
    clipPageDescription(clip({ description: 'Perreault beats the goalie from the slot early in the second.' })),
    'Perreault beats the goalie from the slot early in the second.',
  );
  // The common case in the stored index: ESPN's description is its title again.
  assert.equal(
    clipPageDescription(clip()),
    'Vancouver Canucks vs New York Rangers · National Hockey League · Live · 0:48 clip — highlight video stored on Hyper.',
  );
  assert.equal(
    clipPageDescription(clip({ description: null, duration: null, eventName: null as unknown as string, leagueName: '' })),
    'Live — highlight video stored on Hyper.',
    'only the facts that were reported',
  );
  // The match state is a fact ESPN reported, so it is still something to say.
  assert.equal(
    clipPageDescription(clip({ description: null, duration: null, eventName: null as unknown as string, leagueName: '', status: 'final' as const, startAt: null })),
    'Full time — highlight video stored on Hyper.',
  );
  assert.equal(
    clipPageDescription(clip({ description: null, duration: null, eventName: null as unknown as string, leagueName: '', status: 'unknown' as SportsHighlightClip['status'] })),
    'Highlight video stored on Hyper.',
    'a state this site does not recognise is not a fact to report',
  );
});

/* ── Structured data ────────────────────────────────────────────────────── */

test('a clip with everything ESPN reported becomes a VideoObject', () => {
  const value = videoObjectFor(clip({ description: 'Perreault beats the goalie from the slot.' }), ORIGIN);
  assert.ok(value);
  assert.equal(value['@type'], 'VideoObject');
  assert.equal(value['@context'], 'https://schema.org');
  assert.equal(value.name, 'Gabe Perreault lights the lamp for Rangers');
  assert.equal(value.description, 'Perreault beats the goalie from the slot.');
  assert.equal(value.thumbnailUrl, 'https://espnmedia-cdn.akamaized.net/espn/media/common/wsc/2026/1114/f1136ae8.jpg');
  assert.equal(value.uploadDate, '2026-11-14T02:00:00.000Z');
  assert.equal(value.contentUrl, clip().mp4, 'the file itself, so the clip is playable from a result');
  assert.equal(value.embedUrl, 'https://hyper.co.ke/sports/highlights/50476535', 'the result a reader clicks is the page on this site');
  assert.equal(value.duration, 'PT48S');
  assert.deepEqual(value.publisher, { '@type': 'Organization', name: 'Hyper', url: `${ORIGIN}/` });
});

test('a field Google requires but ESPN did not report means no VideoObject at all', () => {
  for (const over of [
    { thumbnail: null },
    { thumbnail: '   ' },
    { startAt: null },
    { title: '' },
  ]) {
    assert.equal(videoObjectFor(clip(over as Partial<SportsHighlightClip>), ORIGIN), null, JSON.stringify(over));
  }
});

test('a length and a file that were not reported are left out rather than filled in', () => {
  const value = videoObjectFor(clip({ duration: null, mp4: null }), ORIGIN);
  assert.ok(value);
  assert.equal('duration' in value, false, 'no duration this site cannot support');
  assert.equal('contentUrl' in value, false, 'no file means no contentUrl');
  assert.equal(value.embedUrl, 'https://hyper.co.ke/sports/highlights/50476535', 'the page is still the thing a result points at');
});

test('the trail to a clip is a breadcrumb list ending on this page', () => {
  const value = clipBreadcrumbFor(clip(), ORIGIN);
  assert.equal(value['@type'], 'BreadcrumbList');
  const items = value.itemListElement as { position: number; name: string; item?: string }[];
  assert.deepEqual(items.map((item) => item.position), [1, 2, 3, 4]);
  assert.deepEqual(items.map((item) => item.name), ['Home', 'Sports', 'Match highlights', clipPageTitle(clip())]);
  assert.equal(items[0].item, `${ORIGIN}/`);
  assert.equal(items[2].item, `${ORIGIN}${CLIP_PAGE_ROOT}`);
  assert.equal('item' in items[3], false, 'the last crumb is this page, and schema.org wants it without one');
});

/* ── Where the card and the page go ─────────────────────────────────────── */

test('a clip links to the board that carries its fixture, never to a guessed match page', () => {
  assert.equal(clipFixtureHref(clip({ sport: 'basketball', league: 'nba' })), '/nfl-basketball/basketball');
  assert.equal(clipFixtureHref(clip({ sport: 'american-football', league: 'nfl' })), '/nfl-basketball/nfl');
  assert.equal(clipFixtureHref(clip()), '/sports?league=nhl');
  // A stored event id is namespaced and may carry a competition suffix, so a match
  // URL built from it would be a guess; the league board is not.
  assert.equal(clipFixtureHref(clip({ league: 'league one' })), '/sports?league=league%20one', 'the slug is encoded');
});

test('the player descriptor is one rule for the card and the page', () => {
  assert.deepEqual(clipMedia(clip()), {
    kind: 'video',
    src: clip().mp4,
    provider: 'ESPN',
    thumbnail: clip().thumbnail,
    aspect: 'video',
    originalUrl: clip().page,
  });
  assert.equal(clipMedia(clip({ page: null }))?.originalUrl, clip().mp4, 'ESPN page first, the file when there is none');
  assert.equal(clipMedia(clip({ mp4: null })), null, 'nothing to play is no descriptor');
});
