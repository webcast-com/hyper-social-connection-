import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';
import SettingsPanel from '@/components/SettingsPanel';
import { getSafetyLists } from '@/app/social-actions';
import { Settings as SettingsIcon } from 'lucide-react';

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
  const safety = await getSafetyLists();

  return (
    <div className="max-w-2xl mx-auto p-6 mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
      <h1 className="text-2xl font-bold mb-6 border-b border-gray-100 dark:border-gray-700 pb-3 text-gray-900 dark:text-white flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <span>Settings & Privacy</span>
      </h1>

      <SettingsPanel
        user={currentUser}
        blocked={safety.blocked}
        muted={safety.muted}
        followRequests={safety.followRequests}
      />
    </div>
  );
}
