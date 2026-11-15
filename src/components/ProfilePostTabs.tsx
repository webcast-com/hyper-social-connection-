'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bookmark, LayoutList } from 'lucide-react';
import Post from '@/components/Post';
import EmptyState from '@/components/EmptyState';
import { SAVED_SECTION_EVENT, SAVED_SECTION_ID, takeSavedSectionRequest } from '@/lib/saved-section';

type Tab = 'posts' | 'saved';

/**
 * The posts column of a profile.
 *
 * On anyone else's profile this is what it always was: a "Posts" heading and
 * that member's posts. On your own profile it gains a second section, Saved —
 * the posts you bookmarked, which the home feed's Saved tab used to list before
 * it became Highlights. `savedPosts` is null unless the page loaded it, and the
 * page loads it only for the profile's owner, so the switch cannot appear on
 * somebody else's profile and there is no saved list in their page's payload.
 */
export default function ProfilePostTabs({
  posts,
  savedPosts = null,
  savedUnavailable = false,
  initialTab = 'posts',
  currentUser,
  viewerFollowIds = [],
  bookmarkedPostIds = [],
}: {
  posts: any[];
  /** The viewer's own saved posts, most recently saved first. Null on any profile but their own. */
  savedPosts?: any[] | null;
  /** The saved list could not be read; say so rather than claim there is nothing saved. */
  savedUnavailable?: boolean;
  /** `?tab=saved` opens the Saved section directly, so it can be linked to. */
  initialTab?: Tab;
  currentUser: any;
  viewerFollowIds?: number[];
  /** Posts this viewer has saved, so a bookmark icon shows its real state in either list. */
  bookmarkedPostIds?: number[];
}) {
  const ownProfile = savedPosts !== null;
  const [tab, setTab] = useState<Tab>(ownProfile && initialTab === 'saved' ? 'saved' : 'posts');

  // The address is the other way into a section: the header's profile menu links
  // to `?tab=saved`, and it can be pressed while this page is already open. So the
  // section follows `?tab=` whenever that changes, and pressing the switch writes
  // it back — otherwise an address still saying "saved" after a press of Posts
  // would make the menu's Saved link a link to where the router already is.
  // (`params` is null outside the app router, where only the switch applies.)
  const params = useSearchParams();
  const urlTab: Tab | null = params ? (params.get('tab') === 'saved' ? 'saved' : 'posts') : null;
  const [seenUrlTab, setSeenUrlTab] = useState(urlTab);
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    if (urlTab) setTab(urlTab);
  }
  const choose = (id: Tab) => {
    setTab(id);
    if (!params) return;
    const next = new URLSearchParams(params.toString());
    if (id === 'saved') next.set('tab', 'saved');
    else next.delete('tab');
    const query = next.toString();
    // Next keeps `useSearchParams` in step with the native history call, without a
    // round trip to the server: both lists are already on the page.
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  };

  // The profile menu's Saved link asks for more than the address can carry: the
  // section has to end up in view (on a phone it is three cards down the page),
  // including when it is already selected and the address will not change.
  const column = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ownProfile) return;
    const reveal = () => {
      // After the router has finished placing the page it just navigated to.
      requestAnimationFrame(() => column.current?.scrollIntoView({ block: 'start' }));
    };
    // Asked for from another page, and this is the profile arriving.
    if (takeSavedSectionRequest()) reveal();
    const onRequest = () => {
      takeSavedSectionRequest();
      setTab('saved');
      reveal();
    };
    window.addEventListener(SAVED_SECTION_EVENT, onRequest);
    return () => window.removeEventListener(SAVED_SECTION_EVENT, onRequest);
  }, [ownProfile]);

  const bookmarked = new Set(bookmarkedPostIds);
  const showingSaved = ownProfile && tab === 'saved';
  const list = showingSaved ? savedPosts : posts;

  const tabButton = (id: Tab, label: string, count: number, Icon: typeof Bookmark) => (
    <button
      type="button"
      onClick={() => choose(id)}
      aria-pressed={tab === id}
      className={`min-w-0 min-h-11 flex-1 rounded-lg px-3 py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-all ${
        tab === id
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <Icon aria-hidden="true" className="w-4 h-4 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
      <span className={`shrink-0 rounded-full px-1.5 text-[11px] font-black tabular-nums ${
        tab === id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      }`}>
        {count}
      </span>
    </button>
  );

  return (
    // The margin keeps the switch clear of the fixed header when the column is
    // scrolled to, by the profile menu or by a `#profile-posts` fragment.
    <div ref={column} id={SAVED_SECTION_ID} className="lg:col-span-2 min-w-0 space-y-4 scroll-mt-20">
      {ownProfile ? (
        <>
          <h2 className="sr-only">{showingSaved ? 'Saved' : 'Posts'}</h2>
          <div role="group" aria-label="Profile sections" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700/60 p-1.5 flex items-center gap-1">
            {tabButton('posts', 'Posts', posts.length, LayoutList)}
            {tabButton('saved', 'Saved', savedPosts.length, Bookmark)}
          </div>
        </>
      ) : (
        <h2 className="text-xl font-bold text-gray-800 dark:text-white ml-1">Posts</h2>
      )}

      {showingSaved && (
        <p className="ml-1 text-xs text-gray-500 dark:text-gray-400">
          Only you can see what you have saved. Most recently saved first.
        </p>
      )}

      {list.length === 0 ? (
        showingSaved ? (
          savedUnavailable ? (
            <EmptyState variant="bookmark" title="Saved posts could not be loaded">
              Your saved posts are still there. Reload the page to try again.
            </EmptyState>
          ) : (
            <EmptyState variant="bookmark" title="No saved posts yet">
              Click the bookmark icon on any post to save it for later reading.
            </EmptyState>
          )
        ) : (
          <EmptyState variant="feed" title="No posts yet">
            When this user shares something, it will appear here.
          </EmptyState>
        )
      ) : (
        list.map((post) => (
          <Post
            key={`${tab}-${post.id}`}
            post={post}
            currentUser={currentUser}
            isBookmarked={bookmarked.has(post.id)}
            viewerFollowIds={viewerFollowIds}
          />
        ))
      )}
    </div>
  );
}
