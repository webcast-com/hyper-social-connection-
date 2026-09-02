'use client';

import { useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  ThumbsUp,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Flag,
  Copy,
  Check,
  Repeat2,
  Maximize2,
  Pencil,
  X,
} from 'lucide-react';
import Link from 'next/link';
import EmojiPicker from './EmojiPicker';
import ReportModal from './ReportModal';
import RepostModal from './RepostModal';
import EditPostModal from './EditPostModal';
import ImageLightbox from './ImageLightbox';
import PostPoll from './PostPoll';
import FormattedContent from './FormattedContent';
import LinkPreviewCard from './LinkPreviewCard';
import LinkMediaPlayer from './LinkMediaPlayer';
import SharedProfileCard from './SharedProfileCard';
import { extractUrls } from '@/lib/link-preview';
import { resolveLinkMedia } from '@/lib/link-media';
import { toggleLike, createComment, toggleBookmark, deletePost, deleteComment } from '@/app/actions';

export default function Post({
  post,
  currentUser,
  isBookmarked = false,
}: {
  post: any;
  currentUser: any;
  isBookmarked?: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [commentValue, setCommentValue] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Optimistic local overrides after an edit (instant even in demo mode).
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [editedMark, setEditedMark] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const isAuthor = currentUser?.id && post.user?.id === currentUser.id;
  const isLiked = (post.likes || []).some((l: any) => l.userId === currentUser.id);
  const postContent = editedContent ?? post.content;
  const wasEdited = editedMark || !!post.updatedAt;
  // Likes enriched with user objects (home feed + permalink); profile pages
  // pass bare like rows, so fall back to the plain count there.
  const likers = (post.likes || []).map((l: any) => l.user).filter(Boolean);
  const detectedUrls = extractUrls(postContent || '');
  // A pasted video/audio/image link plays inline; anything else keeps the
  // existing unfurled link-preview card.
  const firstUrl = detectedUrls[0];
  const linkMedia = firstUrl ? resolveLinkMedia(firstUrl) : null;
  const hasAttachedMedia = !!post.imageUrl || !!post.videoUrl;

  const handleEmojiSelect = (emoji: string) => {
    setCommentValue((prev) => prev + emoji);
    setShowEmoji(false);
  };

  const handleBookmarkToggle = async () => {
    setBookmarked(!bookmarked);
    await toggleBookmark(post.id);
  };

  const handleDeletePost = async () => {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    setDeleting(true);
    await deletePost(post.id);
  };

  const handleCopyLink = async () => {
    const postUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/post/${post.id}`
      : `/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (deleting) {
    return null;
  }

  return (
    <article id={`post-${post.id}`} className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-100 dark:border-gray-700/60 overflow-hidden transition-all">
      {/* If this is a repost, show repost banner */}
      {post.sharedProfile && !post.repostOf && (
        <div className="bg-blue-50/70 dark:bg-blue-900/20 px-4 py-2 border-b border-blue-100 dark:border-blue-800/40 flex items-center space-x-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
          <Share2 className="w-4 h-4 text-blue-500" />
          <span>{post.user?.name || 'Someone'} shared a profile</span>
        </div>
      )}

      {post.repostOf && (
        <div className="bg-blue-50/70 dark:bg-blue-900/20 px-4 py-2 border-b border-blue-100 dark:border-blue-800/40 flex items-center space-x-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
          <Repeat2 className="w-4 h-4 text-blue-500" />
          <span>
            {post.user?.name || 'Someone'} shared this
          </span>
        </div>
      )}

      {/* Post Author Header */}
      <div className="p-4 flex items-center justify-between relative">
        <div className="flex items-center space-x-3 min-w-0">
          <Link href={`/profile/${post.user?.id || post.userId}`} className="shrink-0">
            {post.user?.avatar ? (
              <img src={post.user.avatar} alt={post.user.name} className="w-10 h-10 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700" />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm">
                {post.user?.name?.charAt(0) || 'U'}
              </div>
            )}
          </Link>
          <div className="min-w-0">
            <Link href={`/profile/${post.user?.id || post.userId}`} className="font-bold text-gray-900 dark:text-white hover:underline text-sm truncate block">
              {post.user?.name || 'Hyper Member'}
            </Link>
            <div className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
              {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : 'Just now'}
              {wasEdited && (
                <span className="italic text-gray-400 dark:text-gray-500" title="This post was edited">
                  {' '}· Edited
                </span>
              )}
              {post.group && (
                <span title={`Posted in ${post.group.name}`}>
                  {' '}· in{' '}
                  <Link
                    href={`/groups/${post.group.id}`}
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {post.group.name}
                  </Link>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* More Options Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 transition-colors"
            aria-label="More post options"
            aria-expanded={showMenu}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 z-30 animate-fade-in">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  handleBookmarkToggle();
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                {bookmarked ? (
                  <>
                    <BookmarkCheck className="w-4 h-4 text-blue-600" />
                    <span>Remove Bookmark</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4 text-gray-500" />
                    <span>Save / Bookmark</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  handleCopyLink();
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    <span>Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-gray-500" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>

              {isAuthor && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    setShowEdit(true);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                >
                  <Pencil className="w-4 h-4 text-gray-500" />
                  <span>Edit Post</span>
                </button>
              )}

              {isAuthor ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    handleDeletePost();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span>Delete Post</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    setShowReport(true);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center space-x-2"
                >
                  <Flag className="w-4 h-4 text-red-500" />
                  <span>Report Post</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Post Text Content */}
      <div className="px-4 pb-3 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        <FormattedContent content={postContent} />
      </div>

      {/* Shared profile card (post created via "share profile") */}
      {post.sharedProfile && (
        <div className="px-4 pb-1">
          <SharedProfileCard profile={post.sharedProfile} />
        </div>
      )}

      {/* Interactive Poll (if present) */}
      {post.poll && (
        <div className="px-4">
          <PostPoll poll={post.poll} currentUser={currentUser} />
        </div>
      )}

      {/* Playable link (video / audio / image) — rendered in-app. Falls back
          to the rich link preview card for ordinary web pages. */}
      {!hasAttachedMedia && firstUrl && (
        <div className="px-3 sm:px-4 min-w-0 overflow-hidden">
          {linkMedia ? (
            <LinkMediaPlayer url={firstUrl} media={linkMedia} />
          ) : (
            <LinkPreviewCard url={firstUrl} previewData={post.linkPreview} />
          )}
        </div>
      )}

      {/* Post Attached Media */}
      {post.imageUrl && (
        <div className="relative group cursor-pointer bg-gray-900/5 dark:bg-black/40 overflow-hidden" onClick={() => setShowLightbox(true)}>
          <img
            src={post.imageUrl}
            alt="Post media"
            className="w-full object-contain max-h-[520px] transition-transform duration-300 group-hover:scale-[1.01]"
            loading="lazy"
          />
          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 text-xs">
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Expand</span>
          </div>
        </div>
      )}

      {post.videoUrl && (
        <div className="bg-black w-full min-w-0 overflow-hidden">
          <video
            src={post.videoUrl}
            controls
            playsInline
            preload="metadata"
            className="block w-full max-h-[min(70vh,520px)] object-contain bg-black"
          />
        </div>
      )}

      {/* Nested Repost Card Preview (if quote/repost of another post) */}
      {post.repostOf && (
        <div className="mx-4 mb-3 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
          <div className="flex items-center space-x-2 mb-1.5">
            {post.repostOf.user?.avatar ? (
              <img src={post.repostOf.user.avatar} alt="author" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                {post.repostOf.user?.name?.charAt(0) || '?'}
              </div>
            )}
            <span className="font-bold text-xs text-gray-900 dark:text-white">{post.repostOf.user?.name}</span>
          </div>
          <div className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
            <FormattedContent content={post.repostOf.content} />
          </div>
          {post.repostOf.imageUrl && (
            <img src={post.repostOf.imageUrl} alt="attached" className="mt-2 rounded-lg max-h-40 w-full object-cover" />
          )}
        </div>
      )}

      {/* Post Metrics Row */}
      <div className="px-4 py-2 flex items-center justify-between text-gray-500 dark:text-gray-400 text-xs border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center space-x-1.5 min-w-0">
          <div className="bg-blue-600 rounded-full p-1 shadow-sm shrink-0">
            <ThumbsUp className="w-2.5 h-2.5 text-white fill-white" />
          </div>
          {likers.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowLikers(true)}
              className="flex items-center space-x-1.5 hover:underline min-w-0"
              aria-label="See who liked this post"
            >
              {/* Stacked liker avatars */}
              <span className="flex -space-x-1.5 shrink-0">
                {likers.slice(0, 3).map((u: any, i: number) =>
                  u.avatar ? (
                    <img
                      key={`${u.id}-${i}`}
                      src={u.avatar}
                      alt={u.name}
                      className="w-[18px] h-[18px] rounded-full object-cover ring-1 ring-white dark:ring-gray-800"
                    />
                  ) : (
                    <span
                      key={`${u.id}-${i}`}
                      className="w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[8px] font-bold flex items-center justify-center ring-1 ring-white dark:ring-gray-800"
                    >
                      {u.name?.charAt(0) || 'U'}
                    </span>
                  ),
                )}
              </span>
              <span className="font-semibold text-gray-700 dark:text-gray-300 truncate">
                Liked by {likers[0].name}
                {likers.length === 2 && ` and ${likers[1].name}`}
                {likers.length > 2 && `, ${likers[1].name} and ${likers.length - 2} ${likers.length - 2 === 1 ? 'other' : 'others'}`}
              </span>
            </button>
          ) : (
            <span className="font-semibold text-gray-700 dark:text-gray-300">{(post.likes || []).length}</span>
          )}
        </div>
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className="hover:underline cursor-pointer font-medium"
          >
            {(post.comments || []).length} { (post.comments || []).length === 1 ? 'comment' : 'comments' }
          </button>
        </div>
      </div>

      {/* Action Buttons Row — labels drop to icon-only on very narrow phones */}
      <div className="px-2 py-1 flex items-center justify-between text-sm">
        <form action={toggleLike.bind(null, post.id)} className="flex-1">
          <button
            type="submit"
            aria-label="Like this post"
            className={`w-full flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 font-semibold transition-colors ${
              isLiked ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <ThumbsUp className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
            <span className="hidden min-[360px]:inline">Like</span>
          </button>
        </form>

        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          aria-label="Comment on this post"
          className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300 font-semibold transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="hidden min-[360px]:inline">Comment</span>
        </button>

        <button
          type="button"
          onClick={() => setShowShare(true)}
          aria-label="Share this post"
          className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300 font-semibold transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden min-[360px]:inline">Share</span>
        </button>

        <button
          type="button"
          onClick={handleBookmarkToggle}
          title={bookmarked ? 'Remove Bookmark' : 'Save Post'}
          className={`px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors ${
            bookmarked ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
          }`}
          aria-label="Save post"
        >
          {bookmarked ? <BookmarkCheck className="w-4 h-4 fill-current" /> : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

      {/* Expandable Comments Section */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 bg-gray-50/50 dark:bg-gray-900/30">
          <div className="space-y-3 mb-3">
            {(post.comments || []).map((comment: any) => {
              const isCommentAuthor = currentUser?.id && comment.userId === currentUser.id;
              return (
                <div key={comment.id} className="flex space-x-2 group">
                  <Link href={`/profile/${comment.user?.id || comment.userId}`}>
                    {comment.user?.avatar ? (
                      <img src={comment.user.avatar} alt={comment.user.name} className="w-8 h-8 rounded-full object-cover mt-1 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mt-1 text-xs shrink-0">
                        {comment.user?.name?.charAt(0) || 'U'}
                      </div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="bg-gray-100 dark:bg-gray-700/80 rounded-2xl px-3.5 py-2 inline-block max-w-full">
                      <div className="flex items-center justify-between space-x-2">
                        <Link href={`/profile/${comment.user?.id || comment.userId}`} className="font-bold text-xs text-gray-900 dark:text-white hover:underline">
                          {comment.user?.name || 'Hyper user'}
                        </Link>
                        {isCommentAuthor && (
                          <button
                            type="button"
                            onClick={() => deleteComment(comment.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-0.5"
                            title="Delete comment"
                            aria-label="Delete comment"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-gray-800 dark:text-gray-200 break-words mt-0.5">
                        <FormattedContent content={comment.content} />
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1 ml-2" suppressHydrationWarning>
                      {comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comment Input */}
          <div className="flex space-x-2 relative items-center">
            {currentUser?.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                {currentUser?.name?.charAt(0) || 'U'}
              </div>
            )}
            <div className="flex-1 relative">
              <form
                ref={formRef}
                action={async (formData) => {
                  const content = commentValue || (formData.get('content') as string);
                  if (!content.trim()) return;
                  formData.set('content', content);
                  await createComment(post.id, formData);
                  formRef.current?.reset();
                  setCommentValue('');
                }}
                className="flex-1 flex items-center gap-1"
              >
                <input name="content" type="hidden" value={commentValue} />
                <input
                  type="text"
                  value={commentValue}
                  onChange={(e) => setCommentValue(e.target.value)}
                  placeholder="Write a comment..."
                  className="bg-gray-100 dark:bg-gray-700 rounded-full py-2 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm text-gray-900 dark:text-white"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowEmoji(!showEmoji)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-lg hover:scale-110 transition-transform"
                  aria-label="Emoji picker"
                >
                  😊
                </button>
              </form>
              {showEmoji && (
                <div className="absolute bottom-12 left-0 z-30">
                  <EmojiPicker onSelect={handleEmojiSelect} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox full-screen modal */}
      {showLightbox && post.imageUrl && (
        <ImageLightbox
          src={post.imageUrl}
          alt={post.content || 'Post image'}
          onClose={() => setShowLightbox(false)}
        />
      )}

      {/* Repost modal */}
      {showShare && (
        <RepostModal
          post={post}
          currentUser={currentUser}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Edit modal (author only) */}
      {showEdit && (
        <EditPostModal
          post={{ ...post, content: postContent }}
          onClose={() => setShowEdit(false)}
          onSaved={(content) => {
            setEditedContent(content);
            setEditedMark(true);
          }}
        />
      )}

      {/* Likers list modal */}
      {showLikers && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="People who liked this post"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowLikers(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                <ThumbsUp className="w-4 h-4 text-blue-600 fill-blue-600" />
                Liked by {likers.length === 1 ? '1 person' : `${likers.length} people`}
              </h2>
              <button
                type="button"
                onClick={() => setShowLikers(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close likers list"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-2">
              {likers.map((u: any) => (
                <Link
                  key={u.id}
                  href={`/profile/${u.id}`}
                  onClick={() => setShowLikers(false)}
                  className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                >
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {u.name?.charAt(0) || 'U'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">{u.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{u.bio?.slice(0, 40) || 'Hyper user'}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReport && (
        <ReportModal
          postId={post.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </article>
  );
}
