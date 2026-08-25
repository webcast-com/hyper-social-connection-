import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';
import { getNotifications } from '@/app/actions';
import NotificationItem from '@/components/NotificationItem';
import EmptyState from '@/components/EmptyState';
import { Bell } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Your Hyper notifications and activity updates.',
  alternates: { canonical: '/notifications' },
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');

  let notificationsData: any[] = [];
  try {
    notificationsData = await getNotifications();
  } catch (err) {
    console.warn('[notifications] DB query failed:', (err as Error)?.message);
    notificationsData = [];
  }

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 mt-4 sm:mt-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2 text-gray-900 dark:text-white">
        <Bell className="text-blue-600" /> Notifications
      </h1>

      {notificationsData.length === 0 ? (
        <EmptyState variant="bell" title="No notifications yet">
          When someone likes, comments on, or follows you, it will show up here.
        </EmptyState>
      ) : (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        {(
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {notificationsData.map(({ notification, actor }) => {
              const href =
                notification.type === 'message' ? `/messages/${notification.actorId}` :
                notification.type === 'follow_request' ? '/settings' :
                notification.type === 'follow' ? `/profile/${notification.actorId}` :
                notification.postId ? `/post/${notification.postId}` : `/profile/${notification.actorId}`;

              return (
                <NotificationItem
                  key={notification.id}
                  notification={{
                    id: notification.id,
                    actorId: notification.actorId,
                    type: notification.type,
                    postId: notification.postId ?? null,
                    isRead: notification.isRead,
                    createdAt: new Date(notification.createdAt).toISOString(),
                  }}
                  // Do not pass the complete database row to the client: it
                  // contains the actor's password column.
                  actor={
                    actor
                      ? { id: actor.id, name: actor.name, avatar: actor.avatar || null }
                      : null
                  }
                  href={href}
                />
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
