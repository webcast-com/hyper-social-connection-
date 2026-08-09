'use client';

import Link from 'next/link';
import { Flame, TrendingUp, Sparkles, Hash } from 'lucide-react';

export type TrendingTopic = {
  tag: string;
  category: string;
  postsCount: number;
};

export default function TrendingTopics({
  topics,
}: {
  topics?: TrendingTopic[];
}) {
  const defaultTopics: TrendingTopic[] = [
    { tag: '#NextJS', category: 'Technology · Trending', postsCount: 142 },
    { tag: '#SwissAlps', category: 'Travel & Photography', postsCount: 89 },
    { tag: '#WebDev', category: 'Software Engineering', postsCount: 64 },
    { tag: '#FitnessGoals', category: 'Health & Fitness', postsCount: 45 },
    { tag: '#DigitalArt', category: 'Art & Design', postsCount: 38 },
  ];

  const items = topics && topics.length > 0 ? topics : defaultTopics;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/60">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-gray-900 dark:text-white font-bold text-sm flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
          <span>Trending Topics</span>
        </h3>
        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Live</span>
      </div>

      <div className="space-y-3">
        {items.map((topic, idx) => (
          <Link
            key={idx}
            href={`/search?q=${encodeURIComponent(topic.tag)}`}
            className="block p-2 -mx-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
          >
            <div className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
              {topic.category}
            </div>
            <div className="font-bold text-sm text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center space-x-1 mt-0.5">
              <span>{topic.tag}</span>
            </div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
              {topic.postsCount.toLocaleString()} {topic.postsCount === 1 ? 'post' : 'posts'}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700">
        <Link
          href="/search"
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-between"
        >
          <span>Explore all trending tags</span>
          <TrendingUp className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
