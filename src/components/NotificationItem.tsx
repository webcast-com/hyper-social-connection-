'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, Check, Heart, Mail, MessageCircle, UserPlus } from 'lucide-react';
import { markNotificationRead } from '@/app/actions';

export type NotificationItemData = {
  id: number;
  actorId: number;
  type: string;
  postId: number | null;
  isRead: number;
  createdAt: string;
};

type NotificationActor = {
  id: number;
  name: string;
  avatar: string | null;
} | null;

const iconMap: Record<string, React.ReactNode> = {
  like: <Heart className="text-red-500 w-5 h-5" />,
  comment: <MessageCircle className="text-blue-500 w-5 h-5" />,
  follow: <UserPlus className="text-green-500 w-5 h-5" />,
  follow_request: <UserPlus className="text-blue-500 w-5 h-5" />,
  message: <Mail className="text-purple-500 w-5 h-5" />,
};

function notificationText(type: string) {
  switch (type) {
    case 'like':
      return 'liked your post.';
    case 'comment':
      return 'commented on your post.';
    case 'follow':
      return 'started following you.';
    case 'follow_request':
      return 'requested to follow you.';
    case 'message':
      return 'sent you a message.';
    default:
      return 'sent you an update.';
  }
}

export default function NotificationItem({
  notification,
  actor,
  href,
}: {
  notification: NotificationItemData;
  actor: NotificationActor;
  href: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [read, setRead] = useState(Boolean(notification.isRead));

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (read || pending) return;

    // Mark the row read before navigating. A plain <Link> inside a <form>
    // does not submit that form, so the old implementation never persisted
    // this state.
    event.preventDefault();
    startTransition(async () => {
      await markNotificationRead(notification.id);
      router.push(href);
      router.refresh();
    });
  };

  // Mark a single notification as read in place, without navigating away.
  const handleMarkRead = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (read || pending) return;

    setRead(true); // optimistic — restored by router.refresh() if the write fails
    startTransition(async () => {
      await markNotificationRead(notification.id);
      router.refresh();
    });
  };

  return (
    <div className="relative flex items-start group">
      <Link
        href={href}
        onClick={handleClick}
        aria-busy={pending}
        className={`flex-1 min-w-0 flex items-start space-x-4 p-4 pr-14 hover:bg-blue-50 dark:hover:bg-gray-700/40 transition-colors ${
          read ? 'bg-white dark:bg-gray-800' : 'bg-blue-50 dark:bg-blue-900/20'
        } ${pending ? 'opacity-70' : ''}`}
      >
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-full shrink-0">
          {iconMap[notification.type] || <Bell className="text-gray-500 w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            {actor?.avatar ? (
              <img
                src={actor.avatar}
                alt={actor.name}
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {actor?.name?.charAt(0) || '?'}
              </div>
            )}
            <span className="font-semibold truncate text-gray-900 dark:text-white">{actor?.name || 'Someone'}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{notificationText(notification.type)}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2" suppressHydrationWarning>
            {new Date(notification.createdAt).toLocaleString()}
          </p>
        </div>
      </Link>

      {!read && (
        <button
          type="button"
          onClick={handleMarkRead}
          disabled={pending}
          title="Mark as read"
          aria-label={`Mark notification from ${actor?.name || 'Someone'} as read`}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full text-gray-400 hover:text-white hover:bg-blue-500 dark:text-gray-500 dark:hover:text-white focus-visible:opacity-100 transition-colors disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
