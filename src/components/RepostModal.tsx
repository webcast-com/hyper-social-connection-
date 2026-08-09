'use client';

import { useState } from 'react';
import { repostPost } from '@/app/actions';
import { Repeat2, MessageSquareQuote, Check, Copy, X, LoaderCircle } from 'lucide-react';

export default function RepostModal({
  post,
  currentUser,
  onClose,
}: {
  post: any;
  currentUser: any;
  onClose: () => void;
}) {
  const [quoteText, setQuoteText] = useState('');
  const [mode, setMode] = useState<'options' | 'quote'>('options');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleQuickRepost = async () => {
    setLoading(true);
    try {
      await repostPost(post.id, '');
      onClose();
    } catch {
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleQuoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await repostPost(post.id, quoteText);
      onClose();
    } catch {
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    const postUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/profile/${post.user?.id || post.userId}#post-${post.id}`
      : `/profile/${post.user?.id || post.userId}#post-${post.id}`;
    
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-gray-100 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id="share-modal-title" className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Repeat2 className="text-blue-600 w-6 h-6" /> Share Post
        </h2>

        {mode === 'options' ? (
          <div className="space-y-3">
            <button
              type="button"
              disabled={loading}
              onClick={handleQuickRepost}
              className="w-full flex items-center space-x-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all text-left group"
            >
              <div className="p-3 bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-xl group-hover:scale-110 transition-transform">
                <Repeat2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white">Repost now</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Instantly share this post to your followers' feeds.</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('quote')}
              className="w-full flex items-center space-x-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-all text-left group"
            >
              <div className="p-3 bg-purple-100 dark:bg-purple-800 text-purple-600 dark:text-purple-300 rounded-xl group-hover:scale-110 transition-transform">
                <MessageSquareQuote className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white">Quote with thoughts</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Add your own commentary before sharing.</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full flex items-center space-x-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-green-50 dark:hover:bg-green-900/30 transition-all text-left group"
            >
              <div className="p-3 bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-300 rounded-xl group-hover:scale-110 transition-transform">
                {copied ? <Check className="w-6 h-6 text-green-600" /> : <Copy className="w-6 h-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {copied ? 'Link Copied!' : 'Copy post link'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {copied ? 'Copied link directly to your clipboard' : 'Get a shareable link to this post.'}
                </div>
              </div>
            </button>
          </div>
        ) : (
          <form onSubmit={handleQuoteSubmit} className="space-y-4">
            <div className="flex items-center space-x-3">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt="You" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                  {currentUser.name?.charAt(0) || 'U'}
                </div>
              )}
              <div>
                <div className="font-semibold text-sm text-gray-900 dark:text-white">{currentUser.name}</div>
                <div className="text-xs text-gray-500">Posting publicly</div>
              </div>
            </div>

            <textarea
              value={quoteText}
              onChange={(e) => setQuoteText(e.target.value)}
              placeholder="What are your thoughts on this post?"
              rows={3}
              className="w-full text-base p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />

            {/* Embedded Post Preview */}
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 mb-1">
                {post.user?.avatar ? (
                  <img src={post.user.avatar} alt="author" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                    {post.user?.name?.charAt(0) || '?'}
                  </div>
                )}
                <span className="font-semibold text-xs text-gray-900 dark:text-white">{post.user?.name}</span>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{post.content}</p>
              {post.imageUrl && (
                <img src={post.imageUrl} alt="attached" className="mt-2 rounded-lg max-h-32 w-full object-cover" />
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMode('options')}
                className="py-2.5 px-4 rounded-xl border border-gray-300 dark:border-gray-600 font-medium text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : 'Post Quote'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
