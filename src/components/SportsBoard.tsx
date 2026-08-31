'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Trophy } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import SportsEventCard from '@/components/SportsEventCard';
import {
  SPORT_FILTERS,
  filterSportsEvents,
  groupEventsByLeague,
  type EventStatus,
  type SportKind,
  type SportsBoard,
} from '@/lib/sports';

type FilterId = (typeof SPORT_FILTERS)[number]['id'];

export default function SportsBoardView({ initial }: { initial: SportsBoard }) {
  const [board, setBoard] = useState(initial);
  const [filter, setFilter] = useState<FilterId>('all');

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/sports', { cache: 'no-store' });
        if (!res.ok) return;
        const next = (await res.json()) as SportsBoard;
        if (!cancelled) setBoard(next);
      } catch {
        /* keep last good board */
      }
    };
    const id = setInterval(tick, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(
    () => filterSportsEvents(board.events, filter as EventStatus | SportKind | 'all'),
    [board.events, filter],
  );
  const groups = useMemo(() => groupEventsByLeague(filtered), [filtered]);
  const liveCount = board.events.filter((e) => e.status === 'live').length;

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-4 mt-4 sm:mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <Trophy className="text-amber-500" /> Sports
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Scores and fixtures from ESPN and TheSportsDB
            {liveCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {liveCount} live
              </span>
            )}
          </p>
        </div>
        <span
          className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
            board.mode === 'live'
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : board.mode === 'partial'
                ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
          }`}
          title={board.sources.filter((s) => !s.ok).map((s) => `${s.id}: ${s.error}`).join('\n') || 'All sources ok'}
        >
          {board.mode === 'live' ? 'Live feeds' : board.mode === 'partial' ? 'Partial feeds' : 'Sample board'}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href="/sports/predictions"
          className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-violet-700"
        >
          <Sparkles className="h-4 w-4" />
          View predictions
          {board.predictions?.length > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">{board.predictions.length}</span>
          )}
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {SPORT_FILTERS.map((chip) => {
          const active = filter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <EmptyState variant="search" title="No events in this view">
          Try another filter — live games appear here as soon as a feed reports them.
        </EmptyState>
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.league}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                {group.leagueName}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.events.map((ev) => (
                  <SportsEventCard key={ev.id} event={ev} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
