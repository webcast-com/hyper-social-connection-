import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { updateProfile } from '@/app/actions';
import AvatarField from '@/components/AvatarField';
import CoverPhotoField from '@/components/CoverPhotoField';

export const metadata: Metadata = {
  title: 'Settings and Privacy',
  description: 'Manage your Hyper profile and privacy settings.',
  alternates: { canonical: '/settings' },
  robots: { index: false, follow: false },
};

export default async function Settings() {
  const currentUser = await getViewer();

  return (
    <div className="max-w-2xl mx-auto p-4 mt-6 bg-white rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6 border-b pb-2">Settings & Privacy</h1>
      <form action={updateProfile} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            name="name"
            type="text"
            defaultValue={currentUser.name}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Bio</label>
          <textarea
            name="bio"
            defaultValue={currentUser.bio || ''}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Profile picture</label>
          <div className="mt-1">
            <AvatarField
              fieldName="avatar"
              userName={currentUser.name}
              initialUrl={currentUser.avatar || ''}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Cover photo</label>
          <p className="text-xs text-gray-500 mt-0.5">Upload a photo from your device.</p>
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
          className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition-colors"
        >
          Save Changes
        </button>
      </form>
    </div>
  );
}