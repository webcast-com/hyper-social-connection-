import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { prisma, hasDatabase } from '@/lib/prisma';
import CreatePost from '@/components/CreatePost';
import Stories from '@/components/Stories';
import FeedTabs from '@/components/FeedTabs';
import TrendingTopics from '@/components/TrendingTopics';
import { computeTrendingTopics } from '@/lib/trending';
import Link from 'next/link';
import { Compass, Users, Sparkles, Trophy } from 'lucide-react';
import SportsLiveWidget from '@/components/SportsLiveWidget';

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

const DEMO_COMMENTS_FALLBACK = [
  { id: 1, postId: 1, userId: 2, content: 'Oh my gosh, this is STUNNING! 😍', createdAt: new Date(Date.now() - 1800000) },
  { id: 2, postId: 1, userId: 3, content: 'I hiked that same trail last summer! Great shot.', createdAt: new Date(Date.now() - 900000) },
  { id: 3, postId: 2, userId: 1, content: 'This is INCREDIBLE, Maya! The lighting is magical.', createdAt: new Date(Date.now() - 3600000) },
  { id: 4, postId: 6, userId: 1, content: 'Next.js + Tailwind is the sweet spot for shipping fast! #WebDev', createdAt: new Date(Date.now() - 1200000) },
];

const DEMO_POSTS_RAW: any[] = [
  {
    id: 7,
    userId: 4,
    content: '⚡ Check out the latest React 19 & Next.js full-stack capabilities on https://nextjs.org — Turbopack compiles in milliseconds! #NextJS #WebDev #TypeScript',
    createdAt: new Date(Date.now() - 900000),
    linkPreview: {
      url: 'https://nextjs.org',
      domain: 'nextjs.org',
      title: 'Next.js by Vercel — The React Framework for the Web',
      description: 'Used by some of the world’s largest companies, Next.js enables you to create high-quality full-stack web applications with speed and scale.',
      image: 'https://nextjs.org/og.png',
      favicon: 'https://www.google.com/s2/favicons?domain=nextjs.org&sz=64',
    },
  },
  {
    id: 6,
    userId: 4,
    content: '📊 Community Poll: Which modern web stack are you building your side projects with this year? #WebDev #NextJS #TechTrends',
    createdAt: new Date(Date.now() - 1800000),
    poll: {
      id: 1,
      question: 'Which modern web stack are you building with?',
      expiresAt: new Date(Date.now() + 86400000),
      options: [
        { id: 1, text: 'Next.js + TypeScript + Tailwind CSS ⚡', votesCount: 34 },
        { id: 2, text: 'SvelteKit + Postgres 🚀', votesCount: 18 },
        { id: 3, text: 'Go / Rust + HTMX 🦀', votesCount: 11 },
        { id: 4, text: 'Astro / Remix / Vite 🌐', votesCount: 7 },
      ],
      userVotedOptionId: null,
    },
  },
  {
    id: 1,
    userId: 1,
    content: '🌄 Just got back from an incredible trip to the Swiss Alps! The morning fog clearing over the peaks was breathtaking. #SwissAlps #Travel #Photography',
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    createdAt: new Date(Date.now() - 3600000),
  },
  {
    id: 2,
    userId: 2,
    content: '🎨 Just finished my latest digital concept painting — took 40+ hours in Procreate! #DigitalArt #Illustration #Design',
    imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80',
    createdAt: new Date(Date.now() - 7200000),
  },
  {
    id: 3,
    userId: 3,
    content: '💪 New PR today! Deadlifted 200kg for 3 clean reps. Consistency is everything! #FitnessGoals #Workout #Motivation',
    imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    createdAt: new Date(Date.now() - 14400000),
  },
  {
    id: 4,
    userId: 4,
    content: '🚀 Shipped our major social feature sprint today! The feed is running silky smooth with tabs and real-time interaction. #NextJS #OpenSource',
    createdAt: new Date(Date.now() - 28800000),
  },
  {
    id: 5,
    userId: 5,
    content: '🎸 Dropped a new original acoustic track today! Recorded with vintage tube mics. #Acoustic #MusicProduction',
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
  // Demo content is readable without a session, but the fallback identity is
  // deliberately a guest so it can never be mistaken for Alex or used for a
  // mutation by server actions.
  const currentUser = viewer || {
    id: 0,
    name: 'Guest',
    email: '',
    avatar: null,
    bio: null,
    createdAt: new Date(),
  };

  let allPosts: any[] = [];
  let allUsers: any[] = [];
  let allLikes: any[] = [];
  let allComments: any[] = [];
  let activeStories: any[] = [];
  let userFollows: any[] = [];
  let userBookmarks: any[] = [];
  let allPolls: any[] = [];
  let allPollOptions: any[] = [];
  let allPollVotes: any[] = [];
  let allGroups: any[] = [];
  let viewerGroupIds: number[] = [];
  let hiddenAuthorIds = new Set<number>();

  // Set when the database is configured but the feed query failed — almost
  // always a schema drift (the DB is missing a column the app selects, e.g.
  // posts.repost_of_id) or an unreachable DATABASE_URL. Without this flag the
  // fallback below silently shows demo content while real data sits in the DB.
  let dbFeedError: string | null = null;

  if (hasDatabase) {
    try {
      allPosts = await prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
      allUsers = await prisma.user.findMany();
      allLikes = await prisma.like.findMany();
      allComments = await prisma.comment.findMany({ orderBy: { createdAt: 'desc' } });
      activeStories = await prisma.story.findMany({
        where: { expiresAt: { gte: new Date() } },
        orderBy: { createdAt: 'desc' },
      });

      allPolls = await prisma.poll.findMany();
      allPollOptions = await prisma.pollOption.findMany();
      allPollVotes = await prisma.pollVote.findMany();
      allGroups = await prisma.group.findMany();

      if (currentUser.id) {
        userFollows = await prisma.follow.findMany({ where: { followerId: currentUser.id } });
        userBookmarks = await prisma.bookmark.findMany({ where: { userId: currentUser.id } });
        const memberships = await prisma.groupMember.findMany({
          where: { userId: currentUser.id },
          select: { groupId: true },
        });
        viewerGroupIds = memberships.map((m) => m.groupId);
        const [blocks, mutes] = await Promise.all([
          prisma.block.findMany({
            where: { OR: [{ blockerId: currentUser.id }, { blockedId: currentUser.id }] },
          }),
          prisma.mute.findMany({ where: { muterId: currentUser.id } }),
        ]);
        hiddenAuthorIds = new Set<number>([
          ...blocks.map((b) => (b.blockerId === currentUser.id ? b.blockedId : b.blockerId)),
          ...mutes.map((m) => m.mutedId),
        ]);
      }
    } catch (err) {
      dbFeedError = (err as Error)?.message || 'unknown database error';
      console.error(
        '[home] DATABASE FEED QUERY FAILED — showing demo fallback instead of real data.\n' +
        '       Most common cause: schema drift or an unreachable DATABASE_URL.\n' +
        '       Fix: run `npx prisma db push` with DATABASE_URL set — it syncs\n' +
        '       your Postgres database with prisma/schema.prisma. Check connectivity at /api/health.\n' +
        '       Error: ' + dbFeedError,
      );
    }
  }

  // If database returned no posts (e.g. fresh environment or offline), populate demo content
  if (allUsers.length === 0) allUsers = DEMO_USERS;
  if (allPosts.length === 0) allPosts = DEMO_POSTS_RAW;
  if (activeStories.length === 0) activeStories = DEMO_STORIES;
  if (allLikes.length === 0) {
    allLikes = [
      { postId: 6, userId: 1 }, { postId: 6, userId: 2 }, { postId: 6, userId: 3 },
      { postId: 1, userId: 2 }, { postId: 1, userId: 3 }, { postId: 1, userId: 4 },
      { postId: 2, userId: 1 }, { postId: 2, userId: 4 },
      { postId: 3, userId: 1 }, { postId: 3, userId: 2 },
      { postId: 4, userId: 1 }, { postId: 5, userId: 1 },
    ];
  }
  if (allComments.length === 0) {
    allComments = DEMO_COMMENTS_FALLBACK;
  }
  if (userFollows.length === 0 && currentUser.id === 1) {
    userFollows = [
      { followerId: 1, followingId: 2 },
      { followerId: 1, followingId: 3 },
      { followerId: 1, followingId: 4 },
    ];
  }

  const usersById = new Map(allUsers.map((u) => [u.id, u]));
  const groupsById = new Map(allGroups.map((g) => [g.id, g]));
  const viewerGroups = viewerGroupIds
    .map((gid) => groupsById.get(gid))
    .filter(Boolean) as any[];

  const enrichedStories = activeStories.map((s) => ({
    ...s,
    user: usersById.get(s.userId),
  }));

  const enrichedPostsMap = new Map();
  allPosts.forEach((post) => {
    // Map attached poll
    let postPoll = post.poll || null;
    if (!postPoll && allPolls.length > 0) {
      const p = allPolls.find((pl) => pl.postId === post.id);
      if (p) {
        const opts = allPollOptions
          .filter((opt) => opt.pollId === p.id)
          .sort((a, b) => a.position - b.position)
          .map((opt) => ({
            id: opt.id,
            text: opt.text,
            votesCount: allPollVotes.filter((v) => v.optionId === opt.id).length,
          }));
        const userVote = allPollVotes.find((v) => v.pollId === p.id && v.userId === currentUser.id);
        postPoll = {
          id: p.id,
          question: p.question,
          expiresAt: p.expiresAt,
          options: opts,
          userVotedOptionId: userVote?.optionId || null,
        };
      }
    }

    enrichedPostsMap.set(post.id, {
      ...post,
      poll: postPoll,
      user: usersById.get(post.userId),
      group: post.groupId ? groupsById.get(post.groupId) || null : null,
      likes: allLikes
        .filter((l) => l.postId === post.id)
        .map((l) => ({ ...l, user: usersById.get(l.userId) })),
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

  const now = Date.now();
  const visiblePosts = enrichedPosts.filter((p) => {
    if (hiddenAuthorIds.has(p.userId)) return false;
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() > now && p.userId !== currentUser.id) return false;
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() > now && p.userId === currentUser.id) return false;
    return true;
  });

  const forYouPosts = [...visiblePosts];
  const followingPosts = visiblePosts.filter((p) => followingIds.has(p.userId) || p.userId === currentUser.id);
  const savedPosts = visiblePosts.filter((p) => bookmarkedSet.has(p.id));

  const otherUsers = allUsers.filter((u) => u.id !== currentUser.id);

  // Live trending hashtags — computed from whatever posts we ended up with
  // (real DB rows, or the demo feed offline). Empty → widget's own defaults.
  const trendingTopics = computeTrendingTopics(allPosts);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 p-3 sm:p-4 max-w-7xl mx-auto">
      {/* Left Sidebar — below the feed on mobile (order-2), left column on desktop */}
      <aside className="order-2 lg:order-none flex flex-col space-y-2 pt-2 w-full max-w-2xl mx-auto lg:max-w-none lg:mx-0">
        <Link href={`/profile/${currentUser.id}`} className="hidden lg:flex items-center space-x-3 p-3 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors group">
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

        <Link href="/discover" className="hidden lg:flex items-center space-x-3 p-3 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors group">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <Compass className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">Discover People</span>
        </Link>

        <Link href="/groups" className="hidden lg:flex items-center space-x-3 p-3 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors group">
          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">Communities & Groups</span>
        </Link>

        <Link href="/sports" className="hidden lg:flex items-center space-x-3 p-3 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors group">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">Sports scores</span>
        </Link>

        <div className="lg:pt-3 lg:border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-400 font-semibold px-2 uppercase tracking-wide mb-2">Shortcuts</p>
          {viewerGroups.slice(0, 4).map((g, i) => {
            const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-pink-500', 'bg-amber-500'];
            return (
              <Link key={g.id} href={`/groups/${g.id}`} className="flex items-center space-x-3 p-2.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-colors">
                <div className={`w-8 h-8 ${colors[i % colors.length]} rounded-lg flex items-center justify-center text-xs text-white font-bold`}>
                  {g.name?.charAt(0) || 'G'}
                </div>
                <span className="font-semibold text-xs text-gray-700 dark:text-gray-300 truncate">{g.name}</span>
              </Link>
            );
          })}
          <Link href="/groups" className="flex items-center space-x-3 p-2.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-colors">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-xs">
              <Users className="w-4 h-4 text-gray-500 dark:text-gray-300" />
            </div>
            <span className="font-semibold text-xs text-gray-700 dark:text-gray-300 truncate">
              {viewerGroups.length === 0 ? 'Find groups to join' : 'See all groups'}
            </span>
          </Link>
        </div>
      </aside>

      {/* Main Feed — first on mobile */}
      <div className="order-1 lg:order-none lg:col-span-2 max-w-2xl mx-auto w-full space-y-4">
        {dbFeedError && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-2xl px-4 py-3">
            <p className="font-bold mb-0.5">Showing demo content — live data unavailable</p>
            <p className="opacity-80">
              The app is configured for a database, but the feed query failed
              ({dbFeedError.slice(0, 120)}). This is usually a schema drift — run
              <code className="mx-1 px-1 rounded bg-amber-100 dark:bg-amber-900/40">npx prisma db push</code>
              with DATABASE_URL set, then check <code className="px-1 rounded bg-amber-100 dark:bg-amber-900/40">/api/health</code>.
            </p>
          </div>
        )}
        {viewer ? (
          <>
            <Stories user={viewer} stories={enrichedStories} />
            <CreatePost user={viewer} />
          </>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-sm rounded-2xl px-4 py-3">
            <span className="font-semibold">
              {hasDatabase ? 'You are viewing the feed as a guest.' : "You're viewing a read-only demo."}
            </span>{' '}
            <Link href="/login" className="font-bold underline hover:no-underline">Sign in</Link>{' '}
            to post, react, message, or create stories.
          </div>
        )}

        <FeedTabs
          forYouPosts={forYouPosts}
          followingPosts={followingPosts}
          savedPosts={savedPosts}
          currentUser={currentUser}
          bookmarkedPostIds={bookmarkedPostIds}
        />
      </div>

      {/* Right Sidebar — below the feed on mobile (order-3), right column on desktop */}
      <aside className="order-3 lg:order-none flex flex-col space-y-4 pt-2 w-full max-w-2xl mx-auto lg:max-w-none lg:mx-0">
        {/* Trending Topics Widget — live hashtags computed from the posts above */}
        <TrendingTopics topics={trendingTopics} />

        <SportsLiveWidget />

        {/* Suggested People */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/60">
          <h3 className="text-gray-500 dark:text-gray-400 font-semibold text-xs uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-yellow-500" /> People you may know
          </h3>
          <div className="space-y-3">
            {otherUsers.slice(0, 4).map((u) => (
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

        {/* Contacts */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/60">
          <h3 className="text-gray-500 dark:text-gray-400 font-semibold text-xs uppercase tracking-wide mb-3">Contacts</h3>
          <div className="space-y-1">
            {otherUsers.slice(0, 6).map((u) => (
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
      </aside>
    </div>
  );
}
