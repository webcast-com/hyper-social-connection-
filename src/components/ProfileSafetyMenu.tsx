'use client';

import { useState, useTransition } from 'react';
import { Ban, Flag, MoreHorizontal, VolumeX } from 'lucide-react';
import { toggleBlock, toggleMute } from '@/app/social-actions';
import ReportUserModal from '@/components/ReportUserModal';

export default function ProfileSafetyMenu({
  targetId,
  initiallyBlocked,
  initiallyMuted,
}: {
  targetId: number;
  initiallyBlocked: boolean;
  initiallyMuted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [muted, setMuted] = useState(initiallyMuted);
  const [showReport, setShowReport] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold text-gray-800"
          aria-label="More profile actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 py-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const result = await toggleMute(targetId);
                if (result.success) setMuted(result.muted);
                setOpen(false);
              })}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <VolumeX className="w-4 h-4" /> {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const result = await toggleBlock(targetId);
                if (result.success) setBlocked(result.blocked);
                setOpen(false);
              })}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600"
            >
              <Ban className="w-4 h-4" /> {blocked ? 'Unblock' : 'Block'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setShowReport(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600"
            >
              <Flag className="w-4 h-4" /> Report
            </button>
          </div>
        )}
      </div>
      {showReport && (
        <ReportUserModal userId={targetId} onClose={() => setShowReport(false)} />
      )}
    </>
  );
}
