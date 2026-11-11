import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interleaveFeedCards, SPORTS_FEED_SLOTS, VIDEO_NEWS_FEED_SLOTS } from '../../src/lib/feed-interleave';

/**
 * How the For You feed takes its cards.
 *
 * The homepage builds match cards, prediction cards and league video news
 * clips, and each kind is interleaved in its own pass. What this pins down is
 * the guarantee a new card kind has to keep: the cards that were already in the
 * feed stay exactly where they were, and a feed with no clips of the new kind
 * is identical to the feed before that kind existed.
 */

const posts = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `post-${index}`, type: 'post' }));
const cards = (kind: string, count: number) => Array.from({ length: count }, (_, index) => ({ id: `${kind}-${index}`, type: kind }));
const ids = (feed: { id: string }[]) => feed.map((entry) => entry.id);

/** The feed the homepage builds: match and prediction cards, then video news. */
function homeFeed(visible: { id: string }[], sports: { id: string }[], predictions: { id: string }[], clips: { id: string }[]) {
  return interleaveFeedCards(
    interleaveFeedCards(visible, [...sports, ...predictions], SPORTS_FEED_SLOTS),
    clips,
    VIDEO_NEWS_FEED_SLOTS,
  );
}

test('a feed with no video clips is identical to the feed before that card kind existed', () => {
  const visible = posts(10);
  const sports = cards('sports', 2);
  const predictions = cards('prediction', 2);

  const before = interleaveFeedCards(visible, [...sports, ...predictions], SPORTS_FEED_SLOTS);
  const after = homeFeed(visible, sports, predictions, []);

  assert.deepEqual(ids(after), ids(before), 'an empty clip list adds nothing and moves nothing');
  // The match and prediction cards keep the slots they have always had.
  assert.deepEqual(ids(after), [
    'post-0', 'sports-0', 'post-1', 'sports-1', 'post-2', 'prediction-0',
    'post-3', 'prediction-1', 'post-4', 'post-5', 'post-6', 'post-7', 'post-8', 'post-9',
  ]);
});

test('video clips take their own slots without moving the match or prediction cards', () => {
  const feed = homeFeed(posts(10), cards('sports', 2), cards('prediction', 2), cards('video-news', 2));
  const withoutClips = homeFeed(posts(10), cards('sports', 2), cards('prediction', 2), []);

  // Every card that was already there is still there, in the same order.
  assert.deepEqual(
    ids(feed).filter((id) => !id.startsWith('video-news')),
    ids(withoutClips),
    'the clips are added alongside the other cards, not in place of them',
  );
  assert.equal(ids(feed).filter((id) => id.startsWith('video-news')).length, 2);
  // The clips land between the cards that were already there, not on top of them.
  assert.equal(ids(feed)[2], 'video-news-0');
  assert.equal(ids(feed)[6], 'video-news-1');
});

test('a short feed appends cards instead of writing past its end', () => {
  assert.deepEqual(ids(homeFeed(posts(1), cards('sports', 2), cards('prediction', 2), cards('video-news', 2))), [
    'post-0', 'sports-0', 'video-news-0', 'sports-1', 'prediction-0', 'prediction-1', 'video-news-1',
  ]);
  // An empty feed still shows the cards: the sports feed is the page's content
  // for a member nobody follows yet.
  assert.deepEqual(ids(homeFeed([], cards('sports', 1), [], cards('video-news', 1))), ['sports-0', 'video-news-0']);
  assert.deepEqual(homeFeed([], [], [], []), []);
});

test('more cards than slots are appended, and the posts themselves are never reordered', () => {
  const feed = interleaveFeedCards(posts(4), cards('sports', 6), SPORTS_FEED_SLOTS);
  assert.deepEqual(ids(feed), [
    'post-0', 'sports-0', 'post-1', 'sports-1', 'post-2', 'sports-2', 'post-3',
    'sports-3', 'sports-4', 'sports-5',
  ]);
  assert.deepEqual(ids(feed).filter((id) => id.startsWith('post')), ['post-0', 'post-1', 'post-2', 'post-3']);
});

test('interleaving reads the member posts without changing them', () => {
  const visible = posts(6);
  const snapshot = ids(visible);
  homeFeed(visible, cards('sports', 2), cards('prediction', 2), cards('video-news', 2));
  assert.deepEqual(ids(visible), snapshot, 'the Following and Saved tabs read this same list');
});
