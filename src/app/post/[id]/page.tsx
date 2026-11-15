import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/lib/prisma';
import { sharedProfileCardData } from '@/lib/profile';
import { routeIdFromParam } from '@/lib/route-id';
import { notFound } from 'next/navigation';
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

/** Small shared loader so page + metadata don't diverge. */
async function loadPost(postId: number) {
  if (!hasDatabase) return null;
  try {
    return await db.orm.public.Post
      .where({ id: postId })
      .include('user', (rel) => rel.select('profileVisibility'))
      .include('group', (rel) => rel.select('privacy'))
      .first();
  } catch (err) {
    console.warn('[post] DB query failed:', (err as Error)?.message);
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const postId = routeIdFromParam(id);
  const post = postId ? await loadPost(postId) : null;
  const isPublic = !!post && post.privacy === 'public' && post.user?.profileVisibility === 'public'
    && (!post.group || post.group.privacy === 'public') && (!post.scheduledAt || post.scheduledAt <= new Date());
  const content = isPublic ? post.content.replace(/\s+/g, ' ').trim() : '';
  const snippet = content.slice(0, 60);
  return getPageMetadata({
    title: snippet ? `${snippet}${content.length > 60 ? '…' : ''}` : 'Post',
    description: content.slice(0, 160) || 'View a post on Hyper.',
    path: `/post/${encodeURIComponent(id)}`, type: 'article', index: isPublic,
  });
}

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  const postId = routeIdFromParam(id);
  const viewer = await getViewer();
  const currentUser = viewer || null;

  let post: any = null;
  let dbError = false;
  // Who the viewer follows — gates details on the shared-profile card and
  // in the likers list.
  let viewerFollowIds: number[] = [];

  if (postId && hasDatabase) {
    try {
      const row = await db.orm.public.Post.where({ id: postId }).first();
      if (row) {
        const allUsers = await db.orm.public.User.all();
        const usersById = new Map(allUsers.map((u) => [u.id, u]));

        const postLikes = await db.orm.public.Like.where({ postId: row.id }).all();
        const postComments = await db.orm.public.Comment
          .where({ postId: row.id })
          .orderBy((o) => o.createdAt.desc())
          .all();

        let postPoll: any = null;
        const pollRow = await db.orm.public.Poll.where({ postId: row.id }).first();
        if (pollRow) {
          const opts = await db.orm.public.PollOption.where({ pollId: pollRow.id }).all();
          const votes = await db.orm.public.PollVote.where({ pollId: pollRow.id }).all();
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
          const orig = await db.orm.public.Post.where({ id: row.repostOfId }).first();
          if (orig) repostOf = { ...orig, user: usersById.get(orig.userId) };
        }

        // Group badge (posts can belong to a community).
        let postGroup: any = null;
        if (row.groupId) {
          const g = await db.orm.public.Group.where({ id: row.groupId }).first();
          if (g) postGroup = { id: g.id, name: g.name };
        }

        if (currentUser?.id) {
          const followRows = await db.orm.public.Follow
            .where({ followerId: currentUser.id })
            .select('followingId')
            .all();
          viewerFollowIds = followRows.map((f) => f.followingId);
        }
        const viewerFollowSet = new Set(viewerFollowIds);

        // Profile card attached via "share profile" — the same card the home
        // feed renders, trimmed and gated by the shared profile's visibility.
        let sharedProfile: any = null;
        if (row.sharedProfileId) {
          sharedProfile = sharedProfileCardData(usersById.get(row.sharedProfileId), {
            viewerId: currentUser?.id ?? null,
            isFollower: viewerFollowSet.has(row.sharedProfileId),
          });
        }

        post = {
          ...row,
          user: usersById.get(row.userId),
          group: postGroup,
          sharedProfile,
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
      const b = await db.orm.public.Bookmark.where({ userId: currentUser.id }).select('postId').all();
      bookmarked = b.some((bk) => bk.postId === post.id);
    } catch {
      bookmarked = false;
    }
  }

  // A post that is not there is a 404 — but only when this site knows that. Offline
  // there is nothing to look up, and a database that could not be reached is a
  // transient failure rather than a missing post: neither may tell a crawler the page
  // does not exist, which is why both still render the explanation below at 200.
  // Called outside every try, because it throws to unwind.
  if (hasDatabase && !dbError && !post) notFound();

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
        <Post
          post={post}
          currentUser={currentUser || { id: 0 }}
          isBookmarked={bookmarked}
          viewerFollowIds={viewerFollowIds}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 p-10 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Compass className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            This post isn&apos;t available
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {/* A post that is simply not there is a 404 now, so what is left to
                explain is the two cases where this site cannot tell: no database to
                ask, and one that could not be reached. */}
            {!hasDatabase
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
