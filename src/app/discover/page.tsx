import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { prisma, hasDatabase } from '@/lib/prisma';
import { canViewProfileDetails } from '@/lib/profile';
import Link from 'next/link';
import { Users, Sparkles, Trophy } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Discover People and Communities',
  description: 'Find interesting people, communities, and conversations to follow on Hyper.',
  alternates: { canonical: '/discover' },
  openGraph: {
    title: 'Discover People and Communities | Hyper',
    description: 'Find interesting people, communities, and conversations to follow on Hyper.',
    url: '/discover',
    images: ['/og-image.png'],
  },
};

export default async function Discover() {
  const currentUser = await getViewer() || { id: 0 } as any;

  let followingIds: { id: number }[] = [];
  let discoverUsers: any[] = [];
  let trendingPosts: any[] = [];
  if (hasDatabase) {
    try {
      followingIds = currentUser.id
        ? (await prisma.follow.findMany({
            where: { followerId: currentUser.id },
            select: { followingId: true },
          })).map((f) => ({ id: f.followingId }))
        : [];
      discoverUsers = await prisma.user.findMany({
        where: { id: { not: currentUser.id || 0 } },
        take: 20,
      });
      trendingPosts = (await prisma.post.findMany({
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })).map((post) => ({ post, user: post.user }));
    } catch (err) {
      console.warn('[discover] DB query failed:', (err as Error)?.message);
    }
  }
  const followingIdsSet = new Set(followingIds.map(f => f.id));
  const filteredUsers = discoverUsers.filter(u => !followingIdsSet.has(u.id));

  const isGuest = !currentUser || currentUser.id === 0;

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-4 mt-2 sm:mt-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 sm:mb-8 flex items-center gap-2 text-gray-900 dark:text-white">
        <Sparkles className="text-yellow-500" /> Discover
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl p-4 sm:p-6 text-white shadow-md mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold mb-1 sm:mb-2">Discover People</h2>
            <p className="text-blue-50 text-xs sm:text-sm">Follow new people to see their posts in your feed.</p>
          </div>

          <Link
            href="/sports"
            className="flex items-center justify-between gap-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg mb-6 hover:opacity-95 transition-opacity"
          >
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5" /> Live sports
              </h2>
              <p className="text-amber-50 text-sm mt-1">Premier League, UCL, NBA, NFL and F1 from multiple feeds.</p>
            </div>
            <span className="text-sm font-semibold shrink-0">Open →</span>
          </Link>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <Users className="text-blue-500" /> Suggested for You
            </h3>
            <div className="space-y-3">
              {filteredUsers.slice(0, 6).map(user => (
                <Link key={user.id} href={`/profile/${user.id}`} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded-lg border border-gray-100 dark:border-gray-700 transition-colors">
                  <div className="flex items-center space-x-3 min-w-0">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {user.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold truncate text-gray-900 dark:text-white">{user.name}</div>
                      {/* Bio only when this viewer can view the profile's details. */}
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {canViewProfileDetails({
                          isSelf: false,
                          isFollower: followingIdsSet.has(user.id),
                          visibility: user.profileVisibility,
                        })
                          ? user.bio || 'No bio'
                          : 'No bio'}
                      </div>
                    </div>
                  </div>
                  <span className="text-blue-600 dark:text-blue-400 text-xs sm:text-sm font-semibold shrink-0 bg-blue-50 dark:bg-blue-900/30 sm:bg-transparent sm:dark:bg-transparent px-2.5 py-1 sm:p-0 rounded-full">View</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 md:sticky md:top-20">
            <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">Trending Posts</h3>
            <div className="space-y-4">
              {trendingPosts.map((res: any) => (
                <Link key={res.post.id} href={`/profile/${res.post.userId}`} className="block p-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded-lg border border-gray-100 dark:border-gray-700 transition-colors">
                  <div className="flex items-center space-x-2 mb-2">
                    {res.user?.avatar ? (
                      <img src={res.user.avatar} alt={res.user.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                        {res.user?.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">{res.user?.name}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{res.post.content}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
