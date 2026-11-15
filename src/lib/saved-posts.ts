/**
 * A member's saved posts, for the Saved section of their own profile.
 *
 * The home feed's Saved tab used to be the only view of a member's bookmarks; it
 * became the Highlights tab, and this is where the list lives now. Two things are
 * kept exactly as that tab had them, so nothing a member could see there is gone
 * and nothing they could not see has appeared:
 *
 * - a post by someone the viewer has blocked or muted, or who has blocked them,
 *   is left out;
 * - a post scheduled for later is left out until it is published.
 *
 * One thing is better: the list runs most recently saved first, which is the
 * order a reader looking for "the thing I saved yesterday" expects. The tab ran
 * in feed order only because it was a filter over the feed.
 *
 * Bookmarks are private. The loader takes the viewer's id and nothing else, so
 * there is no way to ask it for another member's list; the profile page calls it
 * only when the viewer is looking at their own profile.
 */
import { or } from '@prisma/orm-postgres/orm-client';
import { db, hasDatabase } from './prisma';
import { sharedProfileCardData } from './profile';

type BookmarkRef = { id?: number | null; postId: number; createdAt?: Date | string | null };
type SavedPostRow = { id: number; userId: number; scheduledAt?: Date | string | null };

const timeOf = (value: Date | string | null | undefined): number => {
  if (!value) return 0;
  const at = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(at) ? at : 0;
};

/**
 * Which saved posts are listed, and in what order. Pure, so the rules above are
 * testable without a database.
 *
 * Most recently saved first; two saves at the same instant fall back to the
 * bookmark id, newest row first, so the order never depends on how the database
 * happened to return the rows. A bookmark whose post is not among `posts` (it was
 * deleted between the two reads) is skipped, and a post bookmarked twice — the
 * table has no unique constraint — is listed once, at its most recent save.
 */
export function orderSavedPosts<T extends SavedPostRow>(
  bookmarks: readonly BookmarkRef[],
  posts: readonly T[],
  options: { hiddenAuthorIds?: ReadonlySet<number>; now?: number } = {},
): T[] {
  const hidden = options.hiddenAuthorIds ?? new Set<number>();
  const now = options.now ?? Date.now();
  const byId = new Map(posts.map((post) => [post.id, post]));
  const ordered = [...bookmarks].sort((a, b) => {
    const diff = timeOf(b.createdAt) - timeOf(a.createdAt);
    return diff !== 0 ? diff : (b.id ?? 0) - (a.id ?? 0);
  });
  const seen = new Set<number>();
  const result: T[] = [];
  for (const bookmark of ordered) {
    if (seen.has(bookmark.postId)) continue;
    seen.add(bookmark.postId);
    const post = byId.get(bookmark.postId);
    if (!post) continue;
    if (hidden.has(post.userId)) continue;
    if (post.scheduledAt && timeOf(post.scheduledAt) > now) continue;
    result.push(post);
  }
  return result;
}

export type SavedPosts = {
  /** False when the list could not be read; the section says so instead of "none". */
  ok: boolean;
  /** Posts ready for `Post.tsx`: author, likes, thread, poll, group, repost. */
  posts: any[];
};

const unique = (values: (number | null | undefined)[]): number[] =>
  [...new Set(values.filter((value): value is number => typeof value === 'number'))];

/**
 * The viewer's saved posts, enriched the way the home feed enriches a post so the
 * same card renders the same content: author, likes with their people, the thread
 * oldest first, an attached poll with this viewer's vote, the group it was posted
 * in, a shared profile card, and the original of a repost.
 *
 * Every query is bounded by the posts this viewer saved — nothing here reads a
 * whole table. Never throws: a database that is missing or fails yields
 * `ok: false` and an empty list, and the profile renders without the section's
 * contents rather than failing.
 */
export async function loadSavedPosts(
  viewerId: number | null | undefined,
  options: { viewerFollowIds?: ReadonlySet<number> } = {},
): Promise<SavedPosts> {
  if (!hasDatabase || !viewerId) return { ok: true, posts: [] };
  const follows = options.viewerFollowIds ?? new Set<number>();
  try {
    const bookmarks = await db.orm.public.Bookmark.where({ userId: viewerId }).all();
    const savedIds = unique(bookmarks.map((bookmark) => bookmark.postId));
    if (!savedIds.length) return { ok: true, posts: [] };

    const [savedRows, blocks, mutes] = await Promise.all([
      db.orm.public.Post.where((m) => m.id.in(savedIds)).all(),
      db.orm.public.Block.where((m) => or(m.blockerId.eq(viewerId), m.blockedId.eq(viewerId))).all(),
      db.orm.public.Mute.where({ muterId: viewerId }).all(),
    ]);
    const hiddenAuthorIds = new Set<number>([
      ...blocks.map((block) => (block.blockerId === viewerId ? block.blockedId : block.blockerId)),
      ...mutes.map((mute) => mute.mutedId),
    ]);
    const saved = orderSavedPosts(bookmarks, savedRows, { hiddenAuthorIds });
    if (!saved.length) return { ok: true, posts: [] };

    const postIds = saved.map((post) => post.id);
    const originalIds = unique(saved.map((post) => post.repostOfId)).filter((id) => !postIds.includes(id));
    const groupIds = unique(saved.map((post) => post.groupId));

    const [originals, likes, comments, polls, groups] = await Promise.all([
      originalIds.length ? db.orm.public.Post.where((m) => m.id.in(originalIds)).all() : [],
      db.orm.public.Like.where((m) => m.postId.in(postIds)).all(),
      db.orm.public.Comment.where((m) => m.postId.in(postIds)).orderBy((o) => o.createdAt.asc()).all(),
      db.orm.public.Poll.where((m) => m.postId.in(postIds)).all(),
      groupIds.length ? db.orm.public.Group.where((m) => m.id.in(groupIds)).all() : [],
    ]);
    const pollIds = polls.map((poll) => poll.id);
    const [pollOptions, pollVotes] = pollIds.length
      ? await Promise.all([
          db.orm.public.PollOption.where((m) => m.pollId.in(pollIds)).all(),
          db.orm.public.PollVote.where((m) => m.pollId.in(pollIds)).all(),
        ])
      : [[], []];

    const userIds = unique([
      ...saved.map((post) => post.userId),
      ...saved.map((post) => post.sharedProfileId),
      ...originals.map((post) => post.userId),
      ...likes.map((like) => like.userId),
      ...comments.map((comment) => comment.userId),
    ]);
    const users = userIds.length ? await db.orm.public.User.where((m) => m.id.in(userIds)).all() : [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const savedById = new Map(saved.map((post) => [post.id, post]));
    const originalsById = new Map(originals.map((post) => [post.id, post]));

    const pollFor = (postId: number) => {
      const poll = polls.find((candidate) => candidate.postId === postId);
      if (!poll) return null;
      const vote = pollVotes.find((candidate) => candidate.pollId === poll.id && candidate.userId === viewerId);
      return {
        id: poll.id,
        question: poll.question,
        expiresAt: poll.expiresAt,
        options: pollOptions
          .filter((option) => option.pollId === poll.id)
          .sort((a, b) => a.position - b.position)
          .map((option) => ({
            id: option.id,
            text: option.text,
            votesCount: pollVotes.filter((candidate) => candidate.optionId === option.id).length,
          })),
        userVotedOptionId: vote?.optionId || null,
      };
    };

    const posts = saved.map((post) => {
      // The original of a repost is shown quoted inside the card. One the viewer
      // may not see — its author is blocked or muted — is not quoted.
      const original = post.repostOfId ? savedById.get(post.repostOfId) ?? originalsById.get(post.repostOfId) : null;
      return {
        ...post,
        poll: pollFor(post.id),
        user: usersById.get(post.userId),
        sharedProfile: post.sharedProfileId
          ? sharedProfileCardData(usersById.get(post.sharedProfileId), {
              viewerId,
              isFollower: follows.has(post.sharedProfileId),
            })
          : null,
        group: post.groupId ? groupsById.get(post.groupId) || null : null,
        likes: likes
          .filter((like) => like.postId === post.id)
          .map((like) => ({ ...like, user: usersById.get(like.userId) })),
        comments: comments
          .filter((comment) => comment.postId === post.id)
          .map((comment) => ({ ...comment, user: usersById.get(comment.userId) })),
        ...(original && !hiddenAuthorIds.has(original.userId)
          ? { repostOf: { ...original, user: usersById.get(original.userId) } }
          : {}),
      };
    });
    return { ok: true, posts };
  } catch (error) {
    console.warn('[saved-posts] could not read saved posts:', (error as Error)?.message);
    return { ok: false, posts: [] };
  }
}
