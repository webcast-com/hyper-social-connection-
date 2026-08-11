import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { getNotifications } from '@/app/actions';
import NotificationItem from '@/components/NotificationItem';
import { Bell } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Your Hyper notifications and activity updates.',
  alternates: { canonical: '/notifications' },
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  await getViewer();
  let notificationsData: any[] = [];
  try {
    notificationsData = await getNotifications();
  } catch (err) {
    console.warn('[notifications] DB query failed:', (err as Error)?.message);
    notificationsData = [];
  }

  return (
    <div className="max-w-2xl mx-auto p-4 mt-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2 text-gray-900 dark:text-white">
        <Bell className="text-blue-600" /> Notifications
      </h1>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        {notificationsData.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-lg">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {notificationsData.map(({ notification, actor }) => {
              const href =
                notification.type === 'message' ? `/messages/${notification.actorId}` :
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
    </div>
  );
}
