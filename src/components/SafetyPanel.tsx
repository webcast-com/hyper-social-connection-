'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { reviewFollowRequest, toggleBlock, toggleMute } from '@/app/social-actions';

type Person = { id: number; name: string; username?: string | null; avatar?: string | null };

export default function SafetyPanel({
  blocked,
  muted,
  followRequests,
}: {
  blocked: Person[];
  muted: Person[];
  followRequests: Person[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<any>) => startTransition(async () => {
    await fn();
    router.refresh();
  });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Follow requests</h2>
        {followRequests.length === 0 ? (
          <p className="text-sm text-gray-500">No pending requests.</p>
        ) : (
          <ul className="space-y-2">
            {followRequests.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2">
                <PersonChip person={u} />
                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => reviewFollowRequest(u.id, 'approved'))}
                    className="text-xs font-bold bg-blue-600 text-white px-2.5 py-1 rounded-lg"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => reviewFollowRequest(u.id, 'declined'))}
                    className="text-xs font-bold bg-gray-200 dark:bg-gray-700 px-2.5 py-1 rounded-lg"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Blocked</h2>
        {blocked.length === 0 ? (
          <p className="text-sm text-gray-500">You have not blocked anyone.</p>
        ) : (
          <ul className="space-y-2">
            {blocked.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2">
                <PersonChip person={u} />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => toggleBlock(u.id))}
                  className="ml-auto text-xs font-semibold text-blue-600"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Muted</h2>
        {muted.length === 0 ? (
          <p className="text-sm text-gray-500">You have not muted anyone.</p>
        ) : (
          <ul className="space-y-2">
            {muted.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2">
                <PersonChip person={u} />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => toggleMute(u.id))}
                  className="ml-auto text-xs font-semibold text-blue-600"
                >
                  Unmute
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PersonChip({ person }: { person: Person }) {
  return (
    <Link href={`/profile/${person.id}`} className="flex items-center gap-2 min-w-0">
      {person.avatar ? (
        <img src={person.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
      ) : (
        <span className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">
          {person.name.charAt(0)}
        </span>
      )}
      <span className="text-sm font-medium truncate">{person.name}</span>
    </Link>
  );
}
