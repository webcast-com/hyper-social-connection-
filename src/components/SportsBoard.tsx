'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Sparkles, Trophy } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import EspnResponseDetails from '@/components/EspnResponseDetails';
import { competitionCountry, sportsDate } from '@/lib/sports-navigation';
import SportsCompetitionBrowser from './SportsCompetitionBrowser';
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

export default function SportsBoardView({ initial, initialLeague = 'all' }: { initial: SportsBoard; initialLeague?: string }) {
  const [board, setBoard] = useState(initial);
  const [sport, setSport] = useState<SportKind | 'all'>('all');
  const [status, setStatus] = useState<EventStatus | 'all'>('all');
  const [region, setRegion] = useState<SportsRegion | 'all'>('all');
  const [league, setLeague] = useState(SPORTS_COMPETITIONS.some((item) => item.slug === initialLeague) ? initialLeague : 'all');
  const [country, setCountry] = useState('all');
  const [date, setDate] = useState('all');
  const [moreFilters, setMoreFilters] = useState(false);
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [query, setQuery] = useState('');
  const resetFilters = () => {
    setSport('all'); setStatus('all'); setRegion('all'); setLeague('all'); setQuery(''); setCountry('all'); setDate('all');
  };
  const countryOptions = [...new Set(SPORTS_COMPETITIONS.filter((item) =>
    (sport === 'all' || item.kind === sport) && (region === 'all' || item.region === region),
  ).map((item) => competitionCountry(item.slug)).filter((item): item is string => !!item))].sort();
  const dates = [...new Set([...board.events.map((event) => sportsDate(event.startAt)).filter(Boolean), ...(date === 'all' ? [] : [date])])].sort();
  const leagueOptions = SPORTS_COMPETITIONS.filter((competition) =>
    (sport === 'all' || competition.kind === sport) && (region === 'all' || competition.region === region) && (country === 'all' || competitionCountry(competition.slug) === country),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  const refreshScores = useCallback(async (force = false) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    if (force) setRefreshError('');
    let routeMissing = false;
    try {
      const res = await fetch(force ? '/api/sports?refresh=1' : '/api/sports', {
        cache: 'no-store', signal: controller.signal,
      });
      routeMissing = res.status === 404;
      if (!res.ok) throw new Error('Refresh failed');
      const next = (await res.json()) as SportsBoard;
      if (!Array.isArray(next.events) || !Array.isArray(next.sources) || !['live', 'partial', 'demo'].includes(next.mode)) {
        throw new Error('Invalid scoreboard');
      }
      if (mounted.current && !controller.signal.aborted) { setBoard(next); setRefreshError(''); }
    } catch {
      if (mounted.current && !controller.signal.aborted && force) {
        setRefreshError(routeMissing
          ? 'The app endpoint /api/sports returned HTTP 404. Check this deployment includes the sports API. Showing the previous update.'
          : 'Could not refresh scores. Showing the previous update. Please try again.');
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current && !controller.signal.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refreshScores();
    }, 45_000);
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      clearInterval(id);
    };
  }, [refreshScores]);

  const filtered = useMemo(
    () => filterSportsEvents(board.events, 'all', { sport, status, region, league, query, country, date }),
    [board.events, sport, status, region, league, query, country, date],
  );
  const groups = useMemo(() => groupEventsByLeague(filtered), [filtered]);
  const counts = new Map<string, number>();
  board.events.forEach((event) => counts.set(event.league, (counts.get(event.league) ?? 0) + 1));
  const browser = <SportsCompetitionBrowser competitions={leagueOptions} counts={counts} selected={league} onSelect={setLeague} />;
  const deniedCount = board.sources.filter((source) => source.httpStatus === 403).length;
  const liveCount = board.events.filter((e) => e.status === 'live' && e.source !== 'demo').length;

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 mt-2 sm:mt-4">
      <div className="relative mb-3">
        <div>
          <h1 className="pr-28 text-2xl font-black flex items-center gap-2 text-gray-900 dark:text-white">
            <Trophy className="text-amber-500" /> Sports
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Worldwide scores and fixtures from ESPN
            {liveCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {liveCount} live
              </span>
            )}
          </p>
        </div>
        <span
          className={`absolute right-0 top-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
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

      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={() => void refreshScores(true)} disabled={refreshing}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 sm:flex-none sm:px-4 rounded-full border border-gray-200 bg-white px-2 py-2 text-[11px] font-bold text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing scores…' : 'Refresh scores'}
        </button>
        <Link
          href="/sports/predictions"
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 sm:flex-none sm:px-4 rounded-full bg-violet-600 px-2 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-violet-700"
        >
          <Sparkles className="h-4 w-4" />
          View predictions
          {board.predictions?.length > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">{board.predictions.length}</span>
          )}
        </Link>
      </div>

      {refreshError && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{refreshError}</p>}
      {board.mode !== 'live' && (
        <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {board.mode === 'demo'
            ? 'Sample fixtures only — live providers are unavailable. These are not current scores or schedules.'
            : 'Some feeds are unavailable. Showing fixtures from responding sources.'}
        </p>
      )}
      {deniedCount > 0 && <p role="note" aria-label="ESPN access restriction" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Access to ESPN was refused (HTTP 403) for {deniedCount} feeds. Check the hosting network’s outbound-access policy and ESPN access permissions. The status alone does not identify who blocked the request; see response metadata below.
      </p>}
      {board.sources.some((source) => !source.ok) && <details className="mb-4 rounded-xl border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
        <summary className="min-h-11 cursor-pointer font-semibold">Unavailable ESPN feed details</summary>
        <ul className="space-y-3">{board.sources.filter((source) => !source.ok).map((source) => <li key={source.id} className="min-w-0 break-words">
          <p>{source.id}: {source.error || 'Unavailable'}</p>
          {source.httpStatus !== undefined && <p>{source.httpStatus === null ? 'No HTTP response' : `HTTP ${source.httpStatus}`} · {source.errorKind || 'response'}</p>}
          <EspnResponseDetails metadata={source.responseMetadata} />
          {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 underline dark:text-blue-400">{source.url}</a>}
        </li>)}</ul>
      </details>}
      <div role="group" aria-label="Filter by sport" className="flex min-w-0 gap-2 overflow-x-auto pb-2 mb-3 sm:flex-wrap">
        {(['all', ...AVAILABLE_SPORTS] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={sport === id}
            onClick={() => { setSport(id); setLeague('all'); setCountry('all'); }}
            className={`shrink-0 min-h-11 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors ${
              sport === id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {id === 'all' ? 'All sports' : SPORT_LABELS[id]}
          </button>
        ))}
      </div>
      <div id="sports-filters" className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <label className={`${moreFilters ? '' : 'hidden sm:block'} min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300`}>
          Match status
          <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus | 'all')} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <option value="all">All statuses</option><option value="live">Live</option><option value="upcoming">Upcoming</option><option value="final">Results</option>
          </select>
        </label>
        <label className={`${moreFilters ? '' : 'hidden sm:block'} min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300`}>
          Region
          <select value={region} onChange={(e) => { setRegion(e.target.value as SportsRegion | 'all'); setLeague('all'); setCountry('all'); }} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <option value="all">All regions</option>
            {SPORTS_REGIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
          Country or area
          <select value={country} onChange={(e) => { setCountry(e.target.value); setLeague('all'); }} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <option value="all">All countries & areas</option>
            {countryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
          League or competition
          <select value={league} onChange={(e) => setLeague(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <option value="all">All competitions</option>
            {leagueOptions.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label className="col-span-2 min-w-0 text-xs font-semibold text-gray-600 sm:col-span-1 dark:text-gray-300">
          Search teams or leagues
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Team or competition…" className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800" />
        </label>
        <label className={`${moreFilters ? '' : 'hidden sm:block'} min-w-0 text-xs font-semibold text-gray-600 dark:text-gray-300`}>
          Match date (EAT)
          <select value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <option value="all">All loaded dates</option>
            {dates.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <p aria-live="polite">{filtered.length} events in {groups.length} competitions</p>
        <button type="button" onClick={resetFilters} className="min-h-11 font-semibold text-blue-600 hover:underline dark:text-blue-400">Reset filters</button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Quick match status" className="flex w-full min-w-0 gap-1 overflow-x-auto sm:w-auto">
          {([['all', 'All matches'], ['live', 'Live'], ['upcoming', 'Upcoming'], ['final', 'Results']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={status === id} onClick={() => setStatus(id)} className={`min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold ${status === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{label}</button>)}
        </div>
        <button type="button" aria-expanded={moreFilters} aria-controls="sports-filters" onClick={() => setMoreFilters((value) => !value)} className="min-h-11 text-xs font-semibold text-blue-600 sm:hidden dark:text-blue-400">{moreFilters ? 'Fewer filters' : (date !== 'all' || region !== 'all') ? 'More filters (active)' : 'More filters'}</button>
        <div role="group" aria-label="Score layout" className="flex gap-1">{(['list', 'cards'] as const).map((id) => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)} className={`min-h-11 rounded-xl px-3 text-xs font-bold capitalize ${view === id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{id}</button>)}</div>
      </div>
      <details className="mb-3 rounded-xl border border-gray-200 bg-white p-2 lg:hidden dark:border-gray-700 dark:bg-gray-800">
        <summary className="min-h-11 cursor-pointer content-center px-2 text-sm font-bold text-gray-900 dark:text-white">Browse competitions</summary>
        {browser}
      </details>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden min-w-0 lg:block"><div className="sticky top-24">{browser}</div></aside>
        <div className="min-w-0">
      {groups.length === 0 ? (
        <EmptyState variant="search" title="No events in this view">
          Try another region, sport or competition, or reset the filters. Fixtures appear when reported by a provider; some competitions may be out of season.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.league} className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 sm:p-3 dark:border-gray-700 dark:bg-gray-900/40">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                {group.leagueName}
                <span className="ml-2 font-normal normal-case tracking-normal">{competitionCountry(group.league) ?? SPORTS_REGIONS.find((item) => item.id === competitionRegion(group.league))?.name} · {group.events.length}</span>
              </h2>
              <div className={view === 'cards' ? "grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2" : "grid min-w-0 grid-cols-1 gap-2"}>
                {group.events.map((ev) => (
                  <SportsEventCard key={ev.id} event={ev} compact={view === 'list'} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
        </div>
      </div>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {SPORTS_COMPETITIONS.length} competitions · {AVAILABLE_SPORTS.length} sports · ESPN-reported fixtures
      </p>
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">Availability varies by season and provider. Date and country filters apply to loaded fixtures only; they do not request historical schedules.</p>
    </div>
  );
}
