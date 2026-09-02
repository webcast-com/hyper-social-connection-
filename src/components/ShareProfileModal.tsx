'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Rss,
  Search,
  Send,
  Share2,
  Users,
  X,
} from 'lucide-react';
import {
  EXTERNAL_NETWORKS,
  buildProfileUrl,
  defaultShareText,
  type ExternalNetwork,
} from '@/lib/share';
import {
  getShareableGroups,
  getShareableRecipients,
  recordProfileShare,
  shareProfileToFeed,
  shareProfileToMessage,
} from '@/app/share-actions';

type Profile = {
  id: number;
  name: string;
  username?: string | null;
  avatar?: string | null;
  bio?: string | null;
};

type Tab = 'feed' | 'group' | 'message' | 'external';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'feed', label: 'Feed', icon: <Rss className="w-4 h-4" /> },
  { id: 'group', label: 'Groups', icon: <Users className="w-4 h-4" /> },
  { id: 'message', label: 'Send to', icon: <Send className="w-4 h-4" /> },
  { id: 'external', label: 'Elsewhere', icon: <ExternalLink className="w-4 h-4" /> },
];

/**
 * Share-a-profile sheet: post it to your feed, post it into a group you belong
 * to, DM it to someone, copy the link, or hand it off to an external network.
 */
export default function ShareProfileModal({
  profile,
  canShareInternally = true,
  onClose,
}: {
  profile: Profile;
  canShareInternally?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(canShareInternally ? 'feed' : 'external');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);

  const shareUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return buildProfileUrl(origin, profile.id, profile.username);
  }, [profile.id, profile.username]);
  const shareText = defaultShareText(profile.name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lazy-load the list the active tab needs. State updates are deferred to a
  // microtask so the effect never sets state synchronously during commit.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (tab !== 'group' && tab !== 'message') return;
      if (tab === 'group' && groups.length > 0) return;
      await Promise.resolve();
      if (cancelled) return;
      setLoadingList(true);
      try {
        if (tab === 'group') {
          const g = await getShareableGroups();
          if (!cancelled) setGroups(g as any[]);
        } else {
          const r = await getShareableRecipients(recipientQuery);
          if (!cancelled) setRecipients(r as any[]);
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, recipientQuery]);

  const copyLink = async (silent = false) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* clipboard blocked — the link is still visible in the field */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (!silent) {
      void recordProfileShare(profile.id, 'copy_link');
      setNotice('Profile link copied to your clipboard.');
    }
  };

  const handleFeedShare = (groupId?: number) => {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await shareProfileToFeed(profile.id, { message, groupId: groupId ?? null });
      if (res.success) {
        setNotice(res.message || 'Shared');
        router.refresh();
        setTimeout(onClose, 900);
      } else {
        setError(res.message || 'Could not share');
      }
    });
  };

  const handleSend = (receiverId: number) => {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await shareProfileToMessage(profile.id, receiverId, message);
      if (res.success) {
        setNotice(res.message || 'Sent');
        router.refresh();
        setTimeout(onClose, 900);
      } else {
        setError(res.message || 'Could not send');
      }
    });
  };

  const handleExternal = async (network: ExternalNetwork) => {
    const url = network.buildUrl(shareUrl, shareText);
    void recordProfileShare(profile.id, network.id);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer,width=640,height=640');
      return;
    }
    // No web share endpoint (YouTube / TikTok): copy + open their composer.
    await copyLink(true);
    setNotice(network.hint || 'Link copied to your clipboard.');
    if (network.fallbackUrl) window.open(network.fallbackUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (typeof navigator === 'undefined' || !navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: profile.name, text: shareText, url: shareUrl });
      void recordProfileShare(profile.id, 'native');
    } catch {
      /* user dismissed the sheet */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close share dialog"
          >
            <X className="w-5 h-5" />
          </button>

          <h2
            id="share-profile-title"
            className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"
          >
            <Share2 className="text-blue-600 w-6 h-6" /> Share profile
          </h2>

          {/* Profile preview card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 mb-4">
            {profile.avatar ? (
              <img src={profile.avatar} alt={profile.name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                {profile.name?.charAt(0) || 'U'}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 dark:text-white truncate">{profile.name}</div>
              {profile.username && (
                <div className="text-xs text-gray-500 dark:text-gray-400">@{profile.username}</div>
              )}
            </div>
          </div>

          {/* Copy link row */}
          <div className="flex items-center gap-2 mb-4">
            <input
              readOnly
              value={shareUrl}
              aria-label="Profile link"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 text-xs px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300"
            />
            <button
              type="button"
              onClick={() => copyLink()}
              className="px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900 mb-4">
            {TABS.filter((t) => canShareInternally || t.id === 'external').map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setError('');
                  setNotice('');
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t.id
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {(tab === 'feed' || tab === 'group' || tab === 'message') && (
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={
                tab === 'message' ? 'Add a note (optional)…' : 'Say something about this profile (optional)…'
              }
              className="w-full text-sm p-3 mb-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
          )}

          {tab === 'feed' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => handleFeedShare()}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-left disabled:opacity-50"
            >
              <span className="p-3 bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-xl">
                {pending ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Rss className="w-5 h-5" />}
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-gray-900 dark:text-white">Share to your feed</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Posts a profile card your followers will see.
                </span>
              </span>
            </button>
          )}

          {tab === 'group' && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {loadingList && <ListLoading />}
              {!loadingList && groups.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                  You are not in any groups yet.
                </p>
              )}
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={pending}
                  onClick={() => handleFeedShare(g.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-left disabled:opacity-50"
                >
                  {g.coverPhoto ? (
                    <img src={g.coverPhoto} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <span className="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                      {g.name?.charAt(0)}
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm text-gray-900 dark:text-white truncate">
                      {g.name}
                    </span>
                    <span className="block text-xs text-gray-500 capitalize">{g.privacy} group</span>
                  </span>
                  <Send className="w-4 h-4 text-blue-500 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {tab === 'message' && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                  placeholder="Search people you follow"
                  className="w-full text-sm pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {loadingList && <ListLoading />}
                {!loadingList && recipients.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                    No one to send this to yet — follow some people first.
                  </p>
                )}
                {recipients.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={pending}
                    onClick={() => handleSend(u.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-left disabled:opacity-50"
                  >
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                        {u.name?.charAt(0)}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {u.name}
                      </span>
                      {u.username && <span className="block text-xs text-gray-500">@{u.username}</span>}
                    </span>
                    <Send className="w-4 h-4 text-blue-500 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'external' && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {EXTERNAL_NETWORKS.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleExternal(n)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                >
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center ${n.tint}`}>
                    <NetworkGlyph id={n.id} />
                  </span>
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">
                    {n.label}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60"
              >
                <span className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </span>
                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">More…</span>
              </button>
            </div>
          )}

          {notice && (
            <p className="mt-4 text-sm text-green-600 dark:text-green-400 font-medium">{notice}</p>
          )}
          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function ListLoading() {
  return (
    <div className="flex items-center justify-center py-6 text-gray-400">
      <LoaderCircle className="w-5 h-5 animate-spin" />
    </div>
  );
}

/**
 * Inline brand glyphs. lucide-react dropped most brand icons, so these are
 * simple, recognisable paths rendered in the network's own colour.
 */
function NetworkGlyph({ id }: { id: string }) {
  const common = { className: 'w-5 h-5', fill: 'currentColor', viewBox: '0 0 24 24' } as const;
  switch (id) {
    case 'facebook':
      return (
        <svg {...common} aria-hidden>
          <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.8-.6-3.1-1.3-5.1-4.4-5.3-4.6-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .7.5l.9 2.2c.1.2.1.4 0 .6l-.4.5c-.1.2-.3.3-.1.6.1.3.7 1.2 1.5 1.9 1 .9 1.9 1.2 2.2 1.3.2.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2.1 1c.3.1.4.2.5.3.1.2.1.7-.1 1.4z" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common} aria-hidden>
          <path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.6 6.7L18.9 2zm-1.1 18h1.7L7.3 3.8H5.4L17.8 20z" />
        </svg>
      );
    case 'telegram':
      return (
        <svg {...common} aria-hidden>
          <path d="M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.3-.1-.5-.6-.2L6.3 12.7l-4.8-1.5c-1-.3-1-1 .2-1.5l18.7-7.2c.9-.3 1.6.2 1.5 1.8z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg {...common} aria-hidden>
          <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.5 4.7 5.8V21h-4v-5.7c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1V21H9z" />
        </svg>
      );
    case 'reddit':
      return (
        <svg {...common} aria-hidden>
          <path d="M22 12a2 2 0 0 0-3.4-1.4 9.8 9.8 0 0 0-5-1.5l.9-4 2.8.6a1.7 1.7 0 1 0 .2-1.2l-3.4-.7a.6.6 0 0 0-.7.5l-1 4.8a9.8 9.8 0 0 0-5 1.5A2 2 0 1 0 3.3 14a4 4 0 0 0 0 .6c0 3.2 3.9 5.8 8.7 5.8s8.7-2.6 8.7-5.8a4 4 0 0 0 0-.6c.8-.3 1.3-1.1 1.3-2zM8 13.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm8.1 4.2c-1 1-2.9 1.1-4.1 1.1s-3.1-.1-4.1-1.1a.5.5 0 0 1 .7-.7c.7.7 2.1.9 3.4.9s2.7-.2 3.4-.9a.5.5 0 0 1 .7.7zm-.6-2.7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
        </svg>
      );
    case 'youtube':
      return (
        <svg {...common} aria-hidden>
          <path d="M23 12s0-3.4-.4-5a2.6 2.6 0 0 0-1.8-1.8C19.2 4.7 12 4.7 12 4.7s-7.2 0-8.8.5A2.6 2.6 0 0 0 1.4 7C1 8.6 1 12 1 12s0 3.4.4 5a2.6 2.6 0 0 0 1.8 1.8c1.6.5 8.8.5 8.8.5s7.2 0 8.8-.5a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-5 .4-5zM9.8 15.3V8.7l6 3.3z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg {...common} aria-hidden>
          <path d="M16.5 2h-3v13.2a2.7 2.7 0 1 1-2.2-2.7v-3a5.7 5.7 0 1 0 5.2 5.7V9.5a7 7 0 0 0 4 1.3v-3a4 4 0 0 1-4-4z" />
        </svg>
      );
    case 'email':
      return (
        <svg {...common} aria-hidden>
          <path d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v.3l-10 6-10-6zm0 2.6V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.6l-9.5 5.7a1 1 0 0 1-1 0z" />
        </svg>
      );
    default:
      return <Share2 className="w-5 h-5" />;
  }
}
