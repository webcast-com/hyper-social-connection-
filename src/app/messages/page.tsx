import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { prisma, hasDatabase } from '@/lib/prisma';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';

export const metadata: Metadata = {
  title: 'Messages',
  description: 'Private conversations on Hyper.',
  alternates: { canonical: '/messages' },
  robots: { index: false, follow: false },
};

export default async function Messages() {
  const viewer = await getViewer() || { id: 0 } as any;

  let allUsers: any[] = [];
  if (hasDatabase) {
    try {
      allUsers = await prisma.user.findMany();
    } catch (err) {
      console.warn('[messages] DB query failed:', (err as Error)?.message);
    }
  }
  
  return (
    <div className="flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] md:h-[calc(100vh-3.5rem)] bg-white dark:bg-gray-800 max-w-6xl mx-auto md:mt-4 rounded-lg shadow overflow-hidden">
      <div className="w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 font-bold text-xl text-gray-900 dark:text-white">Chats</div>
        <div className="p-2 space-y-1">
          {allUsers.filter(u => u.id !== (viewer?.id || 0)).map(u => (
            <Link key={u.id} href={`/messages/${u.id}`} className="flex items-center space-x-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700/40 rounded-lg transition-colors cursor-pointer">
              {u.avatar ? (
                <img src={u.avatar} alt={u.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {u.name.charAt(0)}
                </div>
              )}
              <div className="font-semibold min-w-0">
                <span className="block truncate">{u.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <div className="hidden md:flex flex-1 flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <EmptyState variant="chat" title="Your messages">
            Select a conversation on the left — or pick any member — to start chatting.
          </EmptyState>
        </div>
      </div>
    </div>
  );
}