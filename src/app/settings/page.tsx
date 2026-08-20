import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';
import { updateProfile } from '@/app/actions';
import AvatarField from '@/components/AvatarField';
import CoverPhotoField from '@/components/CoverPhotoField';
import { Settings as SettingsIcon, Save } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Settings and Privacy',
  description: 'Manage your Hyper profile and privacy settings.',
  alternates: { canonical: '/settings' },
  robots: { index: false, follow: false },
};

export default async function Settings() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  const currentUser = viewer;

  return (
    <div className="max-w-2xl mx-auto p-6 mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
      <h1 className="text-2xl font-bold mb-6 border-b border-gray-100 dark:border-gray-700 pb-3 text-gray-900 dark:text-white flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <span>Settings & Privacy</span>
      </h1>

      <form action={updateProfile} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Name</label>
          <input
            name="name"
            type="text"
            defaultValue={currentUser.name}
            className="mt-1.5 block w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl shadow-sm p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Bio</label>
          <textarea
            name="bio"
            defaultValue={currentUser.bio || ''}
            className="mt-1.5 block w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl shadow-sm p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            rows={3}
            placeholder="Tell the community about yourself..."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Profile picture</label>
          <div className="mt-2">
            <AvatarField
              fieldName="avatar"
              userName={currentUser.name}
              initialUrl={currentUser.avatar || ''}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Cover photo</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Upload a banner image from your device.</p>
          <div className="mt-2">
            <CoverPhotoField
              fieldName="coverPhoto"
              userName={currentUser.name}
              initialUrl={currentUser.coverPhoto || ''}
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-2"
        >
          <Save className="w-5 h-5" />
          <span>Save Changes</span>
        </button>
      </form>
    </div>
  );
}
