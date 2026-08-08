'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  MessageCircle,
  User as UserIcon,
  Settings,
  LogOut,
  Search,
  Bell,
  Compass,
  Users,
} from 'lucide-react';
import DarkModeToggle from '@/components/Theme/DarkModeToggle';

const MOBILE_TABS = [
  { href: '/', label: 'Home', icon: Home, isActive: (p: string) => p === '/' },
  { href: '/discover', label: 'Discover', icon: Compass, isActive: (p: string) => p.startsWith('/discover') },
  { href: '/groups', label: 'Groups', icon: Users, isActive: (p: string) => p.startsWith('/groups') },
  { href: '/messages', label: 'Messages', icon: MessageCircle, isActive: (p: string) => p.startsWith('/messages') },
  { href: '/notifications', label: 'Alerts', icon: Bell, isActive: (p: string) => p.startsWith('/notifications'), badge: true },
];

export default function Navbar({ user, unreadCount }: { user?: any; unreadCount?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navSearch, setNavSearch] = useState('');

  // Gracefully handle unauthenticated state
  if (!user) {
    return (
      <header className="fixed top-0 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 z-50 px-4 h-14 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2 min-w-0">
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-500 font-extrabold text-2xl tracking-tighter hover:scale-105 transition-transform font-display shrink-0"
          >
            hyper
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <DarkModeToggle />
          <Link
            href="/login"
            className="text-sm px-3.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            Sign up
          </Link>
        </div>
      </header>
    );
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (navSearch.trim()) {
      router.push(`/search?q=${encodeURIComponent(navSearch.trim())}`);
    } else {
      router.push('/search');
    }
  };

  const isDesktopActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      <header className="fixed top-0 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 z-50 px-4 h-14 flex items-center justify-between shadow-sm">
        {/* Left: Brand logo + Integrated Search Bar */}
        <div className="flex items-center space-x-3 min-w-0">
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-500 font-extrabold text-2xl tracking-tighter hover:scale-105 transition-transform font-display shrink-0"
            aria-label="Hyper Home"
          >
            hyper
          </Link>

          {/* Desktop Search Input */}
          <form onSubmit={handleSearchSubmit} className="hidden sm:flex items-center relative max-w-xs">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder="Search Hyper..."
              className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs rounded-full pl-9 pr-3 py-2 w-48 lg:w-60 focus:w-72 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>

          {/* Mobile Search Icon button */}
          <Link
            href="/search"
            className="sm:hidden p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
            aria-label="Search"
          >
            <Search className="h-4 w-4 text-gray-600 dark:text-gray-300" />
          </Link>
        </div>

        {/* Center: Desktop Navigation Bar with Active Highlights */}
        <nav className="hidden md:flex items-center space-x-4 lg:space-x-6">
          <Link
            href="/"
            className={`transition-all relative py-1 px-2.5 rounded-xl flex flex-col items-center group ${
              isDesktopActive('/')
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-semibold mt-0.5">Home</span>
            {isDesktopActive('/') && (
              <span className="absolute -bottom-1.5 w-6 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </Link>

          <Link
            href="/discover"
            className={`transition-all relative py-1 px-2.5 rounded-xl flex flex-col items-center group ${
              isDesktopActive('/discover')
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Compass className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-semibold mt-0.5">Discover</span>
            {isDesktopActive('/discover') && (
              <span className="absolute -bottom-1.5 w-6 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </Link>

          <Link
            href={`/profile/${user.id}`}
            className={`transition-all relative py-1 px-2.5 rounded-xl flex flex-col items-center group ${
              isDesktopActive('/profile')
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <UserIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-semibold mt-0.5">Profile</span>
            {isDesktopActive('/profile') && (
              <span className="absolute -bottom-1.5 w-6 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </Link>

          <Link
            href="/messages"
            className={`transition-all relative py-1 px-2.5 rounded-xl flex flex-col items-center group ${
              isDesktopActive('/messages')
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-semibold mt-0.5">Messages</span>
            {isDesktopActive('/messages') && (
              <span className="absolute -bottom-1.5 w-6 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </Link>

          <Link
            href="/groups"
            className={`transition-all relative py-1 px-2.5 rounded-xl flex flex-col items-center group ${
              isDesktopActive('/groups')
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Users className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-semibold mt-0.5">Groups</span>
            {isDesktopActive('/groups') && (
              <span className="absolute -bottom-1.5 w-6 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </Link>

          <Link
            href="/notifications"
            className={`transition-all relative py-1 px-2.5 rounded-xl flex flex-col items-center group ${
              isDesktopActive('/notifications')
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <div className="relative">
              <Bell className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {unreadCount && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-md animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold mt-0.5">Alerts</span>
            {isDesktopActive('/notifications') && (
              <span className="absolute -bottom-1.5 w-6 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </Link>
        </nav>

        {/* Right: Theme Toggle, Settings, Logout & User Avatar */}
        <div className="flex items-center space-x-2 shrink-0">
          <DarkModeToggle />

          <Link
            href="/settings"
            className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full transition-colors hover:scale-105"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full transition-colors hover:scale-105"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>

          <Link
            href={`/profile/${user.id}`}
            aria-label="Your profile"
            className="hover:scale-105 transition-transform ml-1"
          >
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover border-2 border-white dark:border-gray-800 ring-2 ring-blue-400 hover:ring-blue-600 transition-all shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-blue-400 hover:ring-blue-600 transition-all shadow-sm">
                {user.name?.charAt(0) || 'U'}
              </div>
            )}
          </Link>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar (shown below md) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-14">
          {MOBILE_TABS.map((tab) => {
            const active = tab.isActive(pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 dark:text-gray-400 hover:text-blue-500'
                }`}
              >
                <span className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`} />
                  {tab.badge && unreadCount && unreadCount > 0 && (
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
    </>
  );
}
