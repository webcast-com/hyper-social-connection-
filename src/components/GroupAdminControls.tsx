'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  inviteGroupMember,
  removeGroupMember,
  reviewJoinRequest,
  setGroupMemberRole,
  updateGroup,
  deleteGroup,
} from '@/app/actions';
import { Settings, X, LoaderCircle, Trash2, Shield, Users, UserPlus } from 'lucide-react';
import GroupCoverField from '@/components/GroupCoverField';
import { GROUP_CATEGORIES } from '@/lib/profile';

type Tab = 'general' | 'community' | 'members';

/**
 * Group settings (admin only). Keeps name / description / cover / delete
 * and adds privacy, category, rules, invites, roles, and join requests
 * inside the same modal.
 */
export default function GroupAdminControls({
  group,
  members = [],
  joinRequests = [],
}: {
  group: any;
  members?: { user: any; role?: string }[];
  joinRequests?: { user: any; status?: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('general');
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(group.name || '');
  const [description, setDescription] = useState(group.description || '');
  const [coverPhoto, setCoverPhoto] = useState(group.coverPhoto || '');
  const [privacy, setPrivacy] = useState(group.privacy || 'public');
  const [category, setCategory] = useState(group.category || '');
  const [rules, setRules] = useState(group.rules || '');
  const [location, setLocation] = useState(group.location || '');
  const [website, setWebsite] = useState(group.website || '');
  const [requireApproval, setRequireApproval] = useState(group.requireApproval === 1);
  const [inviteQuery, setInviteQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    setError('');
    setNotice('');
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('name', name.trim());
      fd.set('description', description.trim());
      fd.set('coverPhoto', coverPhoto.trim());
      fd.set('privacy', privacy);
      fd.set('category', category);
      fd.set('rules', rules);
      fd.set('location', location);
      fd.set('website', website);
      if (requireApproval) fd.set('requireApproval', '1');
      const result = await updateGroup(group.id, fd);
      if (result && !result.success) {
        setError(result.message || 'Could not save changes.');
        return;
      }
      setNotice('Group settings saved.');
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

  const handleInvite = () => {
    setError('');
    setNotice('');
    startTransition(async () => {
      const result = await inviteGroupMember(group.id, inviteQuery);
      if (result && !result.success) {
        setError(result.message || 'Invite failed.');
        return;
      }
      setInviteQuery('');
      setNotice(result?.message || 'Member added.');
      router.refresh();
    });
  };

  const pendingRequests = joinRequests.filter((r) => (r.status || 'pending') === 'pending' && r.user);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
      >
        <Settings className="w-4 h-4" /> Group settings
        {pendingRequests.length > 0 && (
          <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
            {pendingRequests.length}
          </span>
        )}
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
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[90vh] overflow-y-auto"
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

            <div className="flex gap-1 mb-4">
              {([
                { id: 'general', label: 'General', icon: Settings },
                { id: 'community', label: 'Community', icon: Shield },
                { id: 'members', label: 'Members', icon: Users },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    tab === id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                  {id === 'members' && pendingRequests.length > 0 && (
                    <span className="bg-white/20 rounded-full px-1.5">{pendingRequests.length}</span>
                  )}
                </button>
              ))}
            </div>

            {tab === 'general' && (
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
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Cover photo</label>
                  <GroupCoverField value={coverPhoto} onChange={setCoverPhoto} />
                </div>
              </div>
            )}

            {tab === 'community' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Privacy</label>
                  <select
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="public">Public — anyone can find and join</option>
                    <option value="private">Private — posts hidden; join requires approval</option>
                  </select>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3.5 py-2.5 text-sm">
                  <span className="font-medium text-gray-800 dark:text-gray-100">Require admin approval to join</span>
                  <input
                    type="checkbox"
                    checked={requireApproval}
                    onChange={(e) => setRequireApproval(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                </label>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {GROUP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Location</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={80}
                    className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Website</label>
                  <input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Group rules</label>
                  <textarea
                    value={rules}
                    onChange={(e) => setRules(e.target.value)}
                    rows={4}
                    maxLength={800}
                    placeholder="Be kind. Stay on topic…"
                    className="w-full bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            )}

            {tab === 'members' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Invite by username or email</label>
                  <div className="flex gap-2">
                    <input
                      value={inviteQuery}
                      onChange={(e) => setInviteQuery(e.target.value)}
                      placeholder="@maya or maya@example.com"
                      className="flex-1 bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleInvite}
                      disabled={pending || !inviteQuery.trim()}
                      className="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <UserPlus className="w-4 h-4" /> Invite
                    </button>
                  </div>
                </div>

                {pendingRequests.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Pending requests</h3>
                    <div className="space-y-2">
                      {pendingRequests.map(({ user: u }) => (
                        <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.name}</span>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => startTransition(async () => { await reviewJoinRequest(group.id, u.id, 'approved'); router.refresh(); })}
                              className="text-xs font-bold bg-blue-600 text-white px-2.5 py-1 rounded-lg"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => startTransition(async () => { await reviewJoinRequest(group.id, u.id, 'declined'); router.refresh(); })}
                              className="text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-2.5 py-1 rounded-lg"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Members · {members.length}</h3>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {members.map(({ user: u, role }) => u && (
                      <div key={u.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                        {u.avatar ? (
                          <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 bg-blue-500 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {(u.name || 'U').charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name}</div>
                          {u.username && <div className="text-[11px] text-gray-400">@{u.username}</div>}
                        </div>
                        {u.id === group.adminId ? (
                          <span className="text-[11px] font-bold text-yellow-600 dark:text-yellow-400">Owner</span>
                        ) : (
                          <>
                            <select
                              value={role || 'member'}
                              disabled={pending}
                              onChange={(e) => startTransition(async () => {
                                const result = await setGroupMemberRole(group.id, u.id, e.target.value);
                                if (result && !result.success) setError(result.message || 'Could not change role');
                                router.refresh();
                              })}
                              className="text-[11px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-1.5 py-1"
                            >
                              <option value="member">Member</option>
                              <option value="moderator">Moderator</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => startTransition(async () => {
                                const result = await removeGroupMember(group.id, u.id);
                                if (result && !result.success) setError(result.message || 'Could not remove');
                                router.refresh();
                              })}
                              className="text-[11px] font-semibold text-red-600 hover:underline"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-600 dark:text-red-400 mt-3">{error}</p>}
            {notice && <p className="text-xs text-green-700 dark:text-green-400 mt-3">{notice}</p>}

            {tab !== 'members' && (
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
            )}

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
