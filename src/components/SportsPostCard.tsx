'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ThumbsUp,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Bookmark,
  BookmarkCheck,
  Copy,
  Check,
  Maximize2,
  Send,
  X,
} from 'lucide-react';
import { commentOnSportsAnchor, likeSportsAnchor, saveSportsAnchor, shareSportsAnchor } from '@/app/sports-actions';
import type { SportsAnchorEngagement, SportsAnchorRef } from '@/lib/sports-anchor';

/**
 * A sports item as a post.
 *
 * This is the feed's own post card (`src/components/Post.tsx`) with the sports
 * parts passed in: the author image (a team crest), the author name (a player
 * or a fixture), the body line, the media block, the detail strip under the
 * image, and the Like / Comment / Share row. The players board and the match
 * highlights board both render through this component, so a card looks the same
 * wherever a sport appears on the site.
 *
 * The engagement is real. A card is provider data with no post behind it, so the
 * first like, comment, save or share creates its *anchor post* — one post per
 * card, authored by the Hyper Sports desk — and from then on the counts, the
 * thread, the Saved tab, the repost and the `/post/[id]` permalink are the same
 * ones a member's post uses. Like `Post.tsx`, the controls are form actions: the
 * server responds, the page revalidates, and the numbers come back from the
 * database rather than from local state that a reload would erase.
 *
 * A card that cannot be anchored — a sample board while ESPN is unreachable, no
 * database, or a signed-out visitor — keeps its layout and says so instead of
 * pretending: the controls are disabled and the note under them explains why.
 *
 * The whole card is clickable through a card-wide link; every control sits
 * above it and keeps its own behaviour.
 */

export type SportsPostDetail = { label: string; value: string };

const rowButton = 'flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 font-semibold transition-colors';

export default function SportsPostCard({
  href,
  authorHref,
  authorImage,
  authorName,
  authorFallback,
  title,
  subtitle,
  body,
  media,
  details,
  likeLabel,
  footnote,
  permalink,
  onExpand,
  menuLinks,
  anchor = null,
  engagement = null,
  signedIn = false,
}: {
  /** Where the card goes when it is clicked. */
  href: string;
  /** Where the author image goes - the team or competition page. */
  authorHref: string;
  authorImage: string | null;
  authorName: string;
  /** Shown when there is no crest, exactly like a member without an avatar. */
  authorFallback: string;
  title: string;
  subtitle: string;
  body: string;
  media: React.ReactNode;
  details: SportsPostDetail[];
  /** Accessible name for the Like button, e.g. "Like Luka Dončić". */
  likeLabel: string;
  /** Small print under the composer, when the card needs to be explicit. */
  footnote?: string;
  /**
   * A labelled link to the card's own page, when the subject has one.
   *
   * The card-wide link goes wherever the card goes — a fixture's board, a match —
   * and the menu's links only exist in the DOM once a reader opens it, so neither
   * is a way for a crawler to reach the page about this one subject. This is: one
   * visible link, above the card-wide one so it stays clickable.
   */
  permalink?: { href: string; label: string };
  /** Lets the share menu offer the image in the post lightbox. The caller owns
      the lightbox, so it can expand whatever media the card is showing. */
  onExpand?: () => void;
  /** Extra destinations in the more menu, e.g. the player profile. */
  menuLinks?: { label: string; href: string }[];
  /** The card's identity, so engagement can find or create its anchor post. */
  anchor?: SportsAnchorRef | null;
  /** Saved likes, comments and bookmark for this viewer, loaded by the page. */
  engagement?: SportsAnchorEngagement | null;
  /** Guests can read every card but cannot engage with one. */
  signedIn?: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const postId = engagement?.postId ?? null;
  const liked = engagement?.viewerLiked ?? false;
  const cheers = engagement?.likesCount ?? 0;
  const saved = engagement?.viewerSaved ?? false;
  const comments = engagement?.comments ?? [];
  const commentCount = engagement?.commentsCount ?? comments.length;
  // A sample board has no anchor, and a guest has no account to attribute one
  // to; both keep the card read-only rather than faking a result.
  const canEngage = !!anchor && signedIn;

  const copyLink = async () => {
    const url = typeof window === 'undefined' ? href : `${window.location.origin}${href}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // The share menu also carries the link as text, so a denied clipboard is
      // not an error the reader has to act on.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const engagementNote = !anchor
    ? 'Engagement is unavailable on sample cards. It returns with the live feed.'
    : !signedIn
      ? 'Sign in to like, comment on, save and share this card.'
      : postId
        ? 'Likes and comments are saved to your account and visible to everyone.'
        : 'Your first like, comment or save opens the discussion post for this card.';

  return (
    <article className="relative bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-100 dark:border-gray-700/60 overflow-hidden transition-all">
      {/* The card itself is clickable, exactly like a post in the feed. The
          controls below sit above it, so they keep their own behaviour. */}
      <Link href={href} className="absolute inset-0 z-0" aria-label={title} />

      {/* Author header - the crest stands in for the user image. */}
      <div className="p-4 flex items-center justify-between relative gap-2">
        <div className="flex items-center space-x-3 min-w-0">
          <Link href={authorHref} className="shrink-0 relative z-10" aria-label={`Team profile: ${authorName}`}>
            {authorImage ? (
              <img
                src={authorImage}
                alt={authorName}
                className="w-10 h-10 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                loading="lazy"
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm">
                {authorFallback}
              </div>
            )}
          </Link>
          <div className="min-w-0">
            <Link href={href} className="relative z-10 font-bold text-gray-900 dark:text-white hover:underline text-sm truncate block">
              {title}
            </Link>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</div>
          </div>
        </div>

        {/* More options */}
        <div className="relative z-10 shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 transition-colors"
            aria-label="More options"
            aria-expanded={showMenu}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 z-30 animate-fade-in">
              {postId && (
                <Link
                  href={`/post/${postId}`}
                  onClick={() => setShowMenu(false)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                >
                  <MessageCircle className="w-4 h-4 text-gray-500" />
                  <span>Open discussion</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => { setShowMenu(false); void copyLink(); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
              </button>
              {(menuLinks ?? []).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setShowMenu(false)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                >
                  <Maximize2 className="w-4 h-4 text-gray-500" />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Post text content - the item's line. */}
      <div className="px-4 pb-3 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {body}
      </div>

      {/* Attached media - the post image/video block, supplied by the caller. */}
      {media}

      {/* Details, below the media. */}
      <dl className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-700 border-b border-gray-100 dark:border-gray-700">
        {details.map((detail) => (
          <div key={detail.label} className="px-3 py-2 text-center min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">{detail.label}</dt>
            <dd className="text-sm font-bold text-gray-900 dark:text-white truncate">{detail.value}</dd>
          </div>
        ))}
      </dl>

      {permalink ? (
        <div className="relative z-10 px-4 py-1.5 text-xs">
          <Link
            href={permalink.href}
            className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            {permalink.label}
          </Link>
        </div>
      ) : null}

      {/* Post metrics row */}
      <div className="relative z-10 px-4 py-2 flex items-center justify-between gap-3 text-gray-500 dark:text-gray-400 text-xs border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center space-x-1.5 min-w-0">
          <div className="bg-blue-600 rounded-full p-1 shadow-sm shrink-0">
            <ThumbsUp className="w-2.5 h-2.5 text-white fill-white" />
          </div>
          <span className="font-semibold text-gray-700 dark:text-gray-300 truncate">
            {cheers} {cheers === 1 ? 'cheer' : 'cheers'}
          </span>
        </div>
        <div className="flex space-x-4 shrink-0">
          {postId ? (
            <Link href={`/post/${postId}`} className="relative z-10 hover:underline cursor-pointer font-medium">
              {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setShowComments(!showComments)}
              className="hover:underline cursor-pointer font-medium"
            >
              {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </button>
          )}
        </div>
      </div>

      {/* Action buttons row - Like, Comment, Share and save, as on a post. */}
      <div className="relative px-2 py-1 flex items-center justify-between text-sm">
        {canEngage ? (
          <form action={likeSportsAnchor.bind(null, anchor!.kind, anchor!.id)} className="flex-1 min-w-0">
            <button
              type="submit"
              aria-label={likeLabel}
              aria-pressed={liked}
              className={`${rowButton} w-full ${liked ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}`}
            >
              <ThumbsUp className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
              <span className="hidden min-[360px]:inline">{liked ? 'Liked' : 'Like'}</span>
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled
            aria-label={likeLabel}
            aria-pressed={liked}
            className={`${rowButton} text-gray-400 dark:text-gray-500 disabled:cursor-not-allowed`}
          >
            <ThumbsUp className="w-4 h-4" />
            <span className="hidden min-[360px]:inline">Like</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          aria-label={`Comment on ${title}`}
          aria-expanded={showComments}
          className={`${rowButton} text-gray-600 dark:text-gray-300`}
        >
          <MessageCircle className="w-4 h-4" />
          <span className="hidden min-[360px]:inline">Comment</span>
        </button>

        <button
          type="button"
          onClick={() => setShowShare(!showShare)}
          aria-label={`Share ${title}`}
          aria-expanded={showShare}
          className={`${rowButton} text-gray-600 dark:text-gray-300`}
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden min-[360px]:inline">Share</span>
        </button>

        {canEngage ? (
          <form action={saveSportsAnchor.bind(null, anchor!.kind, anchor!.id)} className="shrink-0">
            <button
              type="submit"
              title={saved ? 'Remove Save' : 'Save'}
              aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
              aria-pressed={saved}
              className={`px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors ${saved ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
            >
              {saved ? <BookmarkCheck className="w-4 h-4 fill-current" /> : <Bookmark className="w-4 h-4" />}
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled
            title="Save"
            aria-label={`Save ${title}`}
            aria-pressed={saved}
            className="px-3 py-2 rounded-lg text-gray-400 dark:text-gray-500 disabled:cursor-not-allowed"
          >
            <Bookmark className="w-4 h-4" />
          </button>
        )}

        {showShare && (
          <div className="absolute right-2 bottom-full mb-1 z-30 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 animate-fade-in">
            <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Share this</p>
            {canEngage && (
              <form action={shareSportsAnchor.bind(null, anchor!.kind, anchor!.id)} className="px-3 pb-2">
                <label className="sr-only" htmlFor={`share-note-${anchor!.id}`}>Add a note to your repost</label>
                <input
                  id={`share-note-${anchor!.id}`}
                  name="note"
                  type="text"
                  maxLength={500}
                  placeholder="Add a note (optional)"
                  className="mb-1.5 w-full rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <button
                  type="submit"
                  className="flex w-full items-center justify-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  <Send className="w-4 h-4" />
                  <span>Share to your feed</span>
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => void copyLink()}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
              <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
            </button>
            {onExpand && (
              <button
                type="button"
                onClick={() => { setShowShare(false); onExpand(); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                <Maximize2 className="w-4 h-4 text-gray-500" />
                <span>Expand Image</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowShare(false)}
              className="w-full px-4 py-2 text-left text-sm text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        )}
      </div>

      {/* The saved thread, then the composer. Both belong to the anchor post, so
          a comment written here is the one everyone else reads. `relative z-10`
          keeps the thread and the input above the card-wide link. */}
      {showComments && (
        <div className="relative z-10 px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 bg-gray-50/50 dark:bg-gray-900/30">
          <div className="space-y-3 mb-3">
            {comments.map((comment) => (
              <div key={comment.id} className="flex space-x-2">
                {comment.author.avatar ? (
                  <img src={comment.author.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" loading="lazy" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 mt-1">
                    {comment.author.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="bg-gray-100 dark:bg-gray-700/80 rounded-2xl px-3.5 py-2 inline-block max-w-full">
                    <Link href={`/profile/${comment.author.id}`} className="relative z-10 font-bold text-xs text-gray-900 dark:text-white hover:underline">
                      {comment.author.name}
                    </Link>
                    <div className="text-sm text-gray-800 dark:text-gray-200 break-words mt-0.5">{comment.content}</div>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1 ml-2">
                    <Link href={postId ? `/post/${postId}` : href} className="relative z-10 hover:underline">
                      {new Date(comment.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {postId ? 'No comments yet. Be the first to react to this.' : 'No comments on this card yet.'}
              </p>
            )}
          </div>

          {canEngage ? (
            <form action={commentOnSportsAnchor.bind(null, anchor!.kind, anchor!.id)} className="flex space-x-2 items-center">
              {/* A neutral marker, not an invented initial: the card is handed
                  the feed's data, not the viewer's profile. */}
              <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  name="content"
                  required
                  maxLength={2000}
                  placeholder="Write a comment..."
                  aria-label={`Write a comment about ${title}`}
                  className="bg-gray-100 dark:bg-gray-700 rounded-full py-2 pl-4 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm text-gray-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-gray-700/60"
                >
                  Post
                </button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {signedIn ? 'Comments open when this card has a live feed behind it.' : 'Sign in to join this conversation.'}
            </p>
          )}
          <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">{engagementNote}</p>
          {footnote && (
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{footnote}</p>
          )}
        </div>
      )}
    </article>
  );
}
