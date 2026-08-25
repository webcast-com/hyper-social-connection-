'use client';

import { useState, useTransition } from 'react';
import { toggleFollow } from '@/app/actions';

export default function FollowButton({
  targetId,
  initialStatus,
}: {
  targetId: number;
  initialStatus: 'none' | 'following' | 'requested';
}) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();

  const label =
    status === 'following' ? '✓ Following' :
    status === 'requested' ? 'Requested' :
    '+ Follow';

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const result = await toggleFollow(targetId);
        if (result?.status && result.status !== 'error' && result.status !== 'blocked') {
          setStatus(result.status);
        }
      })}
      className={`flex-1 sm:flex-none px-5 py-2 rounded-lg font-semibold transition-colors shadow-sm disabled:opacity-60 ${
        status === 'none'
          ? 'bg-blue-600 hover:bg-blue-700 text-white'
          : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
      }`}
    >
      {pending ? '…' : label}
    </button>
  );
}
