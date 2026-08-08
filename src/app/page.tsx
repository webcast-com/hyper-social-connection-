import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/db';
import { posts, users, likes, comments, follows, bookmarks } from '@/db/schema';
import { stories as storiesTable } from '@/db/schema';
import { eq, desc, gte } from 'drizzle-orm';
import CreatePost from '@/components/CreatePost';
import Stories from '@/components/Stories';
import FeedTabs from '@/components/FeedTabs';
import Link from 'next/link';
import { Compass, Users, Bookmark, Sparkles, Plus } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Hyper — Connect with the world',
  description: 'See what your Hyper community is sharing, discover new friends, and join the conversation.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Hyper — Connect with the world',
    description: 'See what your Hyper community is sharing, discover new friends, and join the conversation.',
    url: '/',
    images: ['/og-image.png'],
  },
};

const DEMO_USERS = [
  { id: 1, name: 'Alex Rivera', email: 'alex@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex', bio: '📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler.', createdAt: new Date() },
  { id: 2, name: 'Maya Patel', email: 'maya@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maya', bio: '🎨 Digital artist and UI designer.', createdAt: new Date() },
  { id: 3, name: 'Jordan Kim', email: 'jordan@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', bio: '🏋️ Fitness coach and wellness advocate.', createdAt: new Date() },
  { id: 4, name: 'Sophie Chen', email: 'sophie@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie', bio: '👩‍💻 Full-stack engineer & open-source builder.', createdAt: new Date() },
  { id: 5, name: 'Marcus Lee', email: 'marcus@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus', bio: '🎸 Musician and content creator.', createdAt: new Date() },
];

const DEMO_POSTS_RAW = [
  {
    id: 1,
    userId: 1,
    content: '🌄 Just got back from an incredible trip to the Swiss Alps! The morning fog clearing over the peaks was breathtaking.',
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    createdAt: new Date(Date.now() - 3600000),
  },
  {
    id: 2,
    userId: 2,
    content: '🎨 Just finished my latest digital concept painting — took 40+ hours in Procreate!',
    imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80',
    createdAt: new Date(Date.now() - 7200000),
  },
  {
    id: 3,
    userId: 3,
    content: '💪 New PR today! Deadlifted 200kg for 3 clean reps. Consistency is everything!',
    imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    createdAt: new Date(Date.now() - 14400000),
  },
  {
    id: 4,
    userId: 4,
    content: '🚀 Shipped our major social feature sprint today! The feed is running silky smooth with tabs and real-time interaction.',
    createdAt: new Date(Date.now() - 28800000),
  },
  {
    id: 5,
    userId: 5,
    content: '🎸 Dropped a new original acoustic track today! Recorded with vintage tube mics.',
    imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80',
    createdAt: new Date(Date.now() - 43200000),
  },
];

const DEMO_STORIES = [
  { id: 1, userId: 1, imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80' },
  { id: 2, userId: 2, imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=400&q=80' },
  { id: 3, userId: 3, imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80' },
  { id: 4, userId: 4, imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80' },
  { id: 5, userId: 5, imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80' },
];

export default async function Home() {
  const viewer = await getViewer();
  const currentUser = viewer || DEMO_USERS[0];

  let allPosts: any[] = [];
  let allUsers: any[] = [];
  let allLikes: any[] = [];
  let allComments: any[] = [];
  let activeStories: any[] = [];
  let userFollows: any[] = [];
  let userBookmarks: any[] = [];

  if (hasDatabase) {
    try {
      allPosts = await db.select().from(posts).orderBy(desc(posts.createdAt));
      allUsers = await db.select().from(users);
      allLikes = await db.select().from(likes);
      allComments = await db.select().from(comments).orderBy(desc(comments.createdAt));
      activeStories = await db.select().from(storiesTable)
        .where(gte(storiesTable.expiresAt, new Date()))
        .orderBy(desc(storiesTable.createdAt));

      if (currentUser.id) {
        userFollows = await db.select().from(follows).where(eq(follows.followerId, currentUser.id));
        userBookmarks = await db.select().from(bookmarks).where(eq(bookmarks.userId, currentUser.id));
      }
    } catch (err) {
      console.warn('[home] DB query failed, falling back to demo feed:', (err as Error)?.message);
    }
  }

  // If database returned no posts (e.g. fresh environment or offline), populate demo content
  if (allUsers.length === 0) allUsers = DEMO_USERS;
  if (allPosts.length === 0) allPosts = DEMO_POSTS_RAW;
  if (activeStories.length === 0) activeStories = DEMO_STORIES;
  if (allLikes.length === 0) {
    allLikes = [
      { postId: 1, userId: 2 }, { postId: 1, userId: 3 }, { postId: 1, userId: 4 },
      { postId: 2, userId: 1 }, { postId: 2, userId: 4 },
      { postId: 3, userId: 1 }, { postId: 3, userId: 2 },
      { postId: 4, userId: 1 }, { postId: 5, userId: 1 },
    ];
  }
  if (allComments.length === 0) {
    allComments = [
      { id: 1, postId: 1, userId: 2, content: 'Oh my gosh, this is STUNNING! 😍', createdAt: new Date(Date.now() - 1800000) },
      { id: 2, postId: 1, userId: 3, content: 'I hiked that same trail last summer! Great shot.', createdAt: new Date(Date.now() - 900000) },
      { id: 3, postId: 2, userId: 1, content: 'This is INCREDIBLE, Maya! The lighting is magical.', createdAt: new Date(Date.now() - 3600000) },
    ];
  }
  if (userFollows.length === 0 && currentUser.id === 1) {
    userFollows = [
      { followerId: 1, followingId: 2 },
      { followerId: 1, followingId: 3 },
      { followerId: 1, followingId: 4 },
    ];
  }

  const usersById = new Map(allUsers.map((u) => [u.id, u]));

  const enrichedStories = activeStories.map((s) => ({
    ...s,
    user: usersById.get(s.userId),
  }));

  const enrichedPostsMap = new Map();
  allPosts.forEach((post) => {
    enrichedPostsMap.set(post.id, {
      ...post,
      user: usersById.get(post.userId),
      likes: allLikes.filter((l) => l.postId === post.id),
      comments: allComments
        .filter((c) => c.postId === post.id)
        .map((c) => ({ ...c, user: usersById.get(c.userId) }))
        .reverse(),
    });
  });

  const enrichedPosts = allPosts.map((post) => {
    const base = enrichedPostsMap.get(post.id);
    if (post.repostOfId && enrichedPostsMap.has(post.repostOfId)) {
      return {
        ...base,
        repostOf: enrichedPostsMap.get(post.repostOfId),
      };
    }
    return base;
  });

  const followingIds = new Set(userFollows.map((f) => f.followingId));
  const bookmarkedPostIds = userBookmarks.map((b) => b.postId);
  const bookmarkedSet = new Set(bookmarkedPostIds);

  const forYouPosts = [...enrichedPosts];
  const followingPosts = enrichedPosts.filter((p) => followingIds.has(p.userId) || p.userId === currentUser.id);
  const savedPosts = enrichedPosts.filter((p) => bookmarkedSet.has(p.id));

  const otherUsers = allUsers.filter((u) => u.id !== currentUser.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 p-4 max-w-7xl mx-auto">
      {/* Left Sidebar */}
      <div className="hidden lg:flex flex-col space-y-2 pt-2">
        <Link href={`/profile/${currentUser.id}`} className="flex items-center space-x-3 p-3 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors group">
          {currentUser.avatar ? (
            <img src={currentUser.avatar} alt="avatar" className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-500/30" />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm">
              {currentUser.name?.charAt(0) || 'U'}
            </div>
          )}
          <div className="min-w-0">
            <span className="font-bold text-sm text-gray-900 dark:text-white block truncate">{currentUser.name}</span>
            <span className="text-xs text-gray-500 block truncate">View profile</span>
          </div>
        </Link>

        <Link href="/discover" className="flex items-center space-x-3 p-3 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors group">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <Compass className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">Discover People</span>
        </Link>

        <Link href="/groups" className="flex items-center space-x-3 p-3 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors group">
          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">Communities & Groups</span>
        </Link>

        <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-400 font-semibold px-2 uppercase tracking-wide mb-2">Shortcuts</p>
          {['Travel & Adventure ✈️', 'Fitness & Health 💪', 'Dev & Tech Talk 💻'].map((g) => (
            <Link key={g} href="/groups" className="flex items-center space-x-3 p-2.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-colors">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-xs">
                {g.slice(-2)}
              </div>
              <span className="font-semibold text-xs text-gray-700 dark:text-gray-300 truncate">{g.slice(0, -3)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Feed */}
      <div className="lg:col-span-2 max-w-2xl mx-auto w-full space-y-4">
        <Stories user={currentUser} stories={enrichedStories} />
        <CreatePost user={currentUser} />

        <FeedTabs
          forYouPosts={forYouPosts}
          followingPosts={followingPosts}
          savedPosts={savedPosts}
          currentUser={currentUser}
          bookmarkedPostIds={bookmarkedPostIds}
        />
      </div>

      {/* Right Sidebar */}
      <div className="hidden lg:flex flex-col space-y-4 pt-2">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/60">
          <h3 className="text-gray-500 dark:text-gray-400 font-semibold text-xs uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-yellow-500" /> People you may know
          </h3>
          <div className="space-y-3">
            {otherUsers.slice(0, 5).map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <Link href={`/profile/${u.id}`} className="flex items-center space-x-2.5 min-w-0">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {u.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-gray-900 dark:text-white truncate">{u.name}</div>
                    <div className="text-[11px] text-gray-400 truncate max-w-[120px]">{u.bio?.slice(0, 30) || 'Hyper user'}</div>
                  </div>
                </Link>
                <Link href={`/profile/${u.id}`} className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded-lg shrink-0">
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/60">
          <h3 className="text-gray-500 dark:text-gray-400 font-semibold text-xs uppercase tracking-wide mb-3">Contacts</h3>
          <div className="space-y-1">
            {otherUsers.slice(0, 8).map((u) => (
              <Link key={u.id} href={`/messages/${u.id}`} className="flex items-center space-x-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-xl cursor-pointer transition-colors">
                <div className="relative">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                      {u.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                </div>
                <span className="font-semibold text-xs text-gray-800 dark:text-gray-200 truncate">{u.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
