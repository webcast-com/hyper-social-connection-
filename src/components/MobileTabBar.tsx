'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageCircle, Compass, Users, Trophy, Bell } from 'lucide-react';

const MOBILE_TABS = [
  { href: '/', label: 'Home', icon: Home, isActive: (p: string) => p === '/' },
  { href: '/discover', label: 'People', icon: Compass, isActive: (p: string) => p.startsWith('/discover') },
  { href: '/sports', label: 'Sports', icon: Trophy, isActive: (p: string) => p.startsWith('/sports') },
  { href: '/groups', label: 'Groups', icon: Users, isActive: (p: string) => p.startsWith('/groups') },
  { href: '/messages', label: 'Contacts', icon: MessageCircle, isActive: (p: string) => p.startsWith('/messages') },
  { href: '/notifications', label: 'Alerts', icon: Bell, isActive: (p: string) => p.startsWith('/notifications'), badge: true },
];

export default function MobileTabBar({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/88 dark:bg-slate-950/88 backdrop-blur-xl border-t border-blue-100 dark:border-slate-800 shadow-[0_-14px_36px_rgba(37,99,235,0.14)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-[60px]">
        {MOBILE_TABS.map((tab) => {
          const active = tab.isActive(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-2xl mx-0.5 my-1 transition-all ${
                active
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-blue-500'
              }`}
            >
              <span className="relative">
                <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`} />
                {tab.badge && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center shadow-md animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
