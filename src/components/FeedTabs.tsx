'use client';

import { useState } from 'react';
import Post from '@/components/Post';
import { Sparkles, Users, Bookmark, Compass } from 'lucide-react';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';

type Tab = 'for-you' | 'following' | 'saved';

export default function FeedTabs({
  forYouPosts,
  followingPosts,
  savedPosts,
  currentUser,
  bookmarkedPostIds,
}: {
  forYouPosts: any[];
  followingPosts: any[];
  savedPosts: any[];
  currentUser: any;
  bookmarkedPostIds: number[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>('for-you');

  const bookmarkedSet = new Set(bookmarkedPostIds);

  const postsToRender =
    activeTab === 'for-you' ? forYouPosts :
    activeTab === 'following' ? followingPosts : savedPosts;

  return (
    <div className="space-y-4">
      {/* Sticky Tab Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700/60 p-1.5 flex items-center justify-around sticky top-16 z-20 backdrop-blur-md bg-white/90 dark:bg-gray-800/90">
        <button
          type="button"
          onClick={() => setActiveTab('for-you')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
            activeTab === 'for-you'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>For You</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('following')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
            activeTab === 'following'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Following</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('saved')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
            activeTab === 'saved'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Saved</span>
        </button>
      </div>

      {/* Feed Content */}
      <div className="space-y-4">
        {postsToRender.length === 0 ? (
          activeTab === 'following' ? (
            <EmptyState
              variant="people"
              title="No posts from people you follow"
              action={
                <Link
                  href="/discover"
                  className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Compass className="w-4 h-4" />
                  <span>Discover People</span>
                </Link>
              }
            >
              Follow creators, friends, and accounts from the Discover tab to build your custom feed.
            </EmptyState>
          ) : activeTab === 'saved' ? (
            <EmptyState variant="bookmark" title="No saved posts yet">
              Click the bookmark icon on any post to save it for later reading.
            </EmptyState>
          ) : (
            <EmptyState variant="feed" title="No posts yet!">
              Create the first post above to kick off the conversation.
            </EmptyState>
          )
        ) : (
          postsToRender.map((post) => (
            <Post
              key={post.id}
              post={post}
              currentUser={currentUser}
              isBookmarked={bookmarkedSet.has(post.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
