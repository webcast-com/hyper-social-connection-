'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, LoaderCircle, MailOpen, X } from 'lucide-react';
import { respondToGroupInvite } from '@/app/invite-actions';

type Invite = {
  id: number;
  message?: string | null;
  group: { id: number; name: string; coverPhoto?: string | null; privacy?: string | null } | null;
  inviter: { id: number; name: string; username?: string | null; avatar?: string | null } | null;
};

/**
 * Pending group invites for the signed-in user, with accept / decline.
 * Rendered on /groups and on the group's own page.
 */
export default function GroupInviteInbox({
  invites,
  compact = false,
}: {
  invites: Invite[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [handled, setHandled] = useState<Record<number, string>>({});

  const visible = invites.filter((i) => !handled[i.id] && i.group);
  if (visible.length === 0) return null;

  const respond = (inviteId: number, decision: 'accepted' | 'declined') => {
    startTransition(async () => {
      const res = await respondToGroupInvite(inviteId, decision);
      if (res.success) {
        setHandled((prev) => ({ ...prev, [inviteId]: decision }));
        router.refresh();
      }
    });
  };

  return (
    <section
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-800/40 ${
        compact ? 'p-4' : 'p-5'
      } mb-6`}
    >
      <h2 className="font-bold text-base text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <MailOpen className="w-5 h-5 text-blue-600" />
        Group invites
        <span className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full px-2 py-0.5">
          {visible.length}
        </span>
      </h2>

      <div className="space-y-3">
        {visible.map((invite) => (
          <div
            key={invite.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700"
          >
            {invite.group?.coverPhoto ? (
              <img
                src={invite.group.coverPhoto}
                alt=""
                className="w-12 h-12 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span className="w-12 h-12 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0">
                {invite.group?.name?.charAt(0)}
              </span>
            )}

            <div className="flex-1 min-w-0">
              <Link
                href={`/groups/${invite.group!.id}`}
                className="font-semibold text-sm text-gray-900 dark:text-white hover:underline"
              >
                {invite.group!.name}
              </Link>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Invited by{' '}
                <Link href={`/profile/${invite.inviter?.id}`} className="font-medium hover:underline">
                  {invite.inviter?.name || 'a member'}
                </Link>
              </p>
              {invite.message && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 italic">“{invite.message}”</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={pending}
                onClick={() => respond(invite.id, 'accepted')}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                {pending ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Accept
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => respond(invite.id, 'declined')}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
