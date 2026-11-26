import { getHomeMetadata, getWebsiteStructuredData } from '@/lib/seo';
import { getSiteUrl } from '@/lib/site-url';
import { organizationStructuredData } from '@/lib/structured-data';
import JsonLd from '@/components/JsonLd';
import { SPORTS_KEYWORDS } from '@/lib/sports-keywords';
import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/lib/prisma';
import { or } from '@prisma/orm-postgres/orm-client';
import { canViewProfileDetails, sharedProfileCardData } from '@/lib/profile';
import CreatePost from '@/components/CreatePost';
import Stories from '@/components/Stories';
import FeedTabs from '@/components/FeedTabs';
import { HomeLeagueFilterBar, HomeLeagueFilterProvider, type HomeLeagueItem } from '@/components/HomeLeagueFilter';
import TrendingTopics from '@/components/TrendingTopics';
import { computeTrendingTopics } from '@/lib/trending';
import Link from 'next/link';
import { groupHref, profileHref } from '@/lib/social-href';
import { ArrowRight, Clapperboard, Compass, Radio, Users, Sparkles, Target, Trophy } from 'lucide-react';
import SportsMatchCentre from '@/components/SportsMatchCentre';
import SportsLeadersBoard from '@/components/SportsLeadersBoard';
import LiveStreamToast from '@/components/LiveStreamToast';
import SponsorBanners from '@/components/SponsorBanners';
import { sponsorBannerFor } from '@/lib/sponsor-banners';
import SportsLeadersRail from '@/components/SportsLeadersRail';
import SportsHighlightsFeed from '@/components/SportsHighlightsFeed';
import { featuredSportsEvents, getSportsBoard } from '@/lib/sports';
import { getEspnOdds } from '@/lib/espn-odds-feed';
import { oddsFeedPredictions } from '@/lib/odds-feed-predictions';
import { orderCentreEvents } from '@/lib/match-centre';
import { getSportsLeaderBoards } from '@/lib/espn-leaders-feed';
import { getSportsScorers } from '@/lib/espn-scorers-feed';
import { athleteHref } from '@/lib/espn-athlete';
import { ALL_STORED_DAYS, getHighlightsBoardForRender, getHighlightClipsForFeed, recentHighlightClips } from '@/lib/highlights-board';
import { nudgeHighlightsSweep } from '@/lib/highlights-sweep';
import { nudgePickGrading } from '@/lib/sports-picks-grader';
import { dedupeAnchorRefs, highlightAnchorRefs, highlightClipsAnchorRefs, leaderAnchorRefs, loadAnchorEngagement, SPORTS_DESK } from '@/lib/sports-anchor-store';
import { anchorKey, anchorRef, highlightAnchorId } from '@/lib/sports-anchor';
import { getSportsVideoNewsForRender, MAX_FEED_CLIPS } from '@/lib/espn-video-news-feed';
import { getSportsNews } from '@/lib/espn-news-feed';
import { ESPN_LEAGUES } from '@/lib/sports-catalog';
import { HIGHLIGHTS_FEED_SLOTS, interleaveFeedCards, SPORTS_FEED_SLOTS, VIDEO_NEWS_FEED_SLOTS } from '@/lib/feed-interleave';

export const metadata = getHomeMetadata(SPORTS_KEYWORDS);

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

/**
 * One row of the desktop navigation rail: an icon well and a label. The well
 * takes either an icon or a short code ("NBA"), so the two competitions with
 * their own dashboards are told apart without a second icon set.
 */
function RailLink({ href, label, well, children }: {
  href: string;
  label: string;
  /** Colours of the icon well. */
  well: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="group flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-gray-200/70 dark:hover:bg-gray-800">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black tracking-tight transition-transform group-hover:scale-105 ${well}`}>
        {children}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
    </Link>
  );
}

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
  // Started before the other feeds so its render budget overlaps theirs instead
  // of adding to them. League video news is its own stack: its own endpoints,
  // cache and card, sharing nothing with the match highlights board.
  const videoNewsPromise = getSportsVideoNewsForRender();
  // The odds board behind /sports/predictions, started alongside the scores
  // board so the two fan-outs overlap. It shares that page's in-process cache,
  // and a failure simply means a feed without prediction cards.
  const oddsBoardPromise = getEspnOdds().catch(() => null);
  const sportsBoard = await getSportsBoard();
  // Players and top scorers are the sports content visitors ask for most, so the
  // homepage renders the leaders board next to the scores. A failed leaders feed
  // resolves to an empty board — no sample players — and never blocks the page.
  const safeScorers = (slug: string) =>
    Promise.resolve().then(() => getSportsScorers(slug)).catch(() => null);

  const [leaderBoards, eplScorers, wslScorers, nwslScorers, sportsNewsBoard] = await Promise.all([
    getSportsLeaderBoards(),
    safeScorers('epl'),
    safeScorers('wsl'),
    safeScorers('nwsl'),
    getSportsNews(
      ESPN_LEAGUES.filter((l) => ['epl', 'nba', 'nfl', 'ucl'].includes(l.slug)),
    ).catch(() => null),
  ]);

  // Round-robin mix of NBA, NFL, men's football (EPL), and women's football (WSL, NWSL)
  // top scorers & leaders for the "People you may know" slots.
  type FeaturedPlayer = { key: string; name: string; avatar: string | null; subtitle: string; href: string };
  const playerBuckets: FeaturedPlayer[][] = [
    (leaderBoards?.basketball?.rows ?? []).slice(0, 4).map((r) => ({
      key: `nba-${r.key}`,
      name: r.name,
      avatar: r.headshot ?? r.teamLogo ?? null,
      subtitle: `NBA · ${r.value}`,
      href: r.athleteId ? athleteHref({ league: 'nba', athleteId: r.athleteId }) : '/sports',
    })),
    (leaderBoards?.football?.rows ?? []).slice(0, 4).map((r) => ({
      key: `nfl-${r.key}`,
      name: r.name,
      avatar: r.headshot ?? r.teamLogo ?? null,
      subtitle: `NFL · ${r.value}`,
      href: r.athleteId ? athleteHref({ league: 'nfl', athleteId: r.athleteId }) : '/sports',
    })),
    (eplScorers?.scorers ?? []).slice(0, 4).map((s, idx) => ({
      key: `epl-${s.athleteId ?? idx}`,
      name: s.name,
      avatar: s.headshot ?? s.teamLogo ?? null,
      subtitle: `EPL · ${s.goals} G`,
      href: s.athleteId ? athleteHref({ league: 'epl', athleteId: s.athleteId }) : '/sports',
    })),
    (wslScorers?.scorers ?? []).slice(0, 4).map((s, idx) => ({
      key: `wsl-${s.athleteId ?? idx}`,
      name: s.name,
      avatar: s.headshot ?? s.teamLogo ?? null,
      subtitle: `WSL · ${s.goals} G`,
      href: s.athleteId ? athleteHref({ league: 'wsl', athleteId: s.athleteId }) : '/sports',
    })),
    (nwslScorers?.scorers ?? []).slice(0, 4).map((s, idx) => ({
      key: `nwsl-${s.athleteId ?? idx}`,
      name: s.name,
      avatar: s.headshot ?? s.teamLogo ?? null,
      subtitle: `NWSL · ${s.goals} G`,
      href: s.athleteId ? athleteHref({ league: 'nwsl', athleteId: s.athleteId }) : '/sports',
    })),
  ];
  const featuredPlayers: FeaturedPlayer[] = [];
  const seenPlayerKeys = new Set<string>();
  const maxBucketLen = Math.max(0, ...playerBuckets.map((b) => b.length));
  for (let i = 0; i < maxBucketLen; i++) {
    for (const bucket of playerBuckets) {
      const p = bucket[i];
      if (!p || seenPlayerKeys.has(p.key)) continue;
      seenPlayerKeys.add(p.key);
      featuredPlayers.push(p);
    }
  }
  // Stored clips first: a Postgres read with no ESPN request, filled by the
  // sweeper. Only when storage cannot answer in time, or holds too few clips to
  // make a card, does this fall back to the live feed — the same cached board,
  // the same sample fallback, the same cards. Started where the live feed used to
  // be started, so nothing else on this page competes with it any differently.
  const highlightBoard = await getHighlightsBoardForRender();
  // The feed is supplied by the same stored clips the Match Highlights page
  // pages through: every match clip this site has read, newest first, not the
  // handful the highlights list beside it shows. The same stored rows and the
  // same zero ESPN cost, read with the lean query — rows and a count, none of
  // the index page's summaries — and merged with any real clip on the board the
  // sweep has not stored yet. The Highlights tab shows all of them; For You
  // keeps the recent ones (see `recentHighlightClips`). A board ESPN did not
  // answer contributes nothing: its clips are samples, and a card in the middle
  // of the feed has no heading to say so.
  const feedHighlights = await getHighlightClipsForFeed({ board: highlightBoard, days: ALL_STORED_DAYS });
  // The homepage is the busiest surface on the site, so it is also where coverage
  // grows: one bounded pass, scheduled past this response with `after` so it is
  // not frozen when the page finishes streaming, and rate-limited to one per ten
  // minutes per process. Never awaited, never able to fail the render.
  nudgeHighlightsSweep();
  // Picks are graded from results the board already reports, so the pass belongs
  // behind the one page that has just fetched that board: scheduled past this
  // response, rate-limited, and reading the cached board rather than asking ESPN
  // again. The predictions page deliberately does not nudge — it reads odds, not
  // a board, so a pass there would pay for a full scoreboard fan-out.
  nudgePickGrading();
  const videoNewsBoard = await videoNewsPromise;
  // Every sports card can be liked, commented on, saved and shared like a post:
  // the first interaction creates its anchor post, and this one bounded query
  // reads back the saved state for the cards about to be rendered. Cards nobody
  // has engaged with cost a key lookup and stay read-only until someone does.
  // Refs for every card about to be rendered, deduplicated and ordered so the
  // lookup's ceiling cuts the right thing: the cards that are always on screen
  // first — the leader boards and the highlights list — then the feed's clips
  // newest to oldest. A clip the ceiling does cut shows a Like count of zero over
  // a clip that may have likes, a wrong number rather than a missing one, so the
  // oldest card deep in the feed is the one that carries it.
  const engagementRefs = dedupeAnchorRefs(
    leaderAnchorRefs(leaderBoards),
    highlightAnchorRefs(highlightBoard),
    highlightClipsAnchorRefs(feedHighlights.clips, feedHighlights.clips.length),
  );
  const anchorEngagement = await loadAnchorEngagement(engagementRefs, viewer?.id ?? null, {
    maxRefs: engagementRefs.length,
  });
  const signedIn = !!viewer;

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
      allPosts = await db.orm.public.Post.orderBy((o) => o.createdAt.desc()).all();
      allUsers = await db.orm.public.User.all();
      allLikes = await db.orm.public.Like.all();
      allComments = await db.orm.public.Comment.orderBy((o) => o.createdAt.desc()).all();
      activeStories = await db.orm.public.Story
        .where((m) => m.expiresAt.gte(new Date()))
        .orderBy((o) => o.createdAt.desc())
        .all();

      allPolls = await db.orm.public.Poll.all();
      allPollOptions = await db.orm.public.PollOption.all();
      allPollVotes = await db.orm.public.PollVote.all();
      allGroups = await db.orm.public.Group.all();

      if (currentUser.id) {
        userFollows = await db.orm.public.Follow.where({ followerId: currentUser.id }).all();
        userBookmarks = await db.orm.public.Bookmark.where({ userId: currentUser.id }).all();
        const memberships = await db.orm.public.GroupMember
          .where({ userId: currentUser.id })
          .select('groupId')
          .all();
        viewerGroupIds = memberships.map((m) => m.groupId);
        const [blocks, mutes] = await Promise.all([
          db.orm.public.Block
            .where((m) => or(m.blockerId.eq(currentUser.id), m.blockedId.eq(currentUser.id)))
            .all(),
          db.orm.public.Mute.where({ muterId: currentUser.id }).all(),
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
        '       Fix: run `npm run db:migrate` with DATABASE_URL set — it applies the\n' +
        '       committed Prisma migrations. `npm run db:check` shows drift; /api/health shows connectivity.\n' +
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
  const followingIds = new Set(userFollows.map((f) => f.followingId));
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
      // Profile card attached via "share profile to feed/group". Trimmed to
      // card-safe fields and gated by the shared profile's visibility.
      sharedProfile: post.sharedProfileId
        ? sharedProfileCardData(usersById.get(post.sharedProfileId), {
            viewerId: currentUser.id || null,
            isFollower: followingIds.has(post.sharedProfileId),
          })
        : null,
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

  const bookmarkedPostIds = userBookmarks.map((b) => b.postId);

  // This dynamic server route intentionally evaluates scheduled posts per request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const visiblePosts = enrichedPosts.filter((p) => {
    if (hiddenAuthorIds.has(p.userId)) return false;
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() > now && p.userId !== currentUser.id) return false;
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() > now && p.userId === currentUser.id) return false;
    return true;
  });

  // The board's own predictions (none today) plus picks derived from the ESPN
  // odds board — the same cards the /sports/predictions page builds tips from.
  const sportsPredictions = [...(sportsBoard.predictions || []), ...oddsFeedPredictions(await oddsBoardPromise)];
  const normalizeTeam = (name?: string | null) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const findPredictionForEvent = (event: any) => {
    const home = normalizeTeam(event.home?.name);
    const away = normalizeTeam(event.away?.name);
    return sportsPredictions.find((prediction) => {
      const pHome = normalizeTeam(prediction.homeTeam);
      const pAway = normalizeTeam(prediction.awayTeam);
      return !!home && !!away && !!pHome && !!pAway && (pHome.includes(home) || home.includes(pHome)) && (pAway.includes(away) || away.includes(pAway));
    }) || null;
  };

  // Every fixture the board reports — live, upcoming and finished, from any
  // competition and any sport — becomes a card. There is no cap on how many the
  // feed carries.
  //
  // Asking `featuredSportsEvents` for as many as exist keeps the ordering rule it
  // already had rather than adding a second one: one fixture per sport first, so
  // the cards interleaved at the top of the feed are not four football matches on
  // a day when football dominates the board, and then every remaining fixture in
  // the board's own order, which is live first, then by kickoff. Those first four
  // land at their usual slots among the member posts; the rest follow the posts,
  // and `FeedTabs` reveals them in batches so a 1,000-fixture day does not put
  // 1,000 interactive cards in the DOM at once.
  const sportsFeedPosts = featuredSportsEvents(sportsBoard.events, sportsBoard.events.length).map((event, index) => ({
    id: `sports-${event.id}`,
    type: 'sports',
    event,
    prediction: findPredictionForEvent(event),
    // eslint-disable-next-line react-hooks/purity
    createdAt: new Date(Date.now() - (index + 1) * 90_000),
  }));
  const predictionFeedPosts = sportsPredictions.slice(0, 2).map((prediction, index) => ({
    id: `prediction-${prediction.id}`,
    type: 'prediction',
    prediction,
    // eslint-disable-next-line react-hooks/purity
    createdAt: new Date(Date.now() - (index + 1) * 120_000),
  }));
  // League video news is a separate stack from the match highlights board: its
  // own feed, endpoints and card. It joins the For You feed the same way the
  // match and prediction cards do, in its own pass below so their slots stay
  // exactly where they were. A feed ESPN did not answer contributes nothing —
  // there are no sample clips here to stand in for it.
  const videoNewsFeedPosts = videoNewsBoard.clips.slice(0, MAX_FEED_CLIPS).map((clip, index) => ({
    id: `video-news-${clip.id}`,
    type: 'video-news',
    clip,
    // eslint-disable-next-line react-hooks/purity
    createdAt: new Date(Date.now() - (index + 1) * 100_000),
  }));

  // Every highlight clip the read carried, newest first, each one a post card a
  // reader can like, comment on and save like anything else in the feed. There is
  // no cap on how many the feed carries; the tab reveals them in batches. This is
  // the Highlights tab's list.
  const highlightFeedPosts = feedHighlights.clips.map((clip, index) => {
    const anchor = anchorRef('highlight', highlightAnchorId(clip));
    return {
      id: `highlight-${clip.id}`,
      type: 'highlight',
      clip,
      anchor,
      engagement: anchor ? anchorEngagement[anchorKey(anchor)] ?? null : null,
      // eslint-disable-next-line react-hooks/purity
      createdAt: new Date(Date.now() - (index + 1) * 80_000),
    };
  });

  // For You takes the recent ones from that same list — the same card objects,
  // so a clip engages identically in either tab.
  const recentHighlightIds = new Set(recentHighlightClips(feedHighlights.clips, highlightBoard).map((clip) => clip.id));
  const forYouHighlightPosts = highlightFeedPosts.filter((post) => recentHighlightIds.has(post.clip.id));

  const newsFeedPosts = (sportsNewsBoard?.articles ?? []).slice(0, 6).map((article) => ({
    id: `news-${article.id}`,
    type: 'news',
    article,
  }));

  // Each card kind gets its own pass over the feed, so adding league video news
  // or highlights cannot move the match and prediction cards already there.
  const forYouPosts = interleaveFeedCards(
    interleaveFeedCards(
      interleaveFeedCards(
        interleaveFeedCards(visiblePosts, [...sportsFeedPosts, ...predictionFeedPosts], SPORTS_FEED_SLOTS),
        videoNewsFeedPosts,
        VIDEO_NEWS_FEED_SLOTS,
      ),
      forYouHighlightPosts,
      HIGHLIGHTS_FEED_SLOTS,
    ),
    newsFeedPosts,
    [2, 6, 11, 16, 21, 26],
  );
  // On desktop the standalone leader board above the feed was removed so highlights
  // and leaders appear in between posts as you scroll. Insert a leaders card into
  // the feed (desktop-only to avoid duplicating the mobile compact panel).
  if (leaderBoards?.football?.rows?.length || leaderBoards?.basketball?.rows?.length) {
    const leadersFeedPost = {
      id: 'leaders-feed',
      type: 'leaders',
      boards: leaderBoards,
      engagement: anchorEngagement,
      desktopOnly: true,
    };
    const insertAt = Math.min(4, forYouPosts.length);
    forYouPosts.splice(insertAt, 0, leadersFeedPost);
  }

  // The Live tab is the sports desk on its own: every fixture the board reports,
  // live first and then upcoming and results, in the board's own order, with no
  // member posts and no cap. One card per fixture, and a prediction already attached to
  // one of those cards is not repeated beside it as a second card for the same
  // match. This is the board's own ordering, so nothing here re-ranks what ESPN
  // reported; the centre's distinct-competition rule is deliberately not applied,
  // because a tab that lists everything has no scarce rows to spend.
  const liveMatchPosts = orderCentreEvents(sportsBoard.events).map((event, index) => ({
    id: `sports-${event.id}`,
    type: 'sports',
    event,
    prediction: findPredictionForEvent(event),
    // eslint-disable-next-line react-hooks/purity
    createdAt: new Date(Date.now() - (index + 1) * 90_000),
  }));
  const attachedPredictions = new Set(liveMatchPosts.map((post) => post.prediction?.id).filter(Boolean));
  const livePredictionPosts = sportsPredictions
    .filter((prediction) => !attachedPredictions.has(prediction.id))
    .slice(0, 2)
    .map((prediction, index) => ({
      id: `prediction-${prediction.id}`,
      type: 'prediction',
      prediction,
      // eslint-disable-next-line react-hooks/purity
      createdAt: new Date(Date.now() - (index + 1) * 120_000),
    }));
  const livePosts = [...liveMatchPosts, ...livePredictionPosts, ...videoNewsFeedPosts];
  // Fixtures the feed already puts in front of the reader as cards, which both
  // match-centre surfaces deprioritise (never drop) so the rail is not a repeat
  // of the card beside it.
  const feedEventIds = sportsFeedPosts.map((post) => post.event.id);
  const followingPosts = visiblePosts.filter((p) => followingIds.has(p.userId) || p.userId === currentUser.id);

  // The sports desk authors anchor posts, but it is not a person to suggest,
  // list as a contact or invite anywhere.
  const otherUsers = allUsers.filter((u) => u.id !== currentUser.id && u.email !== SPORTS_DESK.email);
  const mobileGroups = (viewerGroups.length > 0 ? viewerGroups : allGroups).slice(0, 6);

  // Live trending hashtags — computed from whatever posts we ended up with
  // (real DB rows, or the demo feed offline). Empty → widget's own defaults.
  const trendingTopics = computeTrendingTopics(allPosts);

  // League logos for the sticky homepage sport/league filter bar.
  const LEAGUE_LOGOS: Record<string, string> = {
    'nfl': 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
    'nba': 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
    'premier league': 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
    'english premier league': 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
    'mlb': 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
    'atp tour': 'https://a.espncdn.com/i/teamlogos/leagues/500/atp.png',
    'atp': 'https://a.espncdn.com/i/teamlogos/leagues/500/atp.png',
    'nhl': 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
    'la liga': 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
    'spanish laliga': 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
    'serie a': 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png',
    'italian serie a': 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png',
    'bundesliga': 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png',
    'german bundesliga': 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png',
    'pga tour': 'https://a.espncdn.com/i/teamlogos/leagues/500/pga.png',
    'ufc': 'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png',
    'formula 1': 'https://a.espncdn.com/i/teamlogos/leagues/500/f1.png',
    'uefa champions league': 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png',
    'champions league': 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png',
    'ligue 1': 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png',
    'mls': 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png',
  };

  const leagueCounts = new Map<string, HomeLeagueItem>();
  const addLeagueCount = (rawName?: string | null) => {
    const name = rawName?.trim();
    if (!name) return;
    const key = name.toLowerCase();
    const existing = leagueCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      leagueCounts.set(key, {
        id: key,
        name,
        count: 1,
        logo: LEAGUE_LOGOS[key] ?? null,
      });
    }
  };
  for (const event of sportsBoard.events) addLeagueCount(event.leagueName || event.league);
  for (const pred of sportsPredictions) addLeagueCount(pred.competition || pred.federation);
  const homeLeagues = Array.from(leagueCounts.values()).sort((a, b) => b.count - a.count);
  const totalBoardCount = homeLeagues.reduce((sum, item) => sum + item.count, 0);

  return (
    <HomeLeagueFilterProvider>
      <HomeLeagueFilterBar leagues={homeLeagues} totalCount={totalBoardCount} />

      {/* Status/stories row: full-width above the desktop/tablet rails, like the header content width. */}
      <div className="nfl-type-scale mx-auto w-full max-w-7xl px-0 pt-2 sm:px-4 sm:pt-4">
        <Stories user={viewer} stories={enrichedStories} />
      </div>

      {/* Desktop columns. From `lg` the feed sits beside the discovery rail; from
          `xl` the navigation rail joins them. Both rails are fixed widths, so the
          feed column takes what is left rather than a quarter-based share, and both
          stay on screen while the feed scrolls. */}
      <div className="nfl-type-scale grid grid-cols-1 gap-2 px-0 py-2 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5 xl:grid-cols-[236px_minmax(0,1fr)_324px] xl:gap-6 max-w-7xl mx-auto theme-violet home-panel bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_30%)] sm:rounded-[2rem]">
      {/* The site's name, and who publishes it (name, address and logo). */}
      <JsonLd data={[getWebsiteStructuredData(), organizationStructuredData(getSiteUrl())]} />
      {/* Left rail — desktop navigation. Shown from `xl`: below that the feed
          needs the width, and the top bar already carries the main destinations. */}
      <aside className="hidden min-w-0 xl:block">
        <div className="sticky top-[4.5rem] max-h-[calc(100dvh-5.5rem)] space-y-4 overflow-y-auto scrollbar-hide pb-2">
          {viewer ? (
            <Link href={profileHref(viewer)} className="group flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-gray-200/70 dark:hover:bg-gray-800">
              {viewer.avatar ? (
                <img src={viewer.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-blue-500/30" />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-base font-bold text-white shadow-sm">
                  {viewer.name?.charAt(0) || 'U'}
                </div>
              )}
              <div className="min-w-0">
                <span className="block truncate text-sm font-bold text-gray-900 dark:text-white">{viewer.name}</span>
                <span className="block truncate text-xs text-gray-500">View profile</span>
              </div>
            </Link>
          ) : (
            // A visitor has no profile to open. What they can do from here is join.
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700/60 dark:bg-gray-800">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Join the conversation</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Follow your teams, react to matches and post with other fans.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/signup" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-bold text-white transition-colors hover:bg-blue-700">Sign up</Link>
                <Link href="/login" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 px-3 text-xs font-bold text-gray-800 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700/60">Log in</Link>
              </div>
            </div>
          )}

          <nav aria-label="Sports" className="space-y-0.5">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Sports</p>
            <RailLink href="/sports" label="Sports scores" well="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <Trophy className="h-[18px] w-[18px]" />
            </RailLink>
            <RailLink href="/sports/live" label="Live streams" well="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400">
              <Radio className="h-[18px] w-[18px]" />
            </RailLink>
            <RailLink href="/sports/highlights" label="Match highlights" well="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
              <Clapperboard className="h-[18px] w-[18px]" />
            </RailLink>
            <RailLink href="/sports/predictions" label="Predictions" well="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <Target className="h-[18px] w-[18px]" />
            </RailLink>
            <RailLink href="/nfl-basketball/basketball" label="NBA basketball" well="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">NBA</RailLink>
            <RailLink href="/nfl-basketball/nfl" label="NFL football" well="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">NFL</RailLink>
          </nav>

          {/* A paid placement: one banner, under the sports links so those stay
              at the top of the rail. The right rail shows the other banner. */}
          <SponsorBanners placement="home-left-rail" banners={sponsorBannerFor(0)} maxHeight="16rem" />

          <nav aria-label="Community" className="space-y-0.5 border-t border-gray-200 pt-3 dark:border-gray-800">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Community</p>
            <RailLink href="/discover" label="Discover People" well="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <Compass className="h-[18px] w-[18px]" />
            </RailLink>
            <RailLink href="/groups" label="Communities & Groups" well="bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
              <Users className="h-[18px] w-[18px]" />
            </RailLink>
          </nav>

          <nav aria-label="Your groups" className="space-y-0.5 border-t border-gray-200 pt-3 dark:border-gray-800">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{viewerGroups.length > 0 ? 'Your groups' : 'Groups'}</p>
            {viewerGroups.slice(0, 4).map((g, i) => {
              const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-pink-500', 'bg-amber-500'];
              return (
                <RailLink key={g.id} href={groupHref(g)} label={g.name} well={`${colors[i % colors.length]} text-sm text-white`}>
                  {g.name?.charAt(0) || 'G'}
                </RailLink>
              );
            })}
            <RailLink href="/groups" label={viewerGroups.length === 0 ? 'Find groups to join' : 'See all groups'} well="bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              <Users className="h-4 w-4" />
            </RailLink>
          </nav>

          {/* NFL players & top scorers, under the groups. Basketball is at the
              foot of the right rail, so both sports are on screen without the
              switch the board in the feed column needs. */}
          <SportsLeadersRail board={leaderBoards.football} />
        </div>
      </aside>

      {/* Main Feed — first on mobile */}
      <div className="min-w-0 max-w-2xl mx-auto w-full space-y-2 sm:space-y-4">
        <h1 className="sr-only">Hyper — The Sports Community Platform for Athletes, Fans, Clubs &amp; Organizers</h1>
        <section className="mx-3 sm:mx-0 lg:hidden overflow-hidden rounded-[1.75rem] border border-blue-100/80 dark:border-blue-900/60 bg-white/90 dark:bg-slate-900/90 shadow-sm backdrop-blur">
          <SportsMatchCentre board={sportsBoard} compact shownEventIds={feedEventIds} />

          {/* Paid placements, on phones and tablets: under the scores, where
              they are reached without scrolling past every board. */}
          <SponsorBanners placement="home-compact" className="border-t border-gray-100 px-3 py-3 dark:border-slate-800" />

          <div className="border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <SportsLeadersBoard boards={leaderBoards} engagement={anchorEngagement} signedIn={signedIn} />
          </div>

          <div className="border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <SportsHighlightsFeed board={highlightBoard} engagement={anchorEngagement} signedIn={signedIn} />
          </div>

          <div id="groups" className="border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-slate-400">Groups</h2>
              <Link href="/groups" className="text-[11px] font-bold text-blue-600 dark:text-blue-400">See all</Link>
            </div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory overscroll-x-contain">
              {mobileGroups.length > 0 ? mobileGroups.map((g, i) => {
                const colors = ['from-violet-500 to-fuchsia-500', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500'];
                return (
                  <Link key={g.id} href={groupHref(g)} className="w-[132px] shrink-0 snap-start rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-900/50">
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

          <div id="trending-now" className="scroll-mt-16 border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-slate-400">Trending now</h2>
              <Link href="/search" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                Explore <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory overscroll-x-contain">
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

          <div id="people-you-may-know" className="scroll-mt-16 border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-slate-400">
                {featuredPlayers.length > 0 ? 'Top Scorers & Leaders' : 'People you may know'}
              </h2>
              <Link href={featuredPlayers.length > 0 ? '/sports' : '/discover'} className="text-[11px] font-bold text-blue-600 dark:text-blue-400">See all</Link>
            </div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory overscroll-x-contain">
              {featuredPlayers.length > 0
                ? featuredPlayers.slice(0, 10).map((p) => (
                    <Link key={p.key} href={p.href} className="w-[92px] shrink-0 snap-start rounded-2xl bg-gray-50 p-2 text-center ring-1 ring-gray-100 dark:bg-slate-800/80 dark:ring-slate-700">
                      {p.avatar ? (
                        <img src={p.avatar} alt={p.name} className="mx-auto h-11 w-11 rounded-full object-cover ring-2 ring-white dark:ring-slate-900" />
                      ) : (
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white ring-2 ring-white dark:ring-slate-900">{p.name.charAt(0)}</div>
                      )}
                      <span className="mt-1 block truncate text-[11px] font-bold text-gray-900 dark:text-white">{p.name}</span>
                      <span className="block truncate text-[10px] font-semibold text-blue-600 dark:text-blue-400">{p.subtitle}</span>
                    </Link>
                  ))
                : otherUsers.slice(0, 6).map((u) => (
                    <Link key={u.id} href={profileHref(u)} className="w-[92px] shrink-0 snap-start rounded-2xl bg-gray-50 p-2 text-center ring-1 ring-gray-100 dark:bg-slate-800/80 dark:ring-slate-700">
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

          <div id="contacts" className="scroll-mt-16 border-t border-gray-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-slate-400">Contacts</h2>
              {/* A visitor who is not signed in has no inbox, and `/messages` is
                  disallowed in robots.txt — so the link a crawler would follow
                  points at signing in rather than at a route it was told to skip
                  and a reader would be turned away from anyway. */}
              <Link href={signedIn ? '/messages' : '/login'} className="text-[11px] font-bold text-blue-600 dark:text-blue-400">{signedIn ? 'Inbox' : 'Sign in'}</Link>
            </div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory overscroll-x-contain">
              {/* To a member each of these is a conversation; to a visitor it is
                  a person, and the person's page is the one worth crawling. */}
              {otherUsers.slice(0, 8).map((u) => (
                <Link key={u.id} href={signedIn ? `/messages/${u.id}` : profileHref(u)} className="relative shrink-0 rounded-2xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:ring-emerald-900/50">
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

        {/* Paid placements on desktop (phones/tablets have theirs in the compact panel above). */}
        <SponsorBanners placement="home" className="hidden lg:block" />

        <section aria-labelledby="explore-sports" className="mx-3 sm:mx-0 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-gray-700/60 dark:bg-gray-800">
          <h2 id="explore-sports" className="text-sm font-bold text-gray-900 dark:text-white">Explore sports scores and fixtures</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Follow <Link href="/sports?sport=football" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">football</Link>,{' '}
            <Link href="/nfl-basketball/basketball" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">NBA basketball</Link>,{' '}
            <Link href="/nfl-basketball/nfl" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">NFL American football</Link>,{' '}
            <Link href="/sports?sport=rugby" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">rugby</Link> and more. Scores and match details depend on available coverage.
          </p>
        </section>

        {dbFeedError && (
          <div className="mx-3 sm:mx-0 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-2xl px-4 py-3">
            <p className="font-bold mb-0.5">Showing demo content — live data unavailable</p>
            <p className="opacity-80">
              The app is configured for a database, but the feed query failed
              ({dbFeedError.slice(0, 120)}). This is usually a schema drift — run
              <code className="mx-1 px-1 rounded bg-amber-100 dark:bg-amber-900/40">npm run db:migrate</code>
              with DATABASE_URL set, then check <code className="px-1 rounded bg-amber-100 dark:bg-amber-900/40">/api/health</code>.
            </p>
          </div>
        )}
        {viewer ? (
          <CreatePost user={viewer} />
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
          highlightPosts={highlightFeedPosts}
          highlightsRemaining={feedHighlights.remaining}
          livePosts={livePosts}
          currentUser={currentUser}
          bookmarkedPostIds={bookmarkedPostIds}
          viewerFollowIds={Array.from(followingIds)}
        />
      </div>

      {/* Right rail — desktop discovery. It stays on screen while the feed
          scrolls; when it is taller than the window it scrolls on its own, with
          the scores first so they are what stays in view. */}
      <aside className="hidden min-w-0 lg:block">
        <div className="sticky top-[4.5rem] max-h-[calc(100dvh-5.5rem)] space-y-4 overflow-y-auto scrollbar-hide pb-2">
        <SportsMatchCentre board={sportsBoard} shownEventIds={feedEventIds} />

        {/* A paid placement: the other banner, under the scores. */}
        <SponsorBanners placement="home-right-rail" banners={sponsorBannerFor(1)} maxHeight="16rem" />

        {/* Trending Topics Widget — live hashtags computed from the posts above */}
        <TrendingTopics topics={trendingTopics} />

        {/* Top Scorers & Leaders (replaces Suggested People with same layout & size) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/60">
          <h3 className="text-gray-500 dark:text-gray-400 font-semibold text-xs uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-yellow-500" /> {featuredPlayers.length > 0 ? 'Top Scorers & Leaders' : 'People you may know'}
          </h3>
          <div className="space-y-3">
            {featuredPlayers.length > 0
              ? featuredPlayers.slice(0, 6).map((p) => (
                  <div key={p.key} className="flex items-center justify-between">
                    <Link href={p.href} className="flex items-center space-x-2.5 min-w-0">
                      {p.avatar ? (
                        <img src={p.avatar} alt={p.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-gray-900 dark:text-white truncate">{p.name}</div>
                        <div className="text-[11px] text-gray-400 truncate max-w-[120px]">{p.subtitle}</div>
                      </div>
                    </Link>
                    <Link href={p.href} className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded-lg shrink-0">
                      View
                    </Link>
                  </div>
                ))
              : otherUsers.slice(0, 4).map((u) => (
                  <div key={u.id} className="flex items-center justify-between">
                    <Link href={profileHref(u)} className="flex items-center space-x-2.5 min-w-0">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                          {u.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-gray-900 dark:text-white truncate">{u.name}</div>
                        {/* Bio only when this viewer can view the profile's details. */}
                        <div className="text-[11px] text-gray-400 truncate max-w-[120px]">
                          {canViewProfileDetails({
                            isSelf: false,
                            isFollower: followingIds.has(u.id),
                            visibility: u.profileVisibility,
                          })
                            ? u.bio?.slice(0, 30) || 'Hyper user'
                            : 'Hyper user'}
                        </div>
                      </div>
                    </Link>
                    <Link href={profileHref(u)} className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded-lg shrink-0">
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
              <Link key={u.id} href={signedIn ? `/messages/${u.id}` : profileHref(u)} className="flex items-center space-x-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-xl cursor-pointer transition-colors">
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

        {/* Basketball players & top scorers, under Contacts. */}
        <SportsLeadersRail board={leaderBoards.basketball} />
        {/* Between `lg` and `xl` there is no left rail, so the NFL list it
            carries is shown here instead of not at all. */}
        <SportsLeadersRail board={leaderBoards.football} className="xl:hidden" />
        </div>
      </aside>

      {/* A small floating card naming one match that can be watched now. It
          reads its own data after the page has loaded, so it costs this render
          nothing, and shows nothing when there is nothing to watch. */}
      <LiveStreamToast />
    </div>
    </HomeLeagueFilterProvider>
  );
}
