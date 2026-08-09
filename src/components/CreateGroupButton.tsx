'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGroup } from '@/app/actions';
import { Plus, Users, X, LoaderCircle } from 'lucide-react';

/**
 * "Create Group" button + modal form. The server action creates the group,
 * auto-joins the creator as admin, and revalidates the groups pages.
 */
export default function CreateGroupButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverPhoto, setCoverPhoto] = useState('');
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
      const created = await createGroup(fd);
      setOpen(false);
      setName(''); setDescription(''); setCoverPhoto('');
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

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !pending && setOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 id="create-group-title" className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="text-blue-600 w-6 h-6" /> Create a Group
            </h2>

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
              <div>
                <label htmlFor="cg-cover" className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Cover image URL <span className="font-normal">(optional)</span></label>
                <input
                  id="cg-cover"
                  value={coverPhoto}
                  onChange={(e) => setCoverPhoto(e.target.value)}
                  type="url"
                  placeholder="https://…"
                  className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
          </form>
        </div>
      )}
    </>
  );
}
