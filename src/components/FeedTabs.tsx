'use client';

import { useState } from 'react';
import Post from '@/components/Post';
import SportsFeedCard from '@/components/SportsFeedCard';
import SportsPredictionFeedCard from '@/components/SportsPredictionFeedCard';
import SportsVideoNewsCard from '@/components/SportsVideoNewsCard';
import SportsLeadersBoard from '@/components/SportsLeadersBoard';
import { HighlightPostCard } from '@/components/SportsHighlightsFeed';
import { Sparkles, Users, Clapperboard, Compass, Radio } from 'lucide-react';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
import { summariseLiveCards } from '@/lib/match-centre';
import { FEED_RENDER_BATCH } from '@/lib/feed-interleave';
import InfiniteSentinel from '@/components/InfiniteSentinel';
import { useHomeLeagueFilter } from '@/components/HomeLeagueFilter';

function normalizeLeagueKey(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function postMatchesLeague(post: any, selectedLeague: string): boolean {
  const target = normalizeLeagueKey(selectedLeague);
  if (!target) return true;
  if (post.type === 'sports') {
    return (
      normalizeLeagueKey(post.event?.leagueName) === target ||
      normalizeLeagueKey(post.event?.league) === target ||
      normalizeLeagueKey(post.event?.sport) === target
    );
  }
  if (post.type === 'prediction') {
    return (
      normalizeLeagueKey(post.prediction?.competition) === target ||
      normalizeLeagueKey(post.prediction?.federation) === target
    );
  }
  if (post.type === 'highlight' || post.type === 'video-news') {
    return (
      normalizeLeagueKey(post.clip?.leagueName) === target ||
      normalizeLeagueKey(post.clip?.league) === target ||
      normalizeLeagueKey(post.clip?.sport) === target
    );
  }
  if (post.type === 'leaders' && Array.isArray(post.boards)) {
    return post.boards.some(
      (b: any) =>
        normalizeLeagueKey(b?.leagueName) === target ||
        normalizeLeagueKey(b?.sport) === target,
    );
  }
  return false;
}

type Tab = 'for-you' | 'following' | 'live' | 'highlights';

/**
 * The tabs of the main feed.
 *
 * For You is everything: the member posts, every fixture the board reports, the
 * recent highlight clips, and the league video and prediction cards, each kind
 * placed by its own pass in `feed-interleave.ts` and revealed in batches as the
 * reader scrolls, with no button to press. Nothing
 * here decides how many of any kind there are.
 *
 * `highlightPosts` is the Highlights tab, which took the place of Saved (saved
 * posts are now a section of the member's own profile, `ProfilePostTabs`): every
 * match clip the Match Highlights page's stored index supplied, newest first, as
 * the same post cards For You renders. `highlightsRemaining` is how many stored
 * clips that read did not carry, so the tab can point at the page that pages
 * through the rest instead of ending silently. Both default to empty.
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
  highlightPosts = [],
  highlightsRemaining = 0,
  livePosts = [],
  currentUser,
  bookmarkedPostIds,
  viewerFollowIds = [],
}: {
  forYouPosts: any[];
  followingPosts: any[];
  /** Highlight cards for the Highlights tab: every clip the page read, newest first. */
  highlightPosts?: any[];
  /** Stored clips the page's read did not carry; they are on /sports/highlights. */
  highlightsRemaining?: number;
  /** Sports cards for the Live tab: fixtures, predictions and league video. */
  livePosts?: any[];
  currentUser: any;
  bookmarkedPostIds: number[];
  /** People the viewer follows — used to gate profile details in post UI. */
  viewerFollowIds?: number[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>('for-you');
  // How many of this tab's cards are in the DOM. Every card the page built is in
  // `postsToRender`; this only decides how many are materialised at once, because
  // a match card is a client component with its own state and a busy day can
  // report a thousand fixtures. The next batch is added as the reader scrolls
  // near the end of this one. Switching tab starts from the first batch again,
  // so one tab's scrolling does not silently decide another's.
  const [revealed, setRevealed] = useState(FEED_RENDER_BATCH);
  const select = (tab: Tab) => { setActiveTab(tab); setRevealed(FEED_RENDER_BATCH); };

  const bookmarkedSet = new Set(bookmarkedPostIds);
  const { selectedLeague } = useHomeLeagueFilter();

  const rawPostsToRender =
    activeTab === 'for-you' ? forYouPosts :
    activeTab === 'following' ? followingPosts :
    activeTab === 'live' ? livePosts : highlightPosts;
  const postsToRender = selectedLeague
    ? rawPostsToRender.filter((post) => postMatchesLeague(post, selectedLeague))
    : rawPostsToRender;
  const shown = postsToRender.slice(0, revealed);
  const remaining = postsToRender.length - shown.length;

  // What the Live tab can say about itself, counted from the cards it was given
  // by the one rule that decides it (`summariseLiveCards`), so a sample fixture
  // is never advertised as a live sport.
  const { live: liveNow, fixtures } = summariseLiveCards(livePosts);
  const hasVideo = livePosts.some((post) => post.type === 'video-news');

  return (
    <div className="space-y-2 sm:space-y-4">
      {/* Sticky Tab Selector. Four tabs do not fit a 320px column with icons and
          labels, so the icons — which are decorative, the label carries the
          meaning — appear from `sm` up and the labels truncate rather than push
          the strip wider than the viewport. Below `sm` each tab is as wide as
          its own label needs (`flex-auto`), because four equal quarters of a
          320px column are too narrow for "Highlights"; from `sm` up they are
          equal again. */}
      <div role="group" aria-label="Feed sections" className="mx-3 sm:mx-0 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700/60 p-1.5 flex items-center justify-around sticky top-[calc(var(--home-league-bar-h,7.25rem)+0.5rem)] z-30 backdrop-blur-md bg-white/90 dark:bg-gray-800/90">
        <button
          type="button"
          onClick={() => select('for-you')}
          aria-pressed={activeTab === 'for-you'}
          className={`min-w-0 min-h-11 flex-auto sm:flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 transition-all ${
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
          onClick={() => select('following')}
          aria-pressed={activeTab === 'following'}
          className={`min-w-0 min-h-11 flex-auto sm:flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 transition-all ${
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
          onClick={() => select('live')}
          aria-pressed={activeTab === 'live'}
          className={`min-w-0 min-h-11 flex-auto sm:flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 transition-all ${
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
          onClick={() => select('highlights')}
          aria-pressed={activeTab === 'highlights'}
          className={`min-w-0 min-h-11 flex-auto sm:flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 transition-all ${
            activeTab === 'highlights'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Clapperboard className="hidden sm:block w-4 h-4 shrink-0" />
          <span className="min-w-0 truncate">Highlights</span>
        </button>
      </div>

      {/* Feed Content */}
      <div className="space-y-2 sm:space-y-4">
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
          ) : activeTab === 'highlights' ? (
            <EmptyState
              variant="search"
              title="No match highlights right now"
              action={
                <Link
                  href="/sports/highlights"
                  className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Clapperboard className="w-4 h-4" />
                  <span>Match Highlights</span>
                </Link>
              }
            >
              Every clip ESPN publishes for a match appears here as soon as this
              site has read it. Nothing is invented to fill the gap.
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
              <p role="status" className="mx-3 sm:mx-0 min-w-0 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
                {liveNow > 0
                  ? `${liveNow} ${liveNow === 1 ? 'fixture is' : 'fixtures are'} live now, then upcoming and results — ${fixtures} listed.`
                  : fixtures > 0
                    ? `Nothing is live right now. ${fixtures} ${fixtures === 1 ? 'fixture' : 'fixtures'} listed, upcoming first and results last.`
                    : hasVideo
                      ? 'No fixtures are listed right now. League video ESPN has published is below.'
                      : 'No fixtures or league video are listed right now.'}
              </p>
            )}
            {/* The Highlights tab says where its clips come from and where the
                filters are. Not a live region: nothing here changes on its own. */}
            {activeTab === 'highlights' && (
              <p className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
                <span className="min-w-0">
                  {highlightPosts.length} match {highlightPosts.length === 1 ? 'highlight' : 'highlights'}, newest first.
                </span>
                <Link href="/sports/highlights" className="inline-flex min-h-11 shrink-0 items-center font-bold text-blue-600 hover:underline dark:text-blue-400">
                  Filter on Match Highlights →
                </Link>
              </p>
            )}
            {shown.map((post) => (
              post.type === 'sports' ? (
                <SportsFeedCard key={post.id} event={post.event} prediction={post.prediction} currentUser={currentUser} />
              ) : post.type === 'prediction' ? (
                <SportsPredictionFeedCard key={post.id} prediction={post.prediction} currentUser={currentUser} />
              ) : post.type === 'video-news' ? (
                <SportsVideoNewsCard key={post.id} clip={post.clip} currentUser={currentUser} />
              ) : post.type === 'highlight' ? (
                // The same card the highlights list renders, with the anchor and
                // saved state the page loaded for it. `anchor` is null for a clip
                // with nothing to engage with, and the card stays read-only.
                <HighlightPostCard
                  key={post.id}
                  clip={post.clip}
                  anchor={post.anchor ?? null}
                  engagement={post.engagement ?? null}
                  signedIn={!!currentUser?.id}
                />
              ) : post.type === 'leaders' ? (
                <div key={post.id} className={post.desktopOnly ? 'hidden lg:block' : undefined}>
                  <SportsLeadersBoard
                    boards={post.boards}
                    engagement={post.engagement ?? {}}
                    signedIn={!!currentUser?.id}
                  />
                </div>
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
            {/* Endless scrolling: the next batch is revealed as the reader nears
                the end of this one. Every card is already here; this only decides
                how many are in the DOM. */}
            {remaining > 0 && (
              <InfiniteSentinel
                watch={`${activeTab}:${revealed}`}
                onReach={() => setRevealed((count) => count + FEED_RENDER_BATCH)}
                fallbackLabel={`Show ${Math.min(FEED_RENDER_BATCH, remaining)} more`}
              />
            )}
            {/* The read that fills this tab has a ceiling. When it was the ceiling
                that stopped it, the tab says so and links to the page that pages
                through every stored clip, rather than ending as though that were all. */}
            {activeTab === 'highlights' && remaining <= 0 && highlightsRemaining > 0 && (
              <Link
                href="/sports/highlights"
                className="flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-bold text-blue-600 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-gray-700"
              >
                {highlightsRemaining} older {highlightsRemaining === 1 ? 'clip' : 'clips'} on Match Highlights →
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
