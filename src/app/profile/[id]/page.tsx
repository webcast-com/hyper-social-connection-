import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { prisma, hasDatabase } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import Post from '@/components/Post';
import ProfilePictureUpload from '@/components/ProfilePictureUpload';
import CoverPhotoUpload from '@/components/CoverPhotoUpload';
import EmptyState from '@/components/EmptyState';
import { Camera, GraduationCap, Heart, Link as LinkIcon, MapPin, Briefcase, Users as UsersIcon, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { canMessageUser, canViewProfileDetails, sharedProfileCardData } from '@/lib/profile';
import FollowButton from '@/components/FollowButton';
import ProfileSafetyMenu from '@/components/ProfileSafetyMenu';
import ShareProfileButton from '@/components/ShareProfileButton';
import { getProfileShareCount } from '@/app/share-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profileId = Number.parseInt(id, 10);
  let profile: { name: string; bio: string | null; avatar: string | null } | null = null;

  if (hasDatabase && Number.isInteger(profileId)) {
    try {
      profile = await prisma.user.findUnique({
        where: { id: profileId },
        select: { name: true, bio: true, avatar: true },
      });
    } catch (err) {
      console.warn('[profile metadata] DB query failed:', (err as Error)?.message);
    }
  }

  const title = profile?.name ? `${profile.name} on Hyper` : 'Profile on Hyper';
  const description = profile?.bio || 'View this Hyper profile and connect with the community.';

  return {
    title,
    description,
    alternates: { canonical: `/profile/${id}` },
    robots: profile ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'profile',
      title: `${title} | Hyper`,
      description,
      url: `/profile/${id}`,
      images: [profile?.avatar || '/og-image.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Hyper`,
      description,
      images: [profile?.avatar || '/og-image.png'],
    },
  };
}

const DEMO_USERS_MAP: Record<number, any> = {
  1: { id: 1, name: 'Alex Rivera', email: 'alex@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex', coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80', bio: '📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler.', createdAt: new Date(Date.now() - 31536000000) },
  2: { id: 2, name: 'Maya Patel', email: 'maya@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maya', coverPhoto: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=80', bio: '🎨 Digital artist and UI designer.', createdAt: new Date(Date.now() - 25920000000) },
  3: { id: 3, name: 'Jordan Kim', email: 'jordan@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', coverPhoto: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80', bio: '🏋️ Fitness coach and wellness advocate.', createdAt: new Date(Date.now() - 20000000000) },
  4: { id: 4, name: 'Sophie Chen', email: 'sophie@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie', coverPhoto: 'https://images.unsplash.com/photo-1490750967868-88df5691cc11?w=1200&q=80', bio: '👩‍💻 Full-stack engineer & open-source builder.', createdAt: new Date(Date.now() - 15000000000) },
  5: { id: 5, name: 'Marcus Lee', email: 'marcus@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus', coverPhoto: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80', bio: '🎸 Musician and content creator.', createdAt: new Date(Date.now() - 10000000000) },
};

export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const currentUser = viewer || {
    id: 0,
    name: 'Guest',
    avatar: null,
    bio: null,
    createdAt: new Date(),
    coverPhoto: null,
  };
  const { id } = await params;

  const profileId = parseInt(id) || 1;
  let profileUser: any = null;
  let allPosts: any[] = [];
  let allUsers: any[] = [];
  let allLikes: any[] = [];
  let allComments: any[] = [];
  let isFollowing = false;
  let followRequested = false;
  let isBlocked = false;
  let isMuted = false;
  let followersRes: any[] = [];
  let followingRes: any[] = [];
  let profileNotFound = false;

  if (hasDatabase) {
    try {
      const profileRow = await prisma.user.findUnique({ where: { id: profileId } });
      if (!profileRow) {
        if (DEMO_USERS_MAP[profileId]) {
          profileUser = DEMO_USERS_MAP[profileId];
        } else {
          profileNotFound = true;
        }
      } else {
        profileUser = profileRow;

        allPosts = await prisma.post.findMany({ where: { userId: profileId }, orderBy: { createdAt: 'desc' } });
        allUsers = await prisma.user.findMany();
        allLikes = await prisma.like.findMany();
        allComments = await prisma.comment.findMany({ orderBy: { createdAt: 'desc' } });

        if (currentUser.id) {
          const [isFollowingRow, requestRow, blockRow, muteRow] = await Promise.all([
            prisma.follow.findFirst({
              where: { followerId: currentUser.id, followingId: profileId },
            }),
            prisma.followRequest.findFirst({
              where: { followerId: currentUser.id, followingId: profileId, status: 'pending' },
            }),
            prisma.block.findFirst({
              where: { blockerId: currentUser.id, blockedId: profileId },
            }),
            prisma.mute.findFirst({
              where: { muterId: currentUser.id, mutedId: profileId },
            }),
          ]);
          isFollowing = !!isFollowingRow;
          followRequested = !!requestRow;
          isBlocked = !!blockRow;
          isMuted = !!muteRow;
        }

        const followerRows = await prisma.follow.findMany({
          where: { followingId: profileId },
          include: { follower: true },
        });
        followersRes = followerRows.map((f) => ({ user: f.follower }));
        const followingRows = await prisma.follow.findMany({
          where: { followerId: profileId },
          include: { following: true },
        });
        followingRes = followingRows.map((f) => ({ user: f.following }));
        if (allUsers.length === 0) allUsers = [currentUser, profileUser];
      }
    } catch (err) {
      console.warn('[profile] DB query failed, falling back to demo user:', (err as Error)?.message);
      profileUser = DEMO_USERS_MAP[profileId] || DEMO_USERS_MAP[1];
      allUsers = Object.values(DEMO_USERS_MAP);
    }
  } else {
    profileUser = DEMO_USERS_MAP[profileId] || DEMO_USERS_MAP[1];
    allUsers = Object.values(DEMO_USERS_MAP);
  }

  if (profileNotFound) {
    return <div className="p-8 text-center text-gray-500">User not found.</div>;
  }

  // Ensure safe profileUser for unauth + guest + offline (avoids .name / .id crashes)
  if (!profileUser || typeof profileUser.name === 'undefined') {
    profileUser = {
      id: profileId,
      name: currentUser?.name || 'Guest',
      avatar: currentUser?.avatar || null,
      bio: currentUser?.bio || null,
      createdAt: currentUser?.createdAt || new Date(),
      coverPhoto: currentUser?.coverPhoto || null,
    } as any;
  }

  // Who the viewer follows — used to gate the details (bio/location) shown
  // on shared-profile cards per profile visibility.
  const viewerFollowsShared = new Set<number>();
  if (hasDatabase && currentUser.id) {
    try {
      const followRows = await prisma.follow.findMany({
        where: { followerId: currentUser.id },
        select: { followingId: true },
      });
      for (const f of followRows) viewerFollowsShared.add(f.followingId);
    } catch {
      // Without follow data, treat profiles as not followed — details fall
      // back to public-only visibility, which is always safe.
    }
  }

  const enrichedPosts = allPosts.map(post => ({
    ...post,
    user: allUsers.find(u => u.id === post.userId),
    sharedProfile: post.sharedProfileId
      ? sharedProfileCardData(allUsers.find(u => u.id === post.sharedProfileId), {
          viewerId: currentUser.id || null,
          isFollower: viewerFollowsShared.has(post.sharedProfileId),
        })
      : null,
    likes: allLikes.filter(l => l.postId === post.id),
    comments: allComments
      .filter(c => c.postId === post.id)
      .map(c => ({ ...c, user: allUsers.find(u => u.id === c.userId) }))
      .reverse(),
  }));

  const photoPosts = enrichedPosts.filter(p => p.imageUrl);
  const isSelf = !!currentUser?.id && currentUser.id === profileUser.id;
  const followsYou = followingRes.some(({ user: u }) => u?.id === currentUser?.id);
  const showDetails = canViewProfileDetails({
    isSelf,
    isFollower: isFollowing,
    visibility: profileUser.profileVisibility,
  });
  // How many times this profile has been shared (feed, groups, DMs, external).
  const shareCount = hasDatabase ? await getProfileShareCount(profileUser.id) : 0;
  const shareProfile = {
    id: profileUser.id,
    name: profileUser.name,
    username: profileUser.username ?? null,
    avatar: profileUser.avatar ?? null,
  };
  const showMessage = !!currentUser?.id && canMessageUser({
    isSelf,
    isFollower: isFollowing,
    followsYou,
    privacy: profileUser.messagePrivacy,
  });

  return (
    <div className="bg-gray-100 dark:bg-gray-900 min-h-screen pb-12">
      {/* Cover + Avatar */}
      <div className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-5xl mx-auto">
          {/* Cover Photo — uploaded from the device (editable on your own profile) */}
          <CoverPhotoUpload
            user={profileUser}
            editable={!!currentUser?.id && currentUser.id === profileUser.id}
          />

          {/* Avatar + Name Row */}
          <div className="px-4 md:px-8 pb-4 flex flex-col md:flex-row md:items-end justify-between -mt-16 relative z-10">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <ProfilePictureUpload
                user={profileUser}
                editable={!!currentUser?.id && currentUser.id === profileUser.id}
              />
              <div className="mb-2">
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">{profileUser.name}</h1>
                {profileUser.username && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">@{profileUser.username}</p>
                )}
                <p className="text-gray-500 text-sm font-medium">
                  <span className="font-bold text-gray-700 dark:text-gray-200">{followersRes.length}</span> followers &nbsp;·&nbsp;
                  <span className="font-bold text-gray-700 dark:text-gray-200">{followingRes.length}</span> following
                </p>
                {showDetails && profileUser.bio && (
                  <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 max-w-md">{profileUser.bio}</p>
                )}
                {showDetails && profileUser.pronouns && (
                  <p className="text-xs text-gray-400 mt-1">{profileUser.pronouns}</p>
                )}
              </div>
            </div>

            {/* Action Buttons — 2×2 grid on phones so Follow/Message/Share/
                safety controls never overflow or clip; single row on ≥sm. */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mt-4 md:mt-0 md:mb-2 w-full sm:w-auto sm:items-center">
              {currentUser.id !== profileUser.id ? (
                <>
                  {!isBlocked && (
                    <FollowButton
                      targetId={profileId}
                      initialStatus={isFollowing ? 'following' : followRequested ? 'requested' : 'none'}
                    />
                  )}
                  {showMessage && !isBlocked && (
                    <Link
                      href={`/messages/${profileId}`}
                      className="flex-1 sm:flex-none justify-center px-5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold text-gray-800 flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" /> Message
                    </Link>
                  )}
                  {!isBlocked && showDetails && (
                    <ShareProfileButton
                      profile={shareProfile}
                      canShareInternally={!!currentUser.id}
                      shareCount={shareCount}
                    />
                  )}
                  {!!currentUser.id && (
                    <ProfileSafetyMenu
                      targetId={profileId}
                      initiallyBlocked={isBlocked}
                      initiallyMuted={isMuted}
                    />
                  )}
                </>
              ) : (
                <>
                  <ShareProfileButton profile={shareProfile} shareCount={shareCount} />
                  <Link href="/settings" className="flex-1 sm:flex-none justify-center px-5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold text-gray-800 flex items-center gap-2">
                    <Camera className="w-4 h-4 shrink-0" /> Edit Profile
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Content */}
      <div className="max-w-5xl mx-auto mt-4 px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: About + Photos + Friends */}
        <div className="space-y-4">
          {/* About Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
            <h3 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">About</h3>
            {showDetails ? (
              <>
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">{profileUser.bio || 'No bio yet.'}</p>
                <div className="mt-3 space-y-2 text-sm text-gray-500 dark:text-gray-400">
                  {profileUser.location && (
                    <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-400 shrink-0" /> {profileUser.location}</div>
                  )}
                  {profileUser.workplace && (
                    <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-blue-400 shrink-0" /> {profileUser.workplace}</div>
                  )}
                  {profileUser.education && (
                    <div className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-blue-400 shrink-0" /> {profileUser.education}</div>
                  )}
                  {profileUser.website && (
                    <a href={profileUser.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline">
                      <LinkIcon className="w-4 h-4 shrink-0" /> {profileUser.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  )}
                  <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-red-400 shrink-0" /> Joined {new Date(profileUser.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">This profile is private.</p>
            )}
          </div>

          {/* Photos */}
          {showDetails && photoPosts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Photos</h3>
                <span className="text-blue-600 dark:text-blue-400 text-sm font-semibold cursor-pointer">See all</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {photoPosts.slice(0, 9).map(p => (
                  <div key={p.id} className="aspect-square overflow-hidden rounded-lg">
                    <img src={p.imageUrl!} alt="post" className="w-full h-full object-cover hover:scale-110 transition-transform duration-200 cursor-pointer" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                <UsersIcon className="w-5 h-5 text-blue-500" /> Followers
              </h3>
              <span className="text-blue-600 dark:text-blue-400 text-sm font-semibold">{followersRes.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {followersRes.slice(0, 6).map(({ user: u }) => u && (
                <Link key={u.id} href={`/profile/${u.id}`} className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-14 h-14 rounded-xl object-cover" />
                  ) : (
                    <div className="w-14 h-14 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold">
                      {u.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-xs text-gray-600 dark:text-gray-400 text-center truncate w-full">{u.name.split(' ')[0]}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Posts */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white ml-1">Posts</h2>
          {enrichedPosts.length === 0 ? (
            <EmptyState variant="feed" title="No posts yet">
              When this user shares something, it will appear here.
            </EmptyState>
          ) : (
            enrichedPosts.map(post => (
              <Post
                key={post.id}
                post={post}
                currentUser={currentUser}
                viewerFollowIds={Array.from(viewerFollowsShared)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
