'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Trophy } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import SportsEventCard from '@/components/SportsEventCard';
import {
  filterSportsEvents,
  groupEventsByLeague,
  type EventStatus,
  type SportKind,
  type SportsBoard,
} from '@/lib/sports';

import {
  AVAILABLE_SPORTS, SPORT_LABELS, SPORTS_COMPETITIONS, SPORTS_REGIONS,
  competitionRegion, type SportsRegion,
} from '@/lib/sports-catalog';

export default function SportsBoardView({ initial }: { initial: SportsBoard }) {
  const [board, setBoard] = useState(initial);
  const [sport, setSport] = useState<SportKind | 'all'>('all');
  const [status, setStatus] = useState<EventStatus | 'all'>('all');
  const [region, setRegion] = useState<SportsRegion | 'all'>('all');
  const [league, setLeague] = useState('all');
  const [query, setQuery] = useState('');
  const resetFilters = () => {
    setSport('all'); setStatus('all'); setRegion('all'); setLeague('all'); setQuery('');
  };
  const leagueOptions = SPORTS_COMPETITIONS.filter((competition) =>
    (sport === 'all' || competition.kind === sport) && (region === 'all' || competition.region === region),
  ).sort((a, b) => a.name.localeCompare(b.name));

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
    () => filterSportsEvents(board.events, 'all', { sport, status, region, league, query }),
    [board.events, sport, status, region, league, query],
  );
  const groups = useMemo(() => groupEventsByLeague(filtered), [filtered]);
  const liveCount = board.events.filter((e) => e.status === 'live' && e.source !== 'demo').length;

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-4 mt-4 sm:mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <Trophy className="text-amber-500" /> Sports
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Worldwide scores and fixtures from ESPN and TheSportsDB
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

      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        {SPORTS_COMPETITIONS.length} competitions across {AVAILABLE_SPORTS.length} sports. Availability varies by season and provider.
      </p>
      {board.mode !== 'live' && (
        <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {board.mode === 'demo'
            ? 'Sample fixtures only — live providers are unavailable. These are not current scores or schedules.'
            : 'Some feeds are unavailable. Showing fixtures from responding sources.'}
        </p>
      )}
      <div role="group" aria-label="Filter by sport" className="flex flex-wrap gap-2 mb-4">
        {(['all', ...AVAILABLE_SPORTS] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={sport === id}
            onClick={() => { setSport(id); setLeague('all'); }}
            className={`min-h-11 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors ${
              sport === id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {id === 'all' ? 'All sports' : SPORT_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
          Match status
          <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus | 'all')} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <option value="all">All statuses</option><option value="live">Live</option><option value="upcoming">Upcoming</option><option value="final">Results</option>
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
          Region
          <select value={region} onChange={(e) => { setRegion(e.target.value as SportsRegion | 'all'); setLeague('all'); }} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <option value="all">All regions</option>
            {SPORTS_REGIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
          League or competition
          <select value={league} onChange={(e) => setLeague(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <option value="all">All competitions</option>
            {leagueOptions.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
          Search teams or leagues
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Team or competition…" className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800" />
        </label>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <p aria-live="polite">{filtered.length} events in {groups.length} competitions</p>
        <button type="button" onClick={resetFilters} className="min-h-11 font-semibold text-blue-600 hover:underline dark:text-blue-400">Reset filters</button>
      </div>

      {groups.length === 0 ? (
        <EmptyState variant="search" title="No events in this view">
          Try another region, sport or competition, or reset the filters. Fixtures appear when reported by a provider; some competitions may be out of season.
        </EmptyState>
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.league}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                {group.leagueName}
                <span className="ml-2 font-normal normal-case tracking-normal">{SPORTS_REGIONS.find((item) => item.id === competitionRegion(group.league))?.name}</span>
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
