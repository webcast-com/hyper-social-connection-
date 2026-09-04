'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  LoaderCircle,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react';
import {
  cancelGroupInvite,
  getGroupPendingInvites,
  getInviteCandidates,
  inviteToGroupByHandle,
  inviteUserToGroup,
} from '@/app/invite-actions';
import { buildGroupUrl } from '@/lib/share';

/**
 * "Invite" control for a group: pick people you follow, invite by
 * username/email, share the group link, and (for admins) manage pending
 * invites.
 */
export default function GroupInviteButton({
  groupId,
  groupName,
  canManage = false,
}: {
  groupId: number;
  groupName: string;
  canManage?: boolean;
}) {
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
  const [query, setQuery] = useState('');
  const [handle, setHandle] = useState('');
  const [message, setMessage] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [invited, setInvited] = useState<number[]>([]);

  const groupUrl =
    typeof window !== 'undefined' ? buildGroupUrl(window.location.origin, groupId) : '';

  // Esc closes the dialog even when the body is scrolled and the close
  // button is not under the pointer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      // Defer past the commit so no state is set synchronously in the effect.
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      try {
        const [c, p] = await Promise.all([
          getInviteCandidates(groupId, query),
          canManage ? getGroupPendingInvites(groupId) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setCandidates(c as any[]);
        setPendingInvites(p as any[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, query, groupId, canManage]);

  const invite = (userId: number) => {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await inviteUserToGroup(groupId, userId, message);
      if (res.success) {
        setInvited((prev) => [...prev, userId]);
        setNotice(res.message || 'Invite sent');
        router.refresh();
      } else {
        setError(res.message || 'Could not send that invite');
      }
    });
  };

  const inviteByHandle = () => {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await inviteToGroupByHandle(groupId, handle, message);
      if (res.success) {
        setHandle('');
        setNotice(res.message || 'Invite sent');
        setPendingInvites(canManage ? ((await getGroupPendingInvites(groupId)) as any[]) : []);
        router.refresh();
      } else {
        setError(res.message || 'Could not send that invite');
      }
    });
  };

  const cancel = (inviteId: number) => {
    startTransition(async () => {
      const res = await cancelGroupInvite(inviteId);
      if (res.success) {
        setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
        router.refresh();
      }
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(groupUrl);
    } catch {
      /* clipboard blocked */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 sm:px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-sm font-semibold inline-flex items-center justify-center gap-1.5 sm:gap-2 transition-colors w-full sm:w-auto"
      >
        <UserPlus className="w-4 h-4 shrink-0" /> Invite
      </button>

      {open && mounted && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-invite-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pinned header — keeps the close button reachable while the
                invite lists / pending invites scroll on short viewports. */}
            <div className="relative shrink-0 px-6 pt-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Close invite dialog"
              >
                <X className="w-5 h-5" />
              </button>

              <h2
                id="group-invite-title"
                className="text-xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2 pr-10"
              >
                <UserPlus className="text-blue-600 w-6 h-6 shrink-0" /> Invite to {groupName}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                People you invite get a notification and can accept or decline.
              </p>
            </div>

            <div className="overflow-y-auto min-h-0 px-6 pb-6">

            {/* Share link */}
            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={groupUrl}
                aria-label="Group link"
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 text-xs px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300"
              />
              <button
                type="button"
                onClick={copyLink}
                className="px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-1.5"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Add a short note to your invite (optional)…"
              className="w-full text-sm p-3 mb-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Invite by handle */}
            <div className="flex gap-2 mb-4">
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="Invite by @username or email"
                className="flex-1 min-w-0 text-sm px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                disabled={busy || !handle.trim()}
                onClick={inviteByHandle}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-1.5"
              >
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Invite
              </button>
            </div>

            {/* Suggested people */}
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people you follow"
                className="w-full text-sm pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {loading && (
                <div className="flex justify-center py-6 text-gray-400">
                  <LoaderCircle className="w-5 h-5 animate-spin" />
                </div>
              )}
              {!loading && candidates.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                  No one left to invite here — try a username or email above.
                </p>
              )}
              {candidates.map((u) => {
                const done = invited.includes(u.id);
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                        {u.name?.charAt(0)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {u.name}
                      </div>
                      {u.username && <div className="text-xs text-gray-500">@{u.username}</div>}
                    </div>
                    <button
                      type="button"
                      disabled={busy || done}
                      onClick={() => invite(u.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                        done
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                      {done ? 'Invited' : 'Invite'}
                    </button>
                  </div>
                );
              })}
            </div>

            {canManage && pendingInvites.length > 0 && (
              <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Pending invites ({pendingInvites.length})
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {pendingInvites.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                        {i.invitee?.name}
                        {i.invitee?.username ? ` · @${i.invitee.username}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => cancel(i.id)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notice && <p className="mt-4 text-sm text-green-600 dark:text-green-400">{notice}</p>}
            {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
