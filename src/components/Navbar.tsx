'use client';

import Link from 'next/link';
import { Home, MessageCircle, User as UserIcon, Settings, LogOut, Search, Bell, Compass, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Navbar({ user, unreadCount }: { user: any, unreadCount?: number }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <nav className="fixed top-0 w-full bg-white border-b border-gray-200 z-50 px-4 h-14 flex items-center justify-between shadow-sm">
      <div className="flex items-center space-x-2">
        <Link href="/" className="text-blue-600 font-bold text-2xl tracking-tighter hover:scale-105 transition-transform">
          facebook
        </Link>
        <Link href="/search" className="ml-2 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors hover:scale-105" aria-label="Search">
          <Search className="h-4 w-4 text-gray-600" />
        </Link>
      </div>

      <div className="flex items-center space-x-6 md:space-x-8">
        <Link href="/" className="text-blue-500 hover:text-blue-600 transition-colors relative flex flex-col items-center group">
          <Home className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">Home</span>
        </Link>
        <Link href="/discover" className="text-gray-500 hover:text-blue-500 transition-colors relative flex flex-col items-center group">
          <Compass className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">Discover</span>
        </Link>
        <Link href={`/profile/${user.id}`} className="text-gray-500 hover:text-blue-500 transition-colors relative flex flex-col items-center group">
          <UserIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">Profile</span>
        </Link>
        <Link href="/messages" className="text-gray-500 hover:text-blue-500 transition-colors relative flex flex-col items-center group">
          <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">Messages</span>
        </Link>
        <Link href="/groups" className="text-gray-500 hover:text-blue-500 transition-colors relative flex flex-col items-center group">
          <Users className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">Groups</span>
        </Link>
        <Link href="/notifications" className="text-gray-500 hover:text-blue-500 transition-colors relative flex flex-col items-center group">
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

      <div className="flex items-center space-x-3">
        <Link href="/settings" className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors hover:scale-105" aria-label="Settings">
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
  );
}
