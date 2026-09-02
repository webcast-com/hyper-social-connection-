'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { joinGroup, leaveGroup } from '@/app/actions';
import { LoaderCircle, Check, Plus, LogOut, Crown } from 'lucide-react';

/**
 * Join ⇄ Leave toggle for a group header.
 *  - Non-member  → "Join Group" (blue)
 *  - Member      → "✓ Joined" which flips to "Leave" on hover
 *  - Group admin → static badge (admins can't leave their own group)
 * Optimistic state gives instant feedback; the server revalidates the real
 * count in the background.
 */
export default function GroupMembershipButton({
  groupId,
  isMember: initialIsMember,
  isAdmin,
  joinPending: initialJoinPending = false,
  requiresApproval = false,
}: {
  groupId: number;
  isMember: boolean;
  isAdmin: boolean;
  joinPending?: boolean;
  requiresApproval?: boolean;
}) {
  const router = useRouter();
  const [joined, setJoined] = useState(initialIsMember);
  const [requested, setRequested] = useState(initialJoinPending);
  const [pending, startTransition] = useTransition();

  if (isAdmin) {
    return (
      <span className="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-1.5 w-full sm:w-auto">
        <Crown className="w-4 h-4 shrink-0" />
        <span className="sm:hidden">Admin</span>
        <span className="hidden sm:inline">You admin this group</span>
      </span>
    );
  }

  const handleJoin = () => {
    setJoined(true); // optimistic
    startTransition(async () => {
      await joinGroup(groupId);
      router.refresh();
    });
  };

  const handleLeave = () => {
    setJoined(false); // optimistic
    startTransition(async () => {
      const result = await leaveGroup(groupId);
      if (result && !result.success) {
        setJoined(true); // revert (e.g. DB unavailable)
      }
      router.refresh();
    });
  };

  if (pending) {
    return (
      <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-4 sm:px-6 py-2 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-2 w-full sm:w-auto">
        <LoaderCircle className="w-4 h-4 animate-spin" /> Updating…
      </span>
    );
  }

  if (requested && !joined) {
    return (
      <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold text-sm inline-flex items-center justify-center w-full sm:w-auto">
        Request sent
      </span>
    );
  }

  if (!joined) {
    return (
      <button
        type="button"
        onClick={handleJoin}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 py-2 rounded-lg font-semibold text-sm transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto"
      >
        <Plus className="w-4 h-4 shrink-0" /> {requiresApproval ? 'Request to join' : 'Join Group'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLeave}
      className="group bg-green-100 dark:bg-green-900/40 hover:bg-red-50 dark:hover:bg-red-900/40 text-green-700 dark:text-green-300 hover:text-red-600 dark:hover:text-red-400 px-4 py-2 rounded-lg font-semibold text-sm transition-colors inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
      title="Leave group"
    >
      <span className="flex items-center gap-1.5 group-hover:hidden">
        <Check className="w-4 h-4" /> Joined
      </span>
      <span className="hidden group-hover:flex items-center gap-1.5">
        <LogOut className="w-4 h-4" /> Leave
      </span>
    </button>
  );
}
