import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/db';
import { posts, users, likes, comments, bookmarks, polls, pollOptions, pollVotes, groups } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import Post from '@/components/Post';

/**
 * Single-post permalink page (/post/[id]).
 *
 * Target of "Copy Link" on posts and of like/comment notifications. Uses the
 * exact same enrichment pipeline as the home feed (author, likers with
 * avatars, comments, poll, embedded repost), rendered through the shared
 * <Post> component so every interaction behaves like in the feed.
 */

type Params = { params: Promise<{ id: string }> };

function parsePostId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Small shared loader so page + metadata don't diverge. */
async function loadPost(postId: number) {
  if (!hasDatabase) return null;
  try {
    const rows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    return rows[0] || null;
  } catch (err) {
    console.warn('[post] DB query failed:', (err as Error)?.message);
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const postId = parsePostId(id);
  if (!postId) return { title: 'Post — Hyper' };
  const post = await loadPost(postId);
  if (!post) return { title: 'Post — Hyper' };
  const snippet = (post.content || '').replace(/\s+/g, ' ').slice(0, 60);
  return {
    title: `${snippet}${(post.content || '').length > 60 ? '…' : ''} — Hyper`,
    description: post.content?.slice(0, 160) || 'See this post on Hyper.',
  };
}

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  const postId = parsePostId(id);
  const viewer = await getViewer();
  const currentUser = viewer || null;

  let post: any = null;
  let dbError = false;

  if (postId && hasDatabase) {
    try {
      const [row] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (row) {
        const allUsers = await db.select().from(users);
        const usersById = new Map(allUsers.map((u) => [u.id, u]));

        const postLikes = await db.select().from(likes).where(eq(likes.postId, row.id));
        const postComments = await db
          .select()
          .from(comments)
          .where(eq(comments.postId, row.id))
          .orderBy(desc(comments.createdAt));

        let postPoll: any = null;
        const [pollRow] = await db.select().from(polls).where(eq(polls.postId, row.id)).limit(1);
        if (pollRow) {
          const opts = await db.select().from(pollOptions).where(eq(pollOptions.pollId, pollRow.id));
          const votes = await db.select().from(pollVotes).where(eq(pollVotes.pollId, pollRow.id));
          const userVote = votes.find((v) => v.userId === currentUser?.id);
          postPoll = {
            id: pollRow.id,
            question: pollRow.question,
            expiresAt: pollRow.expiresAt,
            options: opts
              .sort((a, b) => a.position - b.position)
              .map((opt) => ({
                id: opt.id,
                text: opt.text,
                votesCount: votes.filter((v) => v.optionId === opt.id).length,
              })),
            userVotedOptionId: userVote?.optionId || null,
          };
        }

        // Embedded original for reposts.
        let repostOf: any = null;
        if (row.repostOfId) {
          const [orig] = await db.select().from(posts).where(eq(posts.id, row.repostOfId)).limit(1);
          if (orig) repostOf = { ...orig, user: usersById.get(orig.userId) };
        }

        // Group badge (posts can belong to a community).
        let postGroup: any = null;
        if (row.groupId) {
          const [g] = await db.select().from(groups).where(eq(groups.id, row.groupId)).limit(1);
          if (g) postGroup = { id: g.id, name: g.name };
        }

        post = {
          ...row,
          user: usersById.get(row.userId),
          group: postGroup,
          poll: postPoll,
          likes: postLikes.map((l) => ({ ...l, user: usersById.get(l.userId) })),
          comments: postComments
            .map((c) => ({ ...c, user: usersById.get(c.userId) }))
            .reverse(),
          repostOf,
        };
      }
    } catch (err) {
      console.warn('[post] DB query failed:', (err as Error)?.message);
      dbError = true;
    }
  }

  let bookmarked = false;
  if (post && currentUser?.id) {
    try {
      const b = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, currentUser.id));
      bookmarked = b.some((bk) => bk.postId === post.id);
    } catch {
      bookmarked = false;
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full p-4 space-y-4">
      <Link
        href="/"
        className="inline-flex items-center space-x-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to feed</span>
      </Link>

      {post ? (
        <Post post={post} currentUser={currentUser || { id: 0 }} isBookmarked={bookmarked} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 p-10 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Compass className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            This post isn&apos;t available
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {!postId
              ? 'The link is malformed.'
              : !hasDatabase
                ? 'The app is running in offline/demo mode, so individual post links are not available.'
                : dbError
                  ? 'The database could not be reached. Please try again in a moment.'
                  : 'It may have been deleted, or the link is incorrect.'}
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 px-6 rounded-full shadow-sm transition-colors"
          >
            Go to the feed
          </Link>
        </div>
      )}
    </div>
  );
}
