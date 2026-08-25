'use client';

import { useState, useTransition } from 'react';
import { changePassword, updateProfile } from '@/app/actions';
import AvatarField from '@/components/AvatarField';
import CoverPhotoField from '@/components/CoverPhotoField';
import {
  Bell,
  Check,
  KeyRound,
  LoaderCircle,
  Lock,
  Save,
  Shield,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import SafetyPanel from '@/components/SafetyPanel';

type Tab = 'profile' | 'privacy' | 'safety' | 'notifications' | 'account';

const TABS: { id: Tab; label: string; icon: typeof UserRound }[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'safety', label: 'Safety', icon: ShieldAlert },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'account', label: 'Account', icon: KeyRound },
];

const inputClass =
  'mt-1.5 block w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl shadow-sm p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

export default function SettingsPanel({
  user,
  blocked = [],
  muted = [],
  followRequests = [],
}: {
  user: any;
  blocked?: any[];
  muted?: any[];
  followRequests?: any[];
}) {
  const [tab, setTab] = useState<Tab>('profile');
  const [pending, startTransition] = useTransition();
  const [pwPending, startPw] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');

  const handleProfileSave = (formData: FormData) => {
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result?.success) setMessage(result.message || 'Saved');
      else setError(result?.message || 'Could not save');
    });
  };

  const handlePassword = (formData: FormData) => {
    setPwMessage('');
    setPwError('');
    startPw(async () => {
      const result = await changePassword(formData);
      if (result?.success) setPwMessage(result.message || 'Password updated');
      else setPwError(result?.message || 'Could not update password');
    });
  };

  return (
    <div>
      <nav className="flex gap-1 mb-6 overflow-x-auto scrollbar-hide -mx-1 px-1" aria-label="Settings sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            aria-current={tab === id ? 'page' : undefined}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'safety' && (
        <SafetyPanel blocked={blocked} muted={muted} followRequests={followRequests} />
      )}

      {tab !== 'account' && tab !== 'safety' && (
        <form action={handleProfileSave} className="space-y-6">
          {tab === 'profile' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Name</label>
                <input name="name" type="text" defaultValue={user.name} className={inputClass} required maxLength={80} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                  <input
                    name="username"
                    type="text"
                    defaultValue={user.username || ''}
                    className={`${inputClass} pl-8`}
                    maxLength={24}
                    placeholder="yourhandle"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">3–24 letters, numbers, or underscores.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Bio</label>
                <textarea
                  name="bio"
                  defaultValue={user.bio || ''}
                  className={inputClass}
                  rows={3}
                  maxLength={280}
                  placeholder="Tell the community about yourself..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Pronouns</label>
                  <input name="pronouns" type="text" defaultValue={user.pronouns || ''} className={inputClass} placeholder="they/them" maxLength={40} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Location</label>
                  <input name="location" type="text" defaultValue={user.location || ''} className={inputClass} placeholder="Nairobi, KE" maxLength={80} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Workplace</label>
                  <input name="workplace" type="text" defaultValue={user.workplace || ''} className={inputClass} placeholder="Where you work" maxLength={80} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Education</label>
                  <input name="education" type="text" defaultValue={user.education || ''} className={inputClass} placeholder="School or university" maxLength={80} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Website</label>
                <input name="website" type="text" defaultValue={user.website || ''} className={inputClass} placeholder="https://yoursite.com" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Profile picture</label>
                <div className="mt-2">
                  <AvatarField fieldName="avatar" userName={user.name} initialUrl={user.avatar || ''} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Cover photo</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Upload a banner image from your device.</p>
                <div className="mt-2">
                  <CoverPhotoField fieldName="coverPhoto" userName={user.name} initialUrl={user.coverPhoto || ''} />
                </div>
              </div>
              <input type="hidden" name="profileVisibility" value={user.profileVisibility || 'public'} />
              <input type="hidden" name="messagePrivacy" value={user.messagePrivacy || 'everyone'} />
              <input type="hidden" name="followPrivacy" value={user.followPrivacy || 'everyone'} />
              <input type="hidden" name="notifyLikes" value={user.notifyLikes === 0 ? '0' : '1'} />
              <input type="hidden" name="notifyComments" value={user.notifyComments === 0 ? '0' : '1'} />
              <input type="hidden" name="notifyFollows" value={user.notifyFollows === 0 ? '0' : '1'} />
              <input type="hidden" name="notifyMessages" value={user.notifyMessages === 0 ? '0' : '1'} />
            </>
          )}

          {tab === 'privacy' && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Control who can see your profile details and who can start a chat with you. Follow and Message on your profile still work the same way.
              </p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Who can see your posts &amp; about</label>
                <select name="profileVisibility" defaultValue={user.profileVisibility || 'public'} className={inputClass}>
                  <option value="public">Everyone</option>
                  <option value="followers">Followers only</option>
                  <option value="private">Only me</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Who can message you</label>
                <select name="messagePrivacy" defaultValue={user.messagePrivacy || 'everyone'} className={inputClass}>
                  <option value="everyone">Everyone</option>
                  <option value="followers">People you follow or who follow you</option>
                  <option value="nobody">No one</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Who can follow you</label>
                <select name="followPrivacy" defaultValue={user.followPrivacy || 'everyone'} className={inputClass}>
                  <option value="everyone">Everyone (instant)</option>
                  <option value="approval">Approval required</option>
                </select>
              </div>
              <input type="hidden" name="name" value={user.name} />
              <input type="hidden" name="username" value={user.username || ''} />
              <input type="hidden" name="bio" value={user.bio || ''} />
              <input type="hidden" name="avatar" value={user.avatar || ''} />
              <input type="hidden" name="coverPhoto" value={user.coverPhoto || ''} />
              <input type="hidden" name="pronouns" value={user.pronouns || ''} />
              <input type="hidden" name="location" value={user.location || ''} />
              <input type="hidden" name="workplace" value={user.workplace || ''} />
              <input type="hidden" name="education" value={user.education || ''} />
              <input type="hidden" name="website" value={user.website || ''} />
              <input type="hidden" name="notifyLikes" value={user.notifyLikes === 0 ? '0' : '1'} />
              <input type="hidden" name="notifyComments" value={user.notifyComments === 0 ? '0' : '1'} />
              <input type="hidden" name="notifyFollows" value={user.notifyFollows === 0 ? '0' : '1'} />
              <input type="hidden" name="notifyMessages" value={user.notifyMessages === 0 ? '0' : '1'} />
            </>
          )}

          {tab === 'notifications' && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose which activity shows up in your Alerts. Unchecked types are never written.
              </p>
              <fieldset className="space-y-3">
                <NotifyToggle name="notifyLikes" label="Likes on your posts" defaultOn={user.notifyLikes !== 0} />
                <NotifyToggle name="notifyComments" label="Comments on your posts" defaultOn={user.notifyComments !== 0} />
                <NotifyToggle name="notifyFollows" label="New followers" defaultOn={user.notifyFollows !== 0} />
                <NotifyToggle name="notifyMessages" label="Direct messages" defaultOn={user.notifyMessages !== 0} />
              </fieldset>
              <input type="hidden" name="name" value={user.name} />
              <input type="hidden" name="username" value={user.username || ''} />
              <input type="hidden" name="bio" value={user.bio || ''} />
              <input type="hidden" name="avatar" value={user.avatar || ''} />
              <input type="hidden" name="coverPhoto" value={user.coverPhoto || ''} />
              <input type="hidden" name="pronouns" value={user.pronouns || ''} />
              <input type="hidden" name="location" value={user.location || ''} />
              <input type="hidden" name="workplace" value={user.workplace || ''} />
              <input type="hidden" name="education" value={user.education || ''} />
              <input type="hidden" name="website" value={user.website || ''} />
              <input type="hidden" name="profileVisibility" value={user.profileVisibility || 'public'} />
              <input type="hidden" name="messagePrivacy" value={user.messagePrivacy || 'everyone'} />
              <input type="hidden" name="followPrivacy" value={user.followPrivacy || 'everyone'} />
            </>
          )}

          {(tab === 'profile' || tab === 'privacy' || tab === 'notifications') && (
            <>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              {message && (
                <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> {message}
                </p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {pending ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                <span>{pending ? 'Saving…' : 'Save Changes'}</span>
              </button>
            </>
          )}
        </form>
      )}

      {tab === 'account' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Email</div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used to sign in. Not shown on your public profile.</p>
          </div>

          <form action={handlePassword} className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" /> Change password
            </h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Current password</label>
              <input name="currentPassword" type="password" autoComplete="current-password" className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">New password</label>
              <input name="newPassword" type="password" autoComplete="new-password" className={inputClass} required minLength={8} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Confirm new password</label>
              <input name="confirmPassword" type="password" autoComplete="new-password" className={inputClass} required minLength={8} />
            </div>
            {pwError && <p className="text-sm text-red-600 dark:text-red-400">{pwError}</p>}
            {pwMessage && (
              <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> {pwMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={pwPending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {pwPending ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
              <span>{pwPending ? 'Updating…' : 'Update password'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function NotifyToggle({ name, label, defaultOn }: { name: string; label: string; defaultOn: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3 cursor-pointer">
      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</span>
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={defaultOn}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
    </label>
  );
}
