import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { prisma, hasDatabase } from '@/lib/prisma';
import CreatePost from '@/components/CreatePost';
import Stories from '@/components/Stories';
import FeedTabs from '@/components/FeedTabs';
import TrendingTopics from '@/components/TrendingTopics';
import { computeTrendingTopics } from '@/lib/trending';
import Link from 'next/link';
import { ArrowRight, Compass, Hash, MessageCircle, Users, Sparkles, Trophy } from 'lucide-react';
import SportsLiveWidget from '@/components/SportsLiveWidget';
import { getSportsBoard } from '@/lib/sports';

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
  const sportsBoard = await getSportsBoard();

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

  // This dynamic server route intentionally evaluates scheduled posts per request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const visiblePosts = enrichedPosts.filter((p) => {
    if (hiddenAuthorIds.has(p.userId)) return false;
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() > now && p.userId !== currentUser.id) return false;
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() > now && p.userId === currentUser.id) return false;
    return true;
  });

  const normalizeTeam = (name?: string | null) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const findPredictionForEvent = (event: any) => {
    const home = normalizeTeam(event.home?.name);
    const away = normalizeTeam(event.away?.name);
    return (sportsBoard.predictions || []).find((prediction) => {
      const pHome = normalizeTeam(prediction.homeTeam);
      const pAway = normalizeTeam(prediction.awayTeam);
      return (pHome.includes(home) || home.includes(pHome)) && (pAway.includes(away) || away.includes(pAway));
    }) || null;
  };

  const sportsFeedPosts = sportsBoard.events.slice(0, 2).map((event, index) => ({
    id: `sports-${event.id}`,
    type: 'sports',
    event,
    prediction: findPredictionForEvent(event) || sportsBoard.predictions?.[index] || null,
    createdAt: new Date(Date.now() - (index + 1) * 90_000),
  }));
  const forYouPosts = [...visiblePosts];
  sportsFeedPosts.forEach((sportsPost, index) => {
    const insertAt = Math.min(index === 0 ? 1 : 4, forYouPosts.length);
    forYouPosts.splice(insertAt, 0, sportsPost);
  });
  const followingPosts = visiblePosts.filter((p) => followingIds.has(p.userId) || p.userId === currentUser.id);
  const savedPosts = visiblePosts.filter((p) => bookmarkedSet.has(p.id));

  const otherUsers = allUsers.filter((u) => u.id !== currentUser.id);
  const mobileGroups = (viewerGroups.length > 0 ? viewerGroups : allGroups).slice(0, 6);

  // Live trending hashtags — computed from whatever posts we ended up with
  // (real DB rows, or the demo feed offline). Empty → widget's own defaults.
  const trendingTopics = computeTrendingTopics(allPosts);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 p-3 sm:p-4 max-w-7xl mx-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_30%)] rounded-[2rem]">
      {/* Left Sidebar — desktop shortcuts */}
      <aside className="hidden lg:flex order-2 lg:order-none flex-col space-y-2 pt-2 w-full max-w-2xl mx-auto lg:max-w-none lg:mx-0">
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
        <section className="lg:hidden overflow-hidden rounded-[1.75rem] border border-blue-100/80 dark:border-blue-900/60 bg-white/90 dark:bg-slate-900/90 shadow-sm backdrop-blur">
          <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-fuchsia-600 px-4 py-4 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-100">Quick access</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black tracking-tight">Catch up fast</h1>
                <p className="text-xs text-blue-100">Sports, trends, contacts and new people are now at the top.</p>
              </div>
              <Link href="/sports" className="shrink-0 rounded-2xl bg-white/20 px-3 py-2 text-xs font-bold backdrop-blur hover:bg-white/30">
                Live scores
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5 px-3 py-3">
            <Link href="/sports" className="rounded-2xl bg-amber-50 p-2 text-center text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
              <Trophy className="mx-auto h-5 w-5" />
              <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">Sports</span>
            </Link>
            <a href="#trending-now" className="rounded-2xl bg-orange-50 p-2 text-center text-orange-700 ring-1 ring-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900/60">
              <Hash className="mx-auto h-5 w-5" />
              <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">Trending</span>
            </a>
            <Link href="/groups" className="rounded-2xl bg-violet-50 p-2 text-center text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
              <Users className="mx-auto h-5 w-5" />
              <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">Groups</span>
            </Link>
            <a href="#people-you-may-know" className="rounded-2xl bg-fuchsia-50 p-2 text-center text-fuchsia-700 ring-1 ring-fuchsia-100 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:ring-fuchsia-900/60">
              <Sparkles className="mx-auto h-5 w-5" />
              <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">People</span>
            </a>
            <a href="#contacts" className="rounded-2xl bg-emerald-50 p-2 text-center text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
              <MessageCircle className="mx-auto h-5 w-5" />
              <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">Contacts</span>
            </a>
          </div>

          <div id="groups" className="border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-slate-400">Groups</h2>
              <Link href="/groups" className="text-[11px] font-bold text-blue-600 dark:text-blue-400">See all</Link>
            </div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
              {mobileGroups.length > 0 ? mobileGroups.map((g, i) => {
                const colors = ['from-violet-500 to-fuchsia-500', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500'];
                return (
                  <Link key={g.id} href={`/groups/${g.id}`} className="min-w-[132px] rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-900/50">
                    <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${colors[i % colors.length]} text-sm font-black text-white shadow-sm`}>
                      {g.name?.charAt(0) || 'G'}
                    </div>
                    <span className="block truncate text-xs font-extrabold text-gray-900 dark:text-white">{g.name}</span>
                    <span className="mt-0.5 block text-[10px] font-semibold text-violet-600 dark:text-violet-300">Open group</span>
                  </Link>
                );
              }) : (
                <Link href="/groups" className="flex min-w-full items-center justify-between rounded-2xl bg-violet-50 px-3 py-3 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900/50">
                  <span className="text-xs font-extrabold">Find groups to join</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>

          <div id="trending-now" className="border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-slate-400">Trending now</h2>
              <Link href="/search" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                Explore <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
              {(trendingTopics.length ? trendingTopics : [
                { tag: '#NextJS', postsCount: 142 },
                { tag: '#WebDev', postsCount: 64 },
                { tag: '#Fitness', postsCount: 45 },
              ]).slice(0, 5).map((topic) => (
                <Link key={topic.tag} href={`/search?q=${encodeURIComponent(topic.tag)}`} className="shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-extrabold text-gray-800 ring-1 ring-gray-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700">
                  {topic.tag} <span className="font-semibold text-gray-400">{topic.postsCount}</span>
                </Link>
              ))}
            </div>
          </div>

          <div id="people-you-may-know" className="border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-slate-400">People you may know</h2>
              <Link href="/discover" className="text-[11px] font-bold text-blue-600 dark:text-blue-400">See all</Link>
            </div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
              {otherUsers.slice(0, 6).map((u) => (
                <Link key={u.id} href={`/profile/${u.id}`} className="min-w-[92px] rounded-2xl bg-gray-50 p-2 text-center ring-1 ring-gray-100 dark:bg-slate-800/80 dark:ring-slate-700">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="mx-auto h-11 w-11 rounded-full object-cover ring-2 ring-white dark:ring-slate-900" />
                  ) : (
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white ring-2 ring-white dark:ring-slate-900">{u.name.charAt(0)}</div>
                  )}
                  <span className="mt-1 block truncate text-[11px] font-bold text-gray-900 dark:text-white">{u.name}</span>
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">View</span>
                </Link>
              ))}
            </div>
          </div>

          <div id="contacts" className="border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-slate-400">Contacts</h2>
              <Link href="/messages" className="text-[11px] font-bold text-blue-600 dark:text-blue-400">Inbox</Link>
            </div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
              {otherUsers.slice(0, 8).map((u) => (
                <Link key={u.id} href={`/messages/${u.id}`} className="relative shrink-0 rounded-2xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:ring-emerald-900/50">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{u.name.charAt(0)}</div>
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-slate-900" />
                    </div>
                    <span className="max-w-[82px] truncate text-xs font-bold text-gray-900 dark:text-white">{u.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

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

      {/* Right Sidebar — desktop discovery rail */}
      <aside className="hidden lg:flex order-3 lg:order-none flex-col space-y-4 pt-2 w-full max-w-2xl mx-auto lg:max-w-none lg:mx-0">
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
