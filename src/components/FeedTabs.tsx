'use client';

import { useState } from 'react';
import Post from '@/components/Post';
import SportsFeedCard from '@/components/SportsFeedCard';
import SportsPredictionFeedCard from '@/components/SportsPredictionFeedCard';
import SportsVideoNewsCard from '@/components/SportsVideoNewsCard';
import { Sparkles, Users, Bookmark, Compass, Radio } from 'lucide-react';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
import { summariseLiveCards } from '@/lib/match-centre';

type Tab = 'for-you' | 'following' | 'live' | 'saved';

/**
 * The tabs of the main feed.
 *
 * `livePosts` is the sports desk on its own: one card per fixture, live first,
 * then upcoming and results, then league video news. It is built by the page from
 * the same board the match centre renders, so this tab cannot show a fixture the
 * centre has not been given, and it defaults to empty — a caller that has no
 * board renders three tabs' worth of content exactly as it did before.
 */
export default function FeedTabs({
  forYouPosts,
  followingPosts,
  savedPosts,
  livePosts = [],
  currentUser,
  bookmarkedPostIds,
  viewerFollowIds = [],
}: {
  forYouPosts: any[];
  followingPosts: any[];
  savedPosts: any[];
  /** Sports cards for the Live tab: fixtures, predictions and league video. */
  livePosts?: any[];
  currentUser: any;
  bookmarkedPostIds: number[];
  /** People the viewer follows — used to gate profile details in post UI. */
  viewerFollowIds?: number[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>('for-you');

  const bookmarkedSet = new Set(bookmarkedPostIds);

  const postsToRender =
    activeTab === 'for-you' ? forYouPosts :
    activeTab === 'following' ? followingPosts :
    activeTab === 'live' ? livePosts : savedPosts;

  // What the Live tab can say about itself, counted from the cards it was given
  // by the one rule that decides it (`summariseLiveCards`), so a sample fixture
  // is never advertised as a live sport.
  const { live: liveNow, fixtures } = summariseLiveCards(livePosts);
  const hasVideo = livePosts.some((post) => post.type === 'video-news');

  return (
    <div className="space-y-4">
      {/* Sticky Tab Selector. Four tabs do not fit a 320px column with icons and
          labels, so the icons — which are decorative, the label carries the
          meaning — appear from `sm` up and the labels truncate rather than push
          the strip wider than the viewport. */}
      <div role="group" aria-label="Feed sections" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700/60 p-1.5 flex items-center justify-around sticky top-16 z-20 backdrop-blur-md bg-white/90 dark:bg-gray-800/90">
        <button
          type="button"
          onClick={() => setActiveTab('for-you')}
          aria-pressed={activeTab === 'for-you'}
          className={`min-w-0 min-h-11 flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 transition-all ${
            activeTab === 'for-you'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Sparkles className="hidden sm:block w-4 h-4 shrink-0" />
          <span className="min-w-0 truncate">For You</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('following')}
          aria-pressed={activeTab === 'following'}
          className={`min-w-0 min-h-11 flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 transition-all ${
            activeTab === 'following'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Users className="hidden sm:block w-4 h-4 shrink-0" />
          <span className="min-w-0 truncate">Following</span>
        </button>

        {/* The Live tab carries a count only when ESPN reports fixtures in play,
            so the strip never advertises a live sport that is not. */}
        <button
          type="button"
          onClick={() => setActiveTab('live')}
          aria-pressed={activeTab === 'live'}
          className={`min-w-0 min-h-11 flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 transition-all ${
            activeTab === 'live'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Radio className={`hidden sm:block w-4 h-4 shrink-0 ${liveNow > 0 ? 'text-red-500' : ''}`} />
          <span className="min-w-0 truncate">Live</span>
          {liveNow > 0 && <span className="shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-black tabular-nums text-white">{liveNow}</span>}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('saved')}
          aria-pressed={activeTab === 'saved'}
          className={`min-w-0 min-h-11 flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 transition-all ${
            activeTab === 'saved'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Bookmark className="hidden sm:block w-4 h-4 shrink-0" />
          <span className="min-w-0 truncate">Saved</span>
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
          ) : activeTab === 'live' ? (
            <EmptyState
              variant="search"
              title="No fixtures on the desk right now"
              action={
                <Link
                  href="/sports"
                  className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Radio className="w-4 h-4" />
                  <span>All competitions</span>
                </Link>
              }
            >
              Live matches, upcoming fixtures, results and league video appear here
              when ESPN reports them. Nothing is invented to fill the gap.
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
          <>
            {/* The Live tab says what it is showing, from the cards it was given:
                fixtures ESPN reports as in play first, then the rest. */}
            {activeTab === 'live' && (
              <p role="status" className="min-w-0 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
                {liveNow > 0
                  ? `${liveNow} ${liveNow === 1 ? 'fixture is' : 'fixtures are'} live now, then upcoming and results — ${fixtures} listed.`
                  : fixtures > 0
                    ? `Nothing is live right now. ${fixtures} ${fixtures === 1 ? 'fixture' : 'fixtures'} listed, upcoming first and results last.`
                    : hasVideo
                      ? 'No fixtures are listed right now. League video ESPN has published is below.'
                      : 'No fixtures or league video are listed right now.'}
              </p>
            )}
            {postsToRender.map((post) => (
              post.type === 'sports' ? (
                <SportsFeedCard key={post.id} event={post.event} prediction={post.prediction} currentUser={currentUser} />
              ) : post.type === 'prediction' ? (
                <SportsPredictionFeedCard key={post.id} prediction={post.prediction} currentUser={currentUser} />
              ) : post.type === 'video-news' ? (
                <SportsVideoNewsCard key={post.id} clip={post.clip} currentUser={currentUser} />
              ) : (
                <Post
                  key={post.id}
                  post={post}
                  currentUser={currentUser}
                  isBookmarked={bookmarkedSet.has(post.id)}
                  viewerFollowIds={viewerFollowIds}
                />
              )
            ))}
          </>
        )}
      </div>
    </div>
  );
}
