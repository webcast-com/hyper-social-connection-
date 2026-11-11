/**
 * How the For You feed interleaves its own cards among member posts.
 *
 * The homepage builds several kinds of card that are not posts — a featured
 * match, a prediction, a league video clip — and each kind is placed at fixed
 * slots so the feed reads as a feed rather than a wall of sports cards. The
 * rule lives here, in one place, because it is the one thing that must not
 * change by accident when a new card kind is added: each kind gets its own
 * pass over the list, so adding a kind cannot move the kinds already there.
 *
 * Slots are positions in the list as it stands when that pass runs, and a pass
 * never writes past the end: a short feed just appends. The input list is not
 * mutated, so the Following and Saved tabs, which read the same posts, are
 * unaffected by what the For You tab inserts.
 */

/** Slots for the match and prediction cards, in the order they are built. */
export const SPORTS_FEED_SLOTS: readonly number[] = [1, 3, 5, 7];

/**
 * Slots for league video news clips.
 *
 * Their own pass, after the match and prediction cards are in, so the two never
 * compete for the same position and a feed with no clips is byte-identical to
 * the feed before this card kind existed.
 */
export const VIDEO_NEWS_FEED_SLOTS: readonly number[] = [2, 6];

/** Cards placed at `slots` among `posts`, returning a new list. */
export function interleaveFeedCards<T>(posts: readonly T[], cards: readonly T[], slots: readonly number[]): T[] {
  const feed = [...posts];
  cards.forEach((card, index) => {
    const insertAt = Math.min(slots[index] ?? feed.length, feed.length);
    feed.splice(insertAt, 0, card);
  });
  return feed;
}
