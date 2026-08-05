import { getViewer } from '@/lib/viewer';
import { db } from '@/db';
import { notifications, users, posts, messages } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Bell, Heart, MessageCircle, UserPlus, Mail } from 'lucide-react';
import { getNotifications, markNotificationRead } from '@/app/actions';

export default async function NotificationsPage() {
  await getViewer();
  const notificationsData = await getNotifications();

  const iconMap: Record<string, React.ReactNode> = {
    like: <Heart className="text-red-500 w-5 h-5" />,
    comment: <MessageCircle className="text-blue-500 w-5 h-5" />,
    follow: <UserPlus className="text-green-500 w-5 h-5" />,
    message: <Mail className="text-purple-500 w-5 h-5" />,
  };

  return (
    <div className="max-w-2xl mx-auto p-4 mt-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Bell className="text-blue-600" /> Notifications
      </h1>
      
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {notificationsData.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-lg">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notificationsData.map(({ notification, actor }) => (
              <form
                key={notification.id}
                action={async () => {
                  'use server';
                  await markNotificationRead(notification.id);
                }}
                className="block"
              >
                <Link 
                  href={
                    notification.type === 'message' ? `/messages/${notification.actorId}` :
                    notification.type === 'follow' ? `/profile/${notification.actorId}` :
                    notification.postId ? `/` : `/profile/${notification.actorId}`
                  }
                  className={`flex items-start space-x-4 p-4 hover:bg-blue-50 transition-colors ${notification.isRead ? 'bg-white' : 'bg-blue-50'}`}
                >
                  <div className="p-2 bg-gray-50 rounded-full shrink-0">
                    {iconMap[notification.type] || <Bell className="text-gray-500 w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <img 
                        src={actor?.avatar || ''} 
                        alt={actor?.name || 'User'} 
                        className="w-8 h-8 rounded-full object-cover" 
                      />
                      <span className="font-semibold">{actor?.name || 'Someone'}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">
                      {notification.type === 'like' && 'liked your post.'}
                      {notification.type === 'comment' && 'commented on your post.'}
                      {notification.type === 'follow' && 'started following you.'}
                      {notification.type === 'message' && 'sent you a message.'}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">{new Date(notification.createdAt).toLocaleString()}</p>
                  </div>
                </Link>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}