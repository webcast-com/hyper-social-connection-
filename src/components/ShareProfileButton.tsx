'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import ShareProfileModal from './ShareProfileModal';

/**
 * Opens the share sheet for a profile. `canShareInternally` is false for
 * signed-out visitors, who can still share the public link externally.
 */
export default function ShareProfileButton({
  profile,
  canShareInternally = true,
  shareCount = 0,
  variant = 'solid',
}: {
  profile: { id: number; name: string; username?: string | null; avatar?: string | null };
  canShareInternally?: boolean;
  shareCount?: number;
  variant?: 'solid' | 'ghost';
}) {
  const [open, setOpen] = useState(false);

  const base =
    'flex-1 sm:flex-none justify-center px-5 py-2 rounded-lg font-semibold flex items-center gap-2 shadow-sm transition-colors';
  const styles =
    variant === 'solid'
      ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100'
      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${base} ${styles}`}>
        <Share2 className="w-4 h-4 shrink-0" />
        Share
        {shareCount > 0 && (
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{shareCount}</span>
        )}
      </button>
      {open && (
        <ShareProfileModal
          profile={profile}
          canShareInternally={canShareInternally}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
