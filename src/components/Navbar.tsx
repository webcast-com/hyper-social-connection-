'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, MessageCircle, User as UserIcon, Settings, LogOut, Search, Bell, Compass, Users } from 'lucide-react';
import DarkModeToggle from '@/components/Theme/DarkModeToggle';

// Mobile bottom navigation (shown below md). Profile is reachable via the
// avatar in the top bar, so the five core destinations get the tabs.
const MOBILE_TABS = [
  { href: '/', label: 'Home', icon: Home, isActive: (p: string) => p === '/' },
  { href: '/discover', label: 'Discover', icon: Compass, isActive: (p: string) => p.startsWith('/discover') },
  { href: '/groups', label: 'Groups', icon: Users, isActive: (p: string) => p.startsWith('/groups') },
  { href: '/messages', label: 'Messages', icon: MessageCircle, isActive: (p: string) => p.startsWith('/messages') },
  { href: '/notifications', label: 'Alerts', icon: Bell, isActive: (p: string) => p.startsWith('/notifications'), badge: true },
];

export default function Navbar({ user, unreadCount }: { user: any, unreadCount?: number }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const isDesktopActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      <nav className="fixed top-0 w-full bg-white border-b border-gray-200 z-50 px-4 h-14 flex items-center justify-between shadow-sm">
        {/* Left: brand + search */}
        <div className="flex items-center space-x-2 min-w-0">
          <Link href="/" className="text-blue-600 font-bold text-2xl tracking-tighter hover:scale-105 transition-transform font-display shrink-0">
            hyper
          </Link>
          <Link href="/search" className="ml-2 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors hover:scale-105 shrink-0" aria-label="Search">
            <Search className="h-4 w-4 text-gray-600" />
          </Link>
        </div>

        {/* Center: desktop nav (unchanged layout, plus active highlight) */}
        <div className="hidden md:flex items-center space-x-6 md:space-x-8">
          <Link href="/" className={`transition-colors relative flex flex-col items-center group ${isDesktopActive('/') ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}>
            <Home className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium">Home</span>
          </Link>
          <Link href="/discover" className={`transition-colors relative flex flex-col items-center group ${isDesktopActive('/discover') ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}>
            <Compass className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium">Discover</span>
          </Link>
          <Link href={`/profile/${user.id}`} className={`transition-colors relative flex flex-col items-center group ${isDesktopActive('/profile') ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}>
            <UserIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium">Profile</span>
          </Link>
          <Link href="/messages" className={`transition-colors relative flex flex-col items-center group ${isDesktopActive('/messages') ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}>
            <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium">Messages</span>
          </Link>
          <Link href="/groups" className={`transition-colors relative flex flex-col items-center group ${isDesktopActive('/groups') ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}>
            <Users className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium">Groups</span>
          </Link>
          <Link href="/notifications" className={`transition-colors relative flex flex-col items-center group ${isDesktopActive('/notifications') ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}>
            <div className="relative">
              <Bell className="w-6 h-6 group-hover:scale-110 transition-transform" />
              {unreadCount && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-md">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">Alerts</span>
          </Link>
        </div>

        {/* Right: dark mode, settings, logout, avatar */}
        <div className="flex items-center space-x-2 md:space-x-3 shrink-0">
          <DarkModeToggle />
          <Link href="/settings" className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors hover:scale-105 dark:bg-gray-800 dark:hover:bg-gray-700" aria-label="Settings">
            <Settings className="w-5 h-5 text-gray-700" />
          </Link>
          <button onClick={handleLogout} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors hover:scale-105" aria-label="Log out">
            <LogOut className="w-5 h-5 text-gray-700" />
          </button>
          <Link href={`/profile/${user.id}`} aria-label="Your profile" className="hover:scale-105 transition-transform">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover border-2 border-white ring-2 ring-blue-400 hover:ring-blue-600 transition-all" />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white font-bold ring-2 ring-blue-400 hover:ring-blue-600 transition-all shadow-md">
                {user.name.charAt(0)}
              </div>
            )}
          </Link>
        </div>
      </nav>

      {/* Mobile bottom tab bar (md and up keep the top nav only) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-14">
          {MOBILE_TABS.map(tab => {
            const active = tab.isActive(pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'
                }`}
              >
                <span className="relative">
                  <Icon className={`w-6 h-6 transition-transform ${active ? 'scale-110' : ''}`} />
                  {tab.badge && unreadCount && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center shadow-md">
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
    </>
  );
}
