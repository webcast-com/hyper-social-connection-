'use client';

import Link from 'next/link';
import { BadgeCheck, MapPin, UserRound } from 'lucide-react';

/**
 * The profile card embedded in a post created by "share profile to feed/group".
 */
export default function SharedProfileCard({
  profile,
}: {
  profile: {
    id: number;
    name: string;
    username?: string | null;
    avatar?: string | null;
    bio?: string | null;
    location?: string | null;
  };
}) {
  if (!profile) return null;

  return (
    <Link
      href={`/profile/${profile.id}`}
      className="mt-3 flex items-center gap-2.5 sm:gap-3 p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors min-w-0 w-full"
    >
      {profile.avatar ? (
        <img
          src={profile.avatar}
          alt={profile.name}
          className="w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover ring-2 ring-white dark:ring-gray-800 shrink-0"
        />
      ) : (
        <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg sm:text-xl font-bold shrink-0">
          {profile.name?.charAt(0) || 'U'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-gray-900 dark:text-white truncate">{profile.name}</span>
          <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
        </div>
        {profile.username && (
          <div className="text-xs text-gray-500 dark:text-gray-400">@{profile.username}</div>
        )}
        {profile.bio && (
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{profile.bio}</p>
        )}
        {profile.location && (
          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {profile.location}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
        <UserRound className="w-4 h-4" />
        <span className="hidden sm:inline">View</span>
      </span>
    </Link>
  );
}
