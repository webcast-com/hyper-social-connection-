import { getViewer } from '@/lib/viewer';
import { db } from '@/db';
import { posts, users, likes, comments } from '@/db/schema';
import { stories as storiesTable } from '@/db/schema';
import { eq, desc, gte } from 'drizzle-orm';
import CreatePost from '@/components/CreatePost';
import Post from '@/components/Post';
import Stories from '@/components/Stories';
import Link from 'next/link';
import { Compass, Users } from 'lucide-react';

export default async function Home() {
  const currentUser = await getViewer();

  const allPosts = await db.select().from(posts).orderBy(desc(posts.createdAt));
  const allUsers = await db.select().from(users);
  const allLikes = await db.select().from(likes);
  const allComments = await db.select().from(comments).orderBy(desc(comments.createdAt));
  const activeStories = await db.select().from(storiesTable)
    .where(gte(storiesTable.expiresAt, new Date()))
    .orderBy(desc(storiesTable.createdAt));

  const enrichedStories = activeStories.map(s => ({
    ...s,
    user: allUsers.find(u => u.id === s.userId),
  }));

  const enrichedPosts = allPosts
    .map(post => {
      const author = allUsers.find(u => u.id === post.userId);
      if (!author) return null;

      return {
        ...post,
        user: author,
        likes: allLikes.filter(l => l.postId === post.id),
        comments: allComments
          .filter(c => c.postId === post.id)
          .map(c => {
            const author = allUsers.find(u => u.id === c.userId);
            return author ? { ...c, user: author } : null;
          })
          .filter((comment): comment is NonNullable<typeof comment> => comment !== null)
          .reverse(),
      };
    })
    .filter((post): post is NonNullable<typeof post> => post !== null);

  const otherUsers = allUsers.filter(u => u.id !== currentUser.id);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">
      {/* Left Sidebar */}
      <div className="hidden md:flex flex-col space-y-1 pt-2">
        <Link href={`/profile/${currentUser.id}`} className="flex items-center space-x-3 p-2 hover:bg-gray-200 rounded-xl cursor-pointer transition-colors">
          {currentUser.avatar ? (
            <img src={currentUser.avatar} alt="avatar" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
              {currentUser.name.charAt(0)}
            </div>
          )}
          <span className="font-semibold text-sm">{currentUser.name}</span>
        </Link>
        <Link href="/discover" className="flex items-center space-x-3 p-2 hover:bg-gray-200 rounded-xl cursor-pointer transition-colors">
          <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
            <Compass className="w-5 h-5 text-blue-600" />
          </div>
          <span className="font-semibold text-sm">Discover People</span>
        </Link>
        <Link href="/groups" className="flex items-center space-x-3 p-2 hover:bg-gray-200 rounded-xl cursor-pointer transition-colors">
          <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <span className="font-semibold text-sm">Groups</span>
        </Link>

        <div className="pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-400 font-semibold px-2 uppercase tracking-wide mb-1">Shortcuts</p>
          {['Travel & Adventure ✈️', 'Fitness & Health 💪', 'Dev & Tech Talk 💻'].map(g => (
            <Link key={g} href="/groups" className="flex items-center space-x-3 p-2 hover:bg-gray-200 rounded-xl cursor-pointer transition-colors">
              <div className="w-9 h-9 bg-gray-200 rounded-xl flex items-center justify-center text-sm">
                {g.slice(-2)}
              </div>
              <span className="font-semibold text-sm truncate">{g.slice(0, -3)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Feed */}
      <div className="md:col-span-2 max-w-2xl mx-auto w-full space-y-0">
        <Stories user={currentUser} stories={enrichedStories} />
        <CreatePost user={currentUser} />
        {enrichedPosts.length === 0 && (
          <div className="bg-white rounded-xl shadow p-10 text-center text-gray-400">
            <div className="text-5xl mb-3">👋</div>
            <div className="font-semibold text-lg">No posts yet!</div>
            <p className="text-sm mt-1">Follow people or create your first post above.</p>
          </div>
        )}
        {enrichedPosts.map(post => (
          <Post key={post.id} post={post} currentUser={currentUser} />
        ))}
      </div>

      {/* Right Sidebar */}
      <div className="hidden md:flex flex-col space-y-4 pt-2">
        <div>
          <h3 className="text-gray-500 font-semibold text-sm uppercase tracking-wide mb-2 px-1">People you may know</h3>
          <div className="space-y-2">
            {otherUsers.slice(0, 5).map(u => (
              <div key={u.id} className="flex items-center justify-between p-2 hover:bg-gray-200 rounded-xl transition-colors">
                <Link href={`/profile/${u.id}`} className="flex items-center space-x-2">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {u.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-sm">{u.name}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[100px]">{u.bio?.slice(0, 25) || 'Hyper user'}</div>
                  </div>
                </Link>
                <Link href={`/profile/${u.id}`} className="text-xs text-blue-600 font-semibold hover:bg-blue-50 px-2 py-1 rounded-lg">
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-gray-500 font-semibold text-sm uppercase tracking-wide mb-2 px-1">Contacts</h3>
          <div className="space-y-1">
            {otherUsers.slice(0, 8).map(u => (
              <Link key={u.id} href={`/messages/${u.id}`} className="flex items-center space-x-3 p-2 hover:bg-gray-200 rounded-xl cursor-pointer transition-colors">
                <div className="relative">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {u.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white"></div>
                </div>
                <span className="font-semibold text-sm">{u.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
