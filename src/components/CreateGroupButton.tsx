'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createGroup } from '@/app/actions';
import { Plus, Users, X, LoaderCircle } from 'lucide-react';
import GroupCoverField from '@/components/GroupCoverField';
import { GROUP_CATEGORIES } from '@/lib/profile';

/**
 * "Create Group" button + modal form. The server action creates the group,
 * auto-joins the creator as admin, and revalidates the groups pages.
 */
export default function CreateGroupButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (open) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = orig; };
    }
  }, [open]);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverPhoto, setCoverPhoto] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please give your group a name.');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('name', name.trim());
      fd.set('description', description.trim());
      fd.set('coverPhoto', coverPhoto.trim());
      fd.set('privacy', privacy);
      fd.set('category', category);
      const created = await createGroup(fd);
      setOpen(false);
      setName(''); setDescription(''); setCoverPhoto(''); setPrivacy('public'); setCategory('');
      if (created && typeof (created as any).id === 'number' && (created as any).id < 1e12) {
        router.push(`/groups/${(created as any).id}`);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm shadow-sm transition-colors"
      >
        <Plus className="w-4 h-4" /> Create Group
      </button>

      {open && mounted && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !pending && setOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pinned header — the close button stays in reach while the
                form body scrolls (short viewports, on-screen keyboard). */}
            <div className="relative shrink-0 px-6 pt-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

              <h2
                id="create-group-title"
                className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 pr-10"
              >
                <Users className="text-blue-600 w-6 h-6 shrink-0" /> Create a Group
              </h2>
            </div>

            <div className="overflow-y-auto min-h-0 px-6 pb-6">
            <div className="space-y-3">
              <div>
                <label htmlFor="cg-name" className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Group name *</label>
                <input
                  id="cg-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="e.g. Travel & Adventure ✈️"
                  className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="cg-desc" className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Description</label>
                <textarea
                  id="cg-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="What is this community about?"
                  className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="cg-privacy" className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Privacy</label>
                  <select
                    id="cg-privacy"
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cg-cat" className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Category</label>
                  <select
                    id="cg-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Optional</option>
                    {GROUP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Cover photo <span className="font-normal">(optional)</span></label>
                <GroupCoverField value={coverPhoto} onChange={setCoverPhoto} />
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="mt-5 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {pending && <LoaderCircle className="w-4 h-4 animate-spin" />}
              {pending ? 'Creating…' : 'Create Group'}
            </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  );
}
