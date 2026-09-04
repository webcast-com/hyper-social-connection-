'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { editPost } from '@/app/actions';
import { Pencil, X, LoaderCircle } from 'lucide-react';

const MAX_LEN = 2000;

/**
 * Edit-post dialog — author only (the server action re-checks ownership).
 * On success the parent's local state is updated optimistically so the new
 * text shows instantly, even in demo/offline mode.
 */
export default function EditPostModal({
  post,
  onClose,
  onSaved,
}: {
  post: any;
  onClose: () => void;
  onSaved: (content: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);
  const [value, setValue] = useState<string>(post.content || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const trimmed = value.trim();
  const unchanged = trimmed === (post.content || '').trim();
  const remaining = MAX_LEN - value.length;

  const handleSave = async () => {
    setError('');
    if (!trimmed) {
      setError('Post content cannot be empty.');
      return;
    }
    if (value.length > MAX_LEN) {
      setError(`Post is too long — ${MAX_LEN} characters max.`);
      return;
    }
    setLoading(true);
    try {
      const result = await editPost(post.id, trimmed);
      if (result && !result.success) {
        setError(result.message || 'Could not save your changes.');
        return;
      }
      onSaved(trimmed);
      onClose();
    } catch {
      setError('Could not save your changes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-post-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned header — the close button stays in reach while the body
            scrolls (keyboard + small viewports). */}
        <div className="relative shrink-0 px-6 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close edit dialog"
          >
            <X className="w-5 h-5" />
          </button>

          <h2
            id="edit-post-title"
            className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 pr-10"
          >
            <Pencil className="text-blue-600 w-5 h-5 shrink-0" /> Edit Post
          </h2>
        </div>

        <div className="overflow-y-auto min-h-0 px-6 pb-6">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={6}
          autoFocus
          placeholder="What's on your mind?"
          className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[120px]"
        />

        <div className="flex items-center justify-between mt-2">
          <span className={`text-[11px] font-mono ${remaining < 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {remaining.toLocaleString()} characters left
          </span>
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !trimmed || unchanged || remaining < 0}
            className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-sm transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {loading && <LoaderCircle className="w-4 h-4 animate-spin" />}
            <span>{loading ? 'Saving…' : 'Save changes'}</span>
          </button>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
