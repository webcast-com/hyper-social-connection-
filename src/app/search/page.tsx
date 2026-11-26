'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { profileHref } from '@/lib/social-href';
import { searchUsers, searchPosts } from '@/app/actions';
import { Search, Hash, Users, Sparkles, Trophy, TrendingUp, Newspaper } from 'lucide-react';
import FormattedContent from '@/components/FormattedContent';
import EmptyState from '@/components/EmptyState';

type SearchResult = {
  users: any[];
  posts: any[];
  matches: any[];
  predictions: any[];
  news: any[];
  groups: any[];
};

async function executeSearch(value: string): Promise<SearchResult> {
  const searchQuery = value.trim();
  if (!searchQuery) return { users: [], posts: [], matches: [], predictions: [], news: [], groups: [] };

  const [users, posts, extra] = await Promise.all([
    searchUsers(searchQuery),
    searchPosts(searchQuery),
    fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      .then((r) => (r.ok ? r.json() : { matches: [], predictions: [], news: [], groups: [] }))
      .catch(() => ({ matches: [], predictions: [], news: [], groups: [] })),
  ]);
  return {
    users,
    posts,
    matches: extra.matches || [],
    predictions: extra.predictions || [],
    news: extra.news || [],
    groups: extra.groups || [],
  };
}

const POPULAR_TAGS = [
  '#NextJS',
  '#SwissAlps',
  '#WebDev',
  '#FitnessGoals',
  '#DigitalArt',
  '#Travel',
  '#TypeScript',
];

export default function SearchPage() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(urlQuery);
  const [userResults, setUserResults] = useState<any[]>([]);
  const [postResults, setPostResults] = useState<any[]>([]);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [predictionResults, setPredictionResults] = useState<any[]>([]);
  const [newsResults, setNewsResults] = useState<any[]>([]);
  const [groupResults, setGroupResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;

    if (!urlQuery) {
      // Defer the reset so no state updates run synchronously in the
      // effect body (avoids cascading renders).
      Promise.resolve().then(() => {
        if (id !== requestId.current) return;
        setQuery('');
        setUserResults([]);
        setPostResults([]);
        setMatchResults([]);
        setPredictionResults([]);
        setNewsResults([]);
        setGroupResults([]);
      });
      return;
    }

    // Defer so no state update runs synchronously in the effect body.
    Promise.resolve().then(() => {
      if (id !== requestId.current) return;
      setLoading(true);
    });
    (async () => {
      const results = await executeSearch(urlQuery);
      if (cancelled || id !== requestId.current) return;
      setQuery(urlQuery);
      setUserResults(results.users);
      setPostResults(results.posts);
      setMatchResults(results.matches);
      setPredictionResults(results.predictions);
      setNewsResults(results.news);
      setGroupResults(results.groups);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [urlQuery]);

  const handleSearch = async (value: string) => {
    setQuery(value);
    const id = ++requestId.current;
    setLoading(true);
    const results = await executeSearch(value);
    if (id !== requestId.current) return;
    setUserResults(results.users);
    setPostResults(results.posts);
    setMatchResults(results.matches);
    setPredictionResults(results.predictions);
    setNewsResults(results.news);
    setGroupResults(results.groups);
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 mt-4 sm:mt-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
          <Search className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <span>Explore & Search</span>
        </h1>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => void handleSearch(e.target.value)}
            placeholder="Search hashtags (#NextJS), creators, or posts..."
            className="w-full pl-11 pr-4 py-3.5 bg-gray-100 dark:bg-gray-900 border border-transparent dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 shadow-inner"
          />
        </div>

        {/* Popular Tags Quick Filters */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-yellow-500" /> Popular Hashtags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleSearch(tag)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  query.toLowerCase() === tag.toLowerCase()
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          {userResults.length > 0 && (
            <div>
              <h2 className="font-bold text-base text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span>People ({userResults.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {userResults.map((user: any) => (
                  <Link
                    key={user.id}
                    href={profileHref(user)}
                    className="flex items-center space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700/80 transition-colors group"
                  >
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-gray-200 dark:ring-gray-700" />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {user.name.charAt(0)}
                      </div>
                    )}
                    <div className="font-semibold min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs text-gray-400 font-normal">
                        {user.bio || 'Hyper user'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {postResults.length > 0 && (
            <div>
              <h2 className="font-bold text-base text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Hash className="w-4 h-4 text-blue-500" />
                <span>Posts Matching &quot;{query}&quot; ({postResults.length})</span>
              </h2>
              <div className="space-y-3">
                {postResults.map((res: any) => (
                  <Link
                    key={res.post.id}
                    href={`${profileHref({ id: res.post.userId, name: res.user?.name })}#post-${res.post.id}`}
                    className="block p-4 bg-gray-50 dark:bg-gray-900/60 rounded-2xl hover:bg-blue-50/40 dark:hover:bg-blue-900/20 border border-gray-100 dark:border-gray-700/60 transition-colors"
                  >
                    <div className="flex items-center space-x-2.5 mb-2">
                      {res.user?.avatar ? (
                        <img src={res.user.avatar} alt={res.user.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                          {res.user?.name?.charAt(0) || 'U'}
                        </div>
                      )}
                      <span className="font-bold text-xs text-gray-900 dark:text-white">{res.user?.name}</span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {/* interactive=false: the whole card is already a <Link>,
                          nested anchors are invalid HTML */}
                      <FormattedContent content={res.post.content} interactive={false} />
                    </p>
                    {res.post.imageUrl && (
                      <img src={res.post.imageUrl} alt="post" className="mt-2.5 rounded-xl max-h-48 w-full object-cover" />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {matchResults.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>Matches ({matchResults.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {matchResults.map((m) => (
                  <Link
                    key={m.id}
                    href={`/sports/match/${m.sport}/${m.league}/${m.id}`}
                    className="flex items-center justify-between gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate">{m.leagueName || m.league}</p>
                      <p className="font-bold text-gray-900 dark:text-white truncate">{m.home?.name} vs {m.away?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{m.statusDetail || m.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {predictionResults.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span>Predictions &amp; Tips ({predictionResults.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {predictionResults.map((p) => (
                  <Link
                    key={p.id}
                    href="/sports/predictions"
                    className="flex items-center justify-between gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate">{p.competition || p.federation}</p>
                      <p className="font-bold text-gray-900 dark:text-white truncate">{p.homeTeam} vs {p.awayTeam}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.prediction} @ {p.winOdds}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {newsResults.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                <Newspaper className="w-4 h-4 text-sky-500" />
                <span>Sports News ({newsResults.length})</span>
              </h2>
              <div className="space-y-2">
                {newsResults.map((a) => (
                  <a
                    key={a.id}
                    href={a.link || '/sports'}
                    target={a.link ? '_blank' : undefined}
                    rel={a.link ? 'noopener noreferrer' : undefined}
                    className="block p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-sky-300 dark:hover:border-sky-700 transition-all"
                  >
                    <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">{a.leagueName}</p>
                    <p className="font-bold text-gray-900 dark:text-white">{a.headline}</p>
                    {a.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{a.description}</p>}
                  </a>
                ))}
              </div>
            </div>
          )}

          {groupResults.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                <Users className="w-4 h-4 text-violet-500" />
                <span>Groups ({groupResults.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupResults.map((g) => (
                  <Link
                    key={g.id}
                    href={`/groups/${g.id}`}
                    className="block p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 transition-all"
                  >
                    <p className="font-bold text-gray-900 dark:text-white truncate">{g.name}</p>
                    {g.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">{g.description}</p>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {query.trim() && !loading && userResults.length === 0 && postResults.length === 0 && matchResults.length === 0 && predictionResults.length === 0 && newsResults.length === 0 && groupResults.length === 0 && (
            <EmptyState variant="search" title={`No results found for "${query}"`}>
              Try searching for #NextJS, #Travel, #SwissAlps, or a friend&apos;s name.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
