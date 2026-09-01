'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { markAllNotificationsRead } from '@/app/actions';

export default function MarkAllReadButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (count === 0) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsRead();
          router.refresh();
        })
      }
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
    >
      <CheckCheck className="w-4 h-4" />
      {pending ? 'Marking…' : `Mark all read (${count})`}
    </button>
  );
}
