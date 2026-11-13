import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEED_BUDGET_MS, feedHighlightClips, getHighlightClipsForFeed, orderHighlightClips,
} from '../../src/lib/highlights-board';
import { FEED_INDEX_LIMIT, type FeedClipsRead } from '../../src/lib/highlights-index';
import { HIGHLIGHTS_FEED_SLOTS, SPORTS_FEED_SLOTS, VIDEO_NEWS_FEED_SLOTS, interleaveFeedCards } from '../../src/lib/feed-interleave';
import { dedupeAnchorRefs, highlightClipsAnchorRefs } from '../../src/lib/sports-anchor-store';
import type { SportsHighlightsBoard } from '../../src/lib/espn-highlights-feed';
import type { SportsHighlightClip } from '../../src/lib/espn-highlights';

/**
 * The For You feed's highlights: every clip the window holds, newest first.
 *
 * Three rules are worth locking here. The order has to be the index's own —
 * `occurred_at DESC NULLS LAST, id DESC` — or a feed assembled from stored rows
 * and one assembled from a live board would run differently, and the reader would
 * see the same clips in two orders on two surfaces. A board ESPN did not answer
 * has to contribute nothing, because its clips are the bundled samples and a card
 * in the middle of the feed has no heading to say so. And every way storage can
 * fail — missing, slow, throwing — has to land on the board the page already had,
 * never on an error and never on an empty feed that had clips a moment ago.
 */

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const clip = (over: Partial<SportsHighlightClip> & { id: string }): SportsHighlightClip => ({
  title: 'A highlight',
  description: null,
  duration: 47,
  thumbnail: null,
  mp4: 'https://espn.test/clip.mp4',
  hls: null,
  page: null,
  playable: true,
  eventId: 'espn-epl-401111111',
  eventName: 'Arsenal vs Chelsea',
  sport: 'football',
  league: 'epl',
  leagueName: 'Premier League',
  home: 'Arsenal',
  away: 'Chelsea',
  homeLogo: null,
  awayLogo: null,
  startAt: '2026-11-08T18:00:00.000Z',
  status: 'final',
  ...over,
});

const board = (clips: SportsHighlightClip[], status: SportsHighlightsBoard['status'] = 'live'): SportsHighlightsBoard => ({
  clips,
  status,
  games: new Set(clips.map((item) => item.eventId)).size,
  source: { ok: status !== 'unavailable', url: 'https://espn.test/highlights', httpStatus: status === 'unavailable' ? null : 200 },
});

type FakeFeedRead = {
  clips?: SportsHighlightClip[];
  remaining?: number;
  ok?: boolean;
  delayMs?: number;
  throws?: boolean;
};

/** A feed read that records what it was asked for, and fails on demand. */
function fakeRead(options: FakeFeedRead = {}) {
  const calls: { days: number; limit: number }[] = [];
  const read = async (days: number, limit: number): Promise<FeedClipsRead> => {
    calls.push({ days, limit });
    if (options.throws) throw new Error('connection lost');
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.ok === false) return { ok: false, reason: 'query-failed', clips: [], remaining: 0, sourceUrl: null };
    return { ok: true, clips: options.clips ?? [], remaining: options.remaining ?? 0, sourceUrl: null };
  };
  return { read, calls };
}

/* ── Order ──────────────────────────────────────────────────────────────── */

test('clips run newest to oldest, and a clip with no time goes last', () => {
  const oldest = clip({ id: 'a', startAt: '2026-11-01T18:00:00.000Z' });
  const middle = clip({ id: 'b', startAt: '2026-11-05T18:00:00.000Z' });
  const newest = clip({ id: 'c', startAt: '2026-11-09T18:00:00.000Z' });
  const timeless = clip({ id: 'd', startAt: null });
  const unparseable = clip({ id: 'e', startAt: 'not-a-date' });

  assert.deepEqual(
    orderHighlightClips([middle, timeless, newest, oldest, unparseable]).map((item) => item.id),
    // The two with no usable time go last, and inside that group they keep the
    // index's own `"id" DESC` tiebreak — 'e' before 'd' — exactly as
    // `ORDER BY occurred_at DESC NULLS LAST, id DESC` orders them.
    ['c', 'b', 'a', 'e', 'd'],
    'newest first, and a clip with no time last rather than first',
  );
  const input = [middle, newest, oldest];
  orderHighlightClips(input);
  assert.deepEqual(input.map((item) => item.id), ['b', 'c', 'a'], 'the caller\'s list is not reordered in place');
});

test('clips at the same instant are ordered by id, newest row first', () => {
  const at = '2026-11-08T18:00:00.000Z';
  const ordered = orderHighlightClips([clip({ id: '49861382', startAt: at }), clip({ id: '49861390', startAt: at }), clip({ id: '49861386', startAt: at })]);
  assert.deepEqual(ordered.map((item) => item.id), ['49861390', '49861386', '49861382'], 'the index\'s own "id DESC" tiebreak');
});

test('the stored order survives the merge, so both surfaces read the same way', () => {
  const stored = [
    clip({ id: '3', startAt: '2026-11-09T18:00:00.000Z' }),
    clip({ id: '2', startAt: '2026-11-08T18:00:00.000Z' }),
    clip({ id: '1', startAt: '2026-11-07T18:00:00.000Z' }),
  ];
  assert.deepEqual(feedHighlightClips(stored, null).map((item) => item.id), ['3', '2', '1']);
});

/* ── Merge ──────────────────────────────────────────────────────────────── */

test('a clip on the board the sweep has not stored yet still reaches the feed', () => {
  const stored = [clip({ id: '1', startAt: '2026-11-07T18:00:00.000Z' })];
  const fresh = clip({ id: '9', title: 'Just published', startAt: '2026-11-10T18:00:00.000Z' });
  const merged = feedHighlightClips(stored, board([fresh], 'live'));
  assert.deepEqual(merged.map((item) => item.id), ['9', '1'], 'newest first, whichever read produced it');
  assert.equal(merged[0].title, 'Just published');
});

test('a clip both reads produced appears once', () => {
  const shared = clip({ id: '5', startAt: '2026-11-08T18:00:00.000Z' });
  const merged = feedHighlightClips([shared, clip({ id: '6', startAt: '2026-11-09T18:00:00.000Z' })], board([{ ...shared }], 'partial'));
  assert.deepEqual(merged.map((item) => item.id), ['6', '5'], 'one card per clip, not one per read');
});

test('a board ESPN did not answer contributes no clips at all', () => {
  const samples = [clip({ id: 's1', title: 'Sample highlight' }), clip({ id: 's2' })];
  assert.deepEqual(feedHighlightClips([], board(samples, 'unavailable')), [], 'a sample clip in the feed would look like a real highlight nobody can play');
  const stored = [clip({ id: '1', startAt: '2026-11-07T18:00:00.000Z' })];
  assert.deepEqual(feedHighlightClips(stored, board(samples, 'unavailable')).map((item) => item.id), ['1'], 'real stored clips still run beside a sample board');
  assert.equal(feedHighlightClips([], board(samples, 'partial')).length, 2, 'a partial board is real, so its clips are shown');
});

test('a clip with no id is dropped rather than deduplicated against every other', () => {
  const merged = feedHighlightClips([clip({ id: '' }), clip({ id: '1' })], null);
  assert.deepEqual(merged.map((item) => item.id), ['1']);
});

/* ── The read ───────────────────────────────────────────────────────────── */

test('storage answering is the feed, with no ESPN request and its ceiling reported', async () => {
  const clips = [clip({ id: '2', startAt: '2026-11-09T18:00:00.000Z' }), clip({ id: '1', startAt: '2026-11-08T18:00:00.000Z' })];
  const fake = fakeRead({ clips, remaining: 7 });
  const feed = await getHighlightClipsForFeed({ board: null, read: fake.read });
  assert.equal(feed.provenance, 'stored');
  assert.deepEqual(feed.clips.map((item) => item.id), ['2', '1']);
  assert.equal(feed.remaining, 7, 'clips the ceiling withheld are reported, not silently dropped');
  assert.deepEqual(fake.calls, [{ days: 7, limit: FEED_INDEX_LIMIT }], 'the window the homepage already uses, and the feed\'s own ceiling');
});

test('storage that cannot answer leaves the feed with the board it already had', async () => {
  const real = board([clip({ id: '1' })], 'live');
  for (const options of [{ ok: false as const }, { throws: true }, { delayMs: FEED_BUDGET_MS + 200 }]) {
    const feed = await getHighlightClipsForFeed({ board: real, budgetMs: 40, read: fakeRead(options).read });
    assert.deepEqual(feed.clips.map((item) => item.id), ['1'], `degrades on ${JSON.stringify(options)}`);
    assert.equal(feed.provenance, 'board');
    assert.equal(feed.remaining, 0);
  }
});

test('with neither storage nor a real board the feed carries no highlights', async () => {
  const feed = await getHighlightClipsForFeed({ board: board([clip({ id: 's' })], 'unavailable'), read: fakeRead({ ok: false }).read });
  assert.deepEqual(feed.clips, []);
  assert.equal(feed.provenance, 'none');
  const empty = await getHighlightClipsForFeed({ board: null, read: fakeRead({ clips: [] }).read });
  assert.deepEqual(empty.clips, [], 'an empty window is an empty list, not a placeholder');
  assert.equal(empty.provenance, 'stored');
});

test('the read is asked for the window and ceiling it is given', async () => {
  const fake = fakeRead({ clips: [] });
  await getHighlightClipsForFeed({ board: null, days: 3, limit: 25, read: fake.read });
  assert.deepEqual(fake.calls, [{ days: 3, limit: 25 }]);
});

/* ── Placement in the feed ──────────────────────────────────────────────── */

test('highlights get their own pass, so the cards already in the feed do not move', () => {
  const posts = Array.from({ length: 10 }, (_, index) => `post-${index}`);
  const matches = ['match-0', 'match-1', 'match-2', 'match-3', 'match-4'];
  const news = ['news-0'];
  const highlights = ['h-0', 'h-1', 'h-2', 'h-3'];

  const before = interleaveFeedCards(interleaveFeedCards(posts, matches, SPORTS_FEED_SLOTS), news, VIDEO_NEWS_FEED_SLOTS);
  const after = interleaveFeedCards(before, highlights, HIGHLIGHTS_FEED_SLOTS);

  assert.deepEqual(HIGHLIGHTS_FEED_SLOTS, [4, 9]);
  assert.equal(after[4], 'h-0', 'the newest highlight is inside the first screenful');
  assert.equal(after[9], 'h-1');
  assert.deepEqual(after.slice(-2), ['h-2', 'h-3'], 'every other clip follows, newest to oldest');
  assert.deepEqual(after.filter((item) => item.startsWith('post-')), posts, 'member posts keep their order');
  assert.deepEqual(
    after.filter((item) => item.startsWith('match-') || item.startsWith('news-')),
    before.filter((item) => item.startsWith('match-') || item.startsWith('news-')),
    'the desk\'s cards keep their relative order when highlights join',
  );
  assert.equal(after.length, posts.length + matches.length + news.length + highlights.length, 'nothing is dropped to make room');
});

test('every clip the feed carries gets a ref, past the sidebar list\'s bound', () => {
  const clips = Array.from({ length: 90 }, (_, index) => clip({ id: `4986${String(1000 + index)}` }));
  assert.equal(highlightClipsAnchorRefs(clips).length, 60, 'the default still bounds a sidebar list');
  assert.equal(highlightClipsAnchorRefs(clips, clips.length).length, 90, 'the feed asks for as many as it renders');
  assert.deepEqual(highlightClipsAnchorRefs(clips, clips.length)[0], { kind: 'highlight', id: '49861000' });
});

test('a card that appears twice keeps its first, highest-priority position', () => {
  const leaders = [{ kind: 'leader', id: 'nba-scoring' } as const];
  const section = [{ kind: 'highlight', id: '49861382' } as const];
  const feed = [{ kind: 'highlight', id: '49861390' } as const, { kind: 'highlight', id: '49861382' } as const];
  const refs = dedupeAnchorRefs(leaders, section, feed);
  assert.deepEqual(refs.map((ref) => ref.id), ['nba-scoring', '49861382', '49861390'],
    'one ref per card, in the order the groups were given');
});

test('the oldest feed clip is last, so a ceiling cuts it and not a card always on screen', () => {
  const leaders = Array.from({ length: 4 }, (_, index) => ({ kind: 'leader', id: `l-${index}` } as const));
  const clips = Array.from({ length: 5 }, (_, index) => clip({ id: `4986${String(1000 + index)}`, startAt: new Date(Date.now() - index * 3_600_000).toISOString() }));
  const refs = dedupeAnchorRefs(leaders, [], highlightClipsAnchorRefs(clips, clips.length));
  assert.deepEqual(refs.slice(0, 4).map((ref) => ref.id), ['l-0', 'l-1', 'l-2', 'l-3'], 'the boards come first');
  assert.deepEqual(refs.slice(4).map((ref) => ref.id), ['49861000', '49861001', '49861002', '49861003', '49861004'],
    'then the feed newest to oldest, so the tail of the list is the oldest card');
  assert.equal(dedupeAnchorRefs().length, 0, 'no groups is no refs, not an error');
});
