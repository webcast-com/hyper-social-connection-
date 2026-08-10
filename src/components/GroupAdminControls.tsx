'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateGroup, deleteGroup } from '@/app/actions';
import { Settings, X, LoaderCircle, Trash2 } from 'lucide-react';

/**
 * Group settings (admin only): edit name / description / cover, or delete the
 * group entirely. Ownership is re-checked in the server actions.
 */
export default function GroupAdminControls({ group }: { group: any }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(group.name || '');
  const [description, setDescription] = useState(group.description || '');
  const [coverPhoto, setCoverPhoto] = useState(group.coverPhoto || '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    setError('');
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('name', name.trim());
      fd.set('description', description.trim());
      fd.set('coverPhoto', coverPhoto.trim());
      const result = await updateGroup(group.id, fd);
      if (result && !result.success) {
        setError(result.message || 'Could not save changes.');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteGroup(group.id);
      if (result && !result.success) {
        setError(result.message || 'Could not delete the group.');
        setConfirmDelete(false);
        return;
      }
      router.push('/groups');
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
      >
        <Settings className="w-4 h-4" /> Group settings
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-settings-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !pending && setOpen(false)}
        >
          <div
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

            <h2 id="group-settings-title" className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Settings className="text-blue-600 w-5 h-5" /> Group Settings
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Group name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={300}
                  className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Cover image URL</label>
                <input
                  value={coverPhoto}
                  onChange={(e) => setCoverPhoto(e.target.value)}
                  type="url"
                  placeholder="https://…"
                  className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={handleSave}
                disabled={pending || !name.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {pending && <LoaderCircle className="w-4 h-4 animate-spin" />}
                Save changes
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Delete this group
                </button>
              ) : (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3.5">
                  <p className="text-xs text-red-700 dark:text-red-300 mb-2.5 font-medium">
                    Delete <b>{group.name}</b> permanently? Members are removed; posts stay on the platform.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={pending}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {pending && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={pending}
                      className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold py-2 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
