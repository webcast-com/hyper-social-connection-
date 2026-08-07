'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { searchUsers, searchPosts } from '@/app/actions';
import { Search } from 'lucide-react';

type SearchResult = {
  users: any[];
  posts: any[];
};

async function executeSearch(value: string): Promise<SearchResult> {
  const searchQuery = value.trim();
  if (!searchQuery) return { users: [], posts: [] };

  const [users, posts] = await Promise.all([
    searchUsers(searchQuery),
    searchPosts(searchQuery),
  ]);
  return { users, posts };
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(urlQuery);
  const [userResults, setUserResults] = useState<any[]>([]);
  const [postResults, setPostResults] = useState<any[]>([]);
  const requestId = useRef(0);

  // Direct links such as /search?q=travel should load their results too. The
  // async boundary prevents stale responses from overwriting newer searches.
  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;

    (async () => {
      const results = await executeSearch(urlQuery);
      if (cancelled || id !== requestId.current) return;
      setQuery(urlQuery);
      setUserResults(results.users);
      setPostResults(results.posts);
    })();

    return () => {
      cancelled = true;
    };
  }, [urlQuery]);

  const handleSearch = async (value: string) => {
    setQuery(value);
    const id = ++requestId.current;
    const results = await executeSearch(value);
    if (id !== requestId.current) return;
    setUserResults(results.users);
    setPostResults(results.posts);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 mt-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Search</h1>
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => { void handleSearch(e.target.value); }}
            placeholder="Search people or posts..."
            className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
        </div>

        <div className="space-y-8">
          {userResults.length > 0 && (
            <div>
              <h2 className="font-semibold text-lg mb-3">People</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {userResults.map((user: any) => (
                  <Link key={user.id} href={`/profile/${user.id}`} className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg border border-gray-100 transition-colors">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {user.name.charAt(0)}
                      </div>
                    )}
                    <div className="font-semibold min-w-0">
                      <span className="block truncate">{user.name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {postResults.length > 0 && (
            <div>
              <h2 className="font-semibold text-lg mb-3">Posts</h2>
              <div className="space-y-3">
                {postResults.map((res: any) => (
                  <Link key={res.post.id} href={`/profile/${res.post.userId}`} className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center space-x-2 mb-2">
                      {res.user?.avatar ? (
                        <img src={res.user.avatar} alt={res.user.name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                          {res.user?.name?.charAt(0) || '?'}
                        </div>
                      )}
                      <span className="font-semibold text-sm">{res.user?.name}</span>
                    </div>
                    <p className="text-sm text-gray-800">{res.post.content}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {query.trim() && userResults.length === 0 && postResults.length === 0 && (
            <div className="text-center text-gray-500 py-6">
              No results found for &quot;{query}&quot;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
