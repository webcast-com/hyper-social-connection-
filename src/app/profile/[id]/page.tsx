import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/db';
import { users, posts, follows, likes, comments } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Post from '@/components/Post';
import ProfilePictureUpload from '@/components/ProfilePictureUpload';
import CoverPhotoUpload from '@/components/CoverPhotoUpload';
import { Camera, Heart, Users as UsersIcon, MessageCircle } from 'lucide-react';
import Link from 'next/link';

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
      const result = await db
        .select({
          name: users.name,
          bio: users.bio,
          avatar: users.avatar,
        })
        .from(users)
        .where(eq(users.id, profileId));
      profile = result[0] || null;
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
      ...(profile?.avatar ? { images: [profile.avatar] } : {}),
    },
    twitter: {
      card: profile?.avatar ? 'summary_large_image' : 'summary',
      title: `${title} | Hyper`,
      description,
      ...(profile?.avatar ? { images: [profile.avatar] } : {}),
    },
  };
}

export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getViewer();
  const { id } = await params;

  const profileId = parseInt(id);
  let profileUser: any = null;
  let allPosts: any[] = [];
  let allUsers: any[] = [];
  let allLikes: any[] = [];
  let allComments: any[] = [];
  let isFollowing = false;
  let followersRes: any[] = [];
  let followingRes: any[] = [];
  let profileNotFound = false;

  if (hasDatabase) {
    try {
      const profileUserRes = await db.select().from(users).where(eq(users.id, profileId));
      if (profileUserRes.length === 0) {
        profileNotFound = true;
      } else {
        profileUser = profileUserRes[0];

        allPosts = await db.select().from(posts).where(eq(posts.userId, profileId)).orderBy(desc(posts.createdAt));
        allUsers = await db.select().from(users);
        allLikes = await db.select().from(likes);
        allComments = await db.select().from(comments).orderBy(desc(comments.createdAt));

        const isFollowingRes = await db.select().from(follows).where(and(eq(follows.followerId, currentUser.id), eq(follows.followingId, profileId)));
        isFollowing = isFollowingRes.length > 0;

        followersRes = await db.select({ user: users }).from(follows)
          .leftJoin(users, eq(follows.followerId, users.id))
          .where(eq(follows.followingId, profileId));
        followingRes = await db.select({ user: users }).from(follows)
          .leftJoin(users, eq(follows.followingId, users.id))
          .where(eq(follows.followerId, profileId));
        if (allUsers.length === 0) allUsers = [currentUser, profileUser];
      }
    } catch (err) {
      console.warn('[profile] DB query failed:', (err as Error)?.message);
      profileUser = currentUser;
      allUsers = [currentUser];
    }
  } else {
    profileUser = currentUser;
    allUsers = [currentUser];
  }

  if (profileNotFound) {
    return <div className="p-8 text-center text-gray-500">User not found.</div>;
  }

  const enrichedPosts = allPosts.map(post => ({
    ...post,
    user: allUsers.find(u => u.id === post.userId),
    likes: allLikes.filter(l => l.postId === post.id),
    comments: allComments
      .filter(c => c.postId === post.id)
      .map(c => ({ ...c, user: allUsers.find(u => u.id === c.userId) }))
      .reverse(),
  }));

  const photoPosts = enrichedPosts.filter(p => p.imageUrl);

  return (
    <div className="bg-gray-100 min-h-screen pb-12">
      {/* Cover + Avatar */}
      <div className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto">
          {/* Cover Photo — uploaded from the device (editable on your own profile) */}
          <CoverPhotoUpload
            user={profileUser}
            editable={currentUser.id === profileUser.id}
          />

          {/* Avatar + Name Row */}
          <div className="px-4 md:px-8 pb-4 flex flex-col md:flex-row md:items-end justify-between -mt-16 relative z-10">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <ProfilePictureUpload
                user={profileUser}
                editable={currentUser.id === profileUser.id}
              />
              <div className="mb-2">
                <h1 className="text-3xl font-extrabold text-gray-900">{profileUser.name}</h1>
                <p className="text-gray-500 text-sm font-medium">
                  <span className="font-bold text-gray-700">{followersRes.length}</span> followers &nbsp;·&nbsp;
                  <span className="font-bold text-gray-700">{followingRes.length}</span> following
                </p>
                {profileUser.bio && (
                  <p className="text-gray-600 text-sm mt-1 max-w-md">{profileUser.bio}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4 md:mt-0 md:mb-2 w-full sm:w-auto">
              {currentUser.id !== profileUser.id ? (
                <>
                  <form action={async () => {
                    'use server';
                    const { toggleFollow } = await import('@/app/actions');
                    await toggleFollow(profileId);
                  }} className="flex-1 sm:flex-none">
                    <button type="submit" className={`w-full sm:w-auto px-5 py-2 rounded-lg font-semibold transition-colors shadow-sm ${isFollowing ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                      {isFollowing ? '✓ Following' : '+ Follow'}
                    </button>
                  </form>
                  <Link
                    href={`/messages/${profileId}`}
                    className="flex-1 sm:flex-none justify-center px-5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold text-gray-800 flex items-center gap-2 shadow-sm transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" /> Message
                  </Link>
                </>
              ) : (
                <Link href="/settings" className="flex-1 sm:flex-none justify-center px-5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold text-gray-800 flex items-center gap-2">
                  <Camera className="w-4 h-4 shrink-0" /> Edit Profile
                </Link>
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
          <div className="bg-white rounded-2xl shadow p-5">
            <h3 className="font-bold text-lg mb-3">About</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{profileUser.bio || 'No bio yet.'}</p>
            <div className="mt-3 space-y-2 text-sm text-gray-500">
              <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-red-400" /> Joined {new Date(profileUser.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
            </div>
          </div>

          {/* Photos */}
          {photoPosts.length > 0 && (
            <div className="bg-white rounded-2xl shadow p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg">Photos</h3>
                <span className="text-blue-600 text-sm font-semibold cursor-pointer">See all</span>
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
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-blue-500" /> Followers
              </h3>
              <span className="text-blue-600 text-sm font-semibold">{followersRes.length}</span>
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
                  <span className="text-xs text-gray-600 text-center truncate w-full">{u.name.split(' ')[0]}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Posts */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold text-gray-800 ml-1">Posts</h2>
          {enrichedPosts.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-400">
              <div className="text-5xl mb-3">📝</div>
              <div className="font-semibold">No posts yet</div>
            </div>
          ) : (
            enrichedPosts.map(post => (
              <Post key={post.id} post={post} currentUser={currentUser} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
