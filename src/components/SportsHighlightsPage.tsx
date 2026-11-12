'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { HighlightPostCard } from './SportsHighlightsFeed';
import { anchorKey, anchorRef, highlightAnchorId, type SportsAnchorEngagementMap } from '@/lib/sports-anchor';
import type { SportsHighlightsBoard } from '@/lib/espn-highlights-feed';
import type { SportsHighlightClip, SportsHighlightStatus } from '@/lib/espn-highlights';
import { safeSportsReturnPath } from '@/lib/sports-filters';

/**
 * Every match highlight clip on one page.
 *
 * The homepage card shows four clips and an "show more" button; this is the same
 * board with nowhere to stop, plus the two filters the sports board already
 * speaks — competition and match state. It renders the very same post card as
 * the homepage (`HighlightPostCard`), so a clip looks and behaves identically
 * wherever it is read, and nothing here asks ESPN for anything new: the board
 * comes from the existing highlights feed, and a refresh re-reads the existing
 * `/api/sports/highlights` endpoint.
 *
 * What it refuses to do is invent a reel. When ESPN published no clips for the
 * competitions it was asked about, the page says so and shows the reason; when
 * the feed fell back to its bundled samples, every card stays labelled as a
 * sample and gets no post to engage with, exactly as on the homepage.
 */

const STATUSES: SportsHighlightStatus[] = ['live', 'upcoming', 'final'];

const STATUS_LABEL: Record<SportsHighlightStatus, string> = {
  live: 'Live',
  upcoming: 'Upcoming',
  final: 'Full time',
};

/**
 * The shape a client accepts from `/api/sports/highlights`. A refresh that fails
 * this check is a broken response, not a new board: what is on screen stays.
 */
function validBoard(value: unknown): value is SportsHighlightsBoard {
  const board = value as SportsHighlightsBoard | null;
  if (!board || !Array.isArray(board.clips) || board.clips.length > 200) return false;
  if (!['live', 'partial', 'unavailable'].includes(String(board.status))) return false;
  if (typeof board.games !== 'number' || !Number.isFinite(board.games) || board.games < 0) return false;
  const source = board.source as SportsHighlightsBoard['source'] | null;
  if (!source || typeof source.ok !== 'boolean' || typeof source.url !== 'string') return false;
  if (source.httpStatus !== null && typeof source.httpStatus !== 'number') return false;
  return board.clips.every((clip: SportsHighlightClip | null) => !!clip
    && typeof clip.id === 'string' && typeof clip.title === 'string'
    && typeof clip.eventId === 'string' && typeof clip.league === 'string'
    && typeof clip.leagueName === 'string' && STATUSES.includes(clip.status));
}

function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${active ? 'border-rose-600 bg-rose-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-rose-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/60'}`}
  >
    {label}
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>{count}</span>
  </button>;
}

export default function SportsHighlightsPage({
  initial,
  engagement = {},
  signedIn = false,
  initialLeague = '',
  initialStatus = '',
  returnTo = '/sports',
}: {
  initial: SportsHighlightsBoard;
  /** Saved likes, threads and bookmarks per clip, loaded once by the page. */
  engagement?: SportsAnchorEngagementMap;
  /** Guests read every card; only a member can engage with one. */
  signedIn?: boolean;
  /** From `?league=` and `?status=`, validated by the page before it got here. */
  initialLeague?: string;
  initialStatus?: string;
  returnTo?: string;
}) {
  const [board, setBoard] = useState<SportsHighlightsBoard>(initial);
  const [league, setLeague] = useState(initialLeague);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  const refresh = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/sports/highlights?refresh=1', {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Highlights HTTP ${response.status}`);
      const next: unknown = await response.json();
      if (!validBoard(next)) throw new Error('Invalid highlights response');
      if (controller.signal.aborted) return;
      setBoard(next);
    } catch {
      // A refresh that fails keeps the clips already on screen.
      if (!controller.signal.aborted) setError('Could not refresh highlights. Keeping the clips already shown. Please try again.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  // A sample board is placeholder data, so it gets no anchor posts — the same
  // rule the homepage card follows.
  const sample = board.status !== 'live' && board.status !== 'partial';

  // Only competitions and states this board actually has clips for are offered,
  // so a filter can never be chosen that empties the page by construction.
  const leagues = [...new Map(board.clips.map((clip) => [clip.league, clip.leagueName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const statuses = STATUSES.filter((value) => board.clips.some((clip) => clip.status === value));
  const countWhere = (nextLeague: string, nextStatus: string) => board.clips
    .filter((clip) => (!nextLeague || clip.league === nextLeague) && (!nextStatus || clip.status === nextStatus)).length;

  const clips = board.clips.filter((clip) => (!league || clip.league === league) && (!status || clip.status === status));
  const filtered = !!league || !!status;
  const clearFilters = () => { setLeague(''); setStatus(''); };

  return <div className="mx-auto max-w-3xl p-3 text-gray-900 sm:p-5 dark:text-white">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Link href={safeSportsReturnPath(returnTo)} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to sports scores
      </Link>
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-60"
      >
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Refreshing…' : 'Refresh highlights'}
      </button>
    </div>

    <header className="mb-4 min-w-0">
      <h1 className="flex items-center gap-2 text-xl font-black sm:text-2xl">
        <span aria-hidden="true" className="text-rose-500">🎬</span> Match highlights
      </h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {sample
          ? 'Sample cards · ESPN highlight videos are unreachable right now'
          : `Clips from ${board.games} ESPN ${board.games === 1 ? 'game' : 'games'} in the last seven days of finished fixtures.`}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        ESPN publishes per-game clips for some competitions and not others, so a competition can be missing here while its
        league video news still appears in the For You feed.
      </p>
    </header>

    {error && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

    {board.clips.length > 0 && <div className="mb-4 space-y-2">
      <div role="group" aria-label="Filter highlights by competition" className="flex min-w-0 flex-wrap items-center gap-2">
        <Chip label="Every competition" count={countWhere('', status)} active={league === ''} onClick={() => setLeague('')} />
        {leagues.map(([slug, name]) => <Chip key={slug} label={name} count={countWhere(slug, status)} active={league === slug} onClick={() => setLeague(slug)} />)}
      </div>
      <div role="group" aria-label="Filter highlights by match state" className="flex min-w-0 flex-wrap items-center gap-2">
        <Chip label="Any state" count={countWhere(league, '')} active={status === ''} onClick={() => setStatus('')} />
        {statuses.map((value) => <Chip key={value} label={STATUS_LABEL[value]} count={countWhere(league, value)} active={status === value} onClick={() => setStatus(value)} />)}
      </div>
    </div>}

    {clips.length ? <div aria-busy={loading} className="space-y-4">
      {clips.map((clip) => {
        const anchor = sample ? null : anchorRef('highlight', highlightAnchorId(clip));
        return <HighlightPostCard
          key={`${clip.eventId}-${clip.id}`}
          clip={clip}
          anchor={anchor}
          engagement={anchor ? engagement[anchorKey(anchor)] ?? null : null}
          signedIn={signedIn}
        />;
      })}
    </div> : board.clips.length
      ? <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
        <p className="font-bold">No clips match those filters.</p>
        <p className="mt-1">{board.clips.length} {board.clips.length === 1 ? 'clip is' : 'clips are'} on this board, none of them
          {league ? ` in ${leagues.find(([slug]) => slug === league)?.[1] ?? 'that competition'}` : ''}
          {league && status ? ' and' : ''}{status ? ` ${STATUS_LABEL[status as SportsHighlightStatus]}` : ''}.</p>
        <button type="button" onClick={clearFilters} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-gray-200 px-4 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-gray-700 dark:text-rose-400 dark:hover:bg-gray-700/60">
          Show every clip
        </button>
      </div>
      : <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
        <p className="font-bold">No highlight clips right now.</p>
        <p className="mt-1">
          {sample
            ? 'The highlights feed could not be read at all, so there is nothing to show. Sample cards are always labelled as samples where they do appear, and this page substitutes none of them for a missing clip.'
            : 'ESPN published no clips for the fixtures this board asked about. Clips are published per game, and coverage varies by competition.'}
        </p>
      </div>}

    <details className="mt-5 min-w-0 rounded-xl border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
      <summary className="min-h-11 cursor-pointer font-semibold">ESPN highlights feed details</summary>
      <p className="mt-2 break-words">
        Board: {board.status} · {board.clips.length} {board.clips.length === 1 ? 'clip' : 'clips'} from {board.games} {board.games === 1 ? 'game' : 'games'}
        {sample ? ' · sample cards, no posts to engage with' : ''}
      </p>
      <p className="mt-1 break-words">
        {board.source.ok ? 'Reported' : 'Not reported'}
        {board.source.httpStatus === null ? ' · No HTTP response' : ` · HTTP ${board.source.httpStatus}`}
        {board.source.errorKind ? ` · ${board.source.errorKind}` : ''}
        {board.source.error ? ` · ${board.source.error}` : ''}
      </p>
      {board.source.url && <a href={board.source.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-blue-600 underline dark:text-blue-400">{board.source.url}</a>}
      <p className="mt-2 break-words">Refresh re-reads <code className="break-all">/api/sports/highlights?refresh=1</code>, which bypasses the feed cache. This page asks ESPN for nothing new.</p>
    </details>
  </div>;
}
