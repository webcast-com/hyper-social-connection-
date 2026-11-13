'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clapperboard, Database, RefreshCw } from 'lucide-react';
import { HighlightPostCard } from './SportsHighlightsFeed';
import SportsVideoNewsCard from './SportsVideoNewsCard';
import { anchorKey, anchorRef, highlightAnchorId, type SportsAnchorEngagementMap } from '@/lib/sports-anchor';
import type { SportsHighlightsBoard } from '@/lib/espn-highlights-feed';
import type { SportsHighlightClip, SportsHighlightStatus } from '@/lib/espn-highlights';
import type { SportsVideoNewsClip } from '@/lib/espn-video-news';
import type { IndexedHighlights } from '@/lib/highlights-index';
import type { SweepPass } from '@/lib/highlights-sweep';
import { safeSportsReturnPath } from '@/lib/sports-filters';

/**
 * Every highlight clip this site can show, on one page.
 *
 * Two sources, labelled separately because they are genuinely different things:
 *
 *   1. **The live board** — the dozen clips the homepage highlights feed reads
 *      from ESPN right now. Freshest, smallest, and the only thing this page can
 *      show when there is no database to store anything in.
 *   2. **The stored index** — every clip this site has ever read from ESPN, kept
 *      in Postgres by a bounded background sweeper. This is what makes "all
 *      competitions, kept for days" possible: reading it costs no ESPN request at
 *      all, so the page can filter by competition, by match state and by age, and
 *      page through hundreds of clips without holding a render hostage to
 *      thousands of upstream calls.
 *
 * League video clips (ESPN's per-competition news feed) are stored in the same
 * index and rendered in their own section by their own card, because they have no
 * fixture: nothing here dresses one up as a match, and nothing invents a score, a
 * kickoff or a team pairing for it. They are also the only clip source for
 * competitions whose per-game collections are always empty — the Premier League
 * and the NFL answer those with an empty list, which is a fact about ESPN, not a
 * gap this page can fill.
 *
 * What it refuses to do is invent a reel. A filter is only offered when clips
 * exist for it, a count on a chip is a count of stored clips and says so, a sweep
 * reports what it actually asked and stored, and when the index is unavailable the
 * page says why and shows the live board exactly as it did before the index
 * existed. Sample cards stay labelled as samples and get no post to engage with.
 */

const STATUSES: SportsHighlightStatus[] = ['live', 'upcoming', 'final'];

const STATUS_LABEL: Record<SportsHighlightStatus, string> = {
  live: 'Live',
  upcoming: 'Upcoming',
  final: 'Full time',
};

/** Mirrors `DEFAULT_INDEX_LIMIT` server-side; every read is clamped there. */
const FALLBACK_LIMIT = 24;

/** Age filters. Storage is permanent; only the query is bounded. */
const AGES = [
  { days: 0, label: 'Any age' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'A year' },
] as const;

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

/** The stored half of the same response. Same rule: invalid means "keep what is shown". */
function validIndex(value: unknown): value is IndexedHighlights {
  const index = value as IndexedHighlights | null;
  if (!index || typeof index.ok !== 'boolean') return false;
  if (!Array.isArray(index.match) || !Array.isArray(index.league)) return false;
  if (index.match.length > 200 || index.league.length > 200) return false;
  if (typeof index.remaining !== 'number' || !Number.isFinite(index.remaining) || index.remaining < 0) return false;
  if (!Array.isArray(index.byLeague) || !Array.isArray(index.byStatus)) return false;
  const summary = index.summary as IndexedHighlights['summary'] | null;
  if (!summary || typeof summary.ok !== 'boolean') return false;
  for (const key of ['clips', 'matchClips', 'leagueClips', 'competitions', 'sweptCells'] as const) {
    if (typeof summary[key] !== 'number' || !Number.isFinite(summary[key]) || summary[key] < 0) return false;
  }
  return index.match.every((clip: SportsHighlightClip | null) => !!clip
    && typeof clip.id === 'string' && typeof clip.title === 'string'
    && typeof clip.league === 'string' && typeof clip.leagueName === 'string'
    && STATUSES.includes(clip.status))
    && index.league.every((clip: SportsVideoNewsClip | null) => !!clip
      && typeof clip.id === 'string' && typeof clip.clipId === 'string'
      && typeof clip.title === 'string' && typeof clip.page === 'string'
      && typeof clip.league === 'string' && Array.isArray(clip.teams));
}

/** A sweep report is only shown when it is a real one. */
function validPass(value: unknown): value is SweepPass {
  const pass = value as SweepPass | null;
  if (!pass || typeof pass.ok !== 'boolean') return false;
  if (typeof pass.truncated !== 'boolean' || typeof pass.startedAt !== 'string') return false;
  return (['cells', 'games', 'clips', 'leagueClips', 'requests', 'durationMs'] as const)
    .every((key) => typeof pass[key] === 'number' && Number.isFinite(pass[key]) && pass[key] >= 0);
}

function Chip({ label, count, countLabel, active, onClick }: {
  label: string; count?: number; countLabel?: string; active: boolean; onClick: () => void;
}) {
  return <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={countLabel}
    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${active ? 'border-rose-600 bg-rose-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-rose-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/60'}`}
  >
    {label}
    {typeof count === 'number' && <span
      aria-label={countLabel}
      className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}
    >{count}</span>}
  </button>;
}

/** The noun for a count, so the page never says "1 clips". */
const noun = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);
/** A count and its noun, with the digits grouped the reader's own way. */
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString(undefined)} ${noun(count, one, many)}`;

const when = (value: string | null) => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
};

const shortDate = (value: string | null) => when(value)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? null;

const ago = (value: string | null) => {
  const then = when(value);
  if (!then) return null;
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

export default function SportsHighlightsPage({
  initial,
  initialIndex = null,
  engagement = {},
  signedIn = false,
  currentUser = null,
  initialLeague = '',
  initialStatus = '',
  initialDays = 0,
  initialLimit = FALLBACK_LIMIT,
  initialOffset = 0,
  returnTo = '/sports',
}: {
  initial: SportsHighlightsBoard;
  /** The stored index for the query the page was opened with, when there is one. */
  initialIndex?: IndexedHighlights | null;
  /** Saved likes, threads and bookmarks per clip, loaded once by the page. */
  engagement?: SportsAnchorEngagementMap;
  /** Guests read every card; only a member can engage with one. */
  signedIn?: boolean;
  /** For the league video cards, which compose a real post when commented on. */
  currentUser?: unknown;
  /** From `?league=`, `?status=`, `?days=`, validated by the page before it got here. */
  initialLeague?: string;
  initialStatus?: string;
  initialDays?: number;
  initialLimit?: number;
  initialOffset?: number;
  returnTo?: string;
}) {
  const limit = Number.isFinite(initialLimit) && initialLimit > 0 ? initialLimit : FALLBACK_LIMIT;
  const [board, setBoard] = useState<SportsHighlightsBoard>(initial);
  const [index, setIndex] = useState<IndexedHighlights | null>(initialIndex);
  // Clips loaded so far, across pages. `index` carries the counts and the summary.
  const [stored, setStored] = useState<{ match: SportsHighlightClip[]; league: SportsVideoNewsClip[] }>(
    () => (initialIndex?.ok ? { match: initialIndex.match, league: initialIndex.league } : { match: [], league: [] }),
  );
  const [league, setLeague] = useState(initialLeague);
  const [status, setStatus] = useState(initialStatus);
  const [days, setDays] = useState(initialDays);
  const [offset, setOffset] = useState(initialOffset);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const request = useRef<AbortController | null>(null);

  /** Stored clips exist to be queried; without a database there is nothing to ask. */
  const hasIndex = !!index?.ok;
  const summary = index?.summary;

  const urlFor = (next: { league: string; status: string; days: number; offset: number; refresh?: boolean }) => {
    const params = new URLSearchParams({ index: '1', limit: String(limit) });
    if (next.refresh) params.set('refresh', '1');
    if (next.league) params.set('league', next.league);
    if (next.status) params.set('status', next.status);
    if (next.days > 0) params.set('days', String(next.days));
    if (next.offset > 0) params.set('offset', String(next.offset));
    return `/api/sports/highlights?${params.toString()}`;
  };

  /**
   * One read of the endpoint. `replace` starts a new filtered page; `append` adds
   * the next slice of the same one. A failure keeps everything already on screen.
   */
  const load = async (
    next: { league: string; status: string; days: number; offset: number; refresh?: boolean },
    mode: 'replace' | 'append',
  ) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    if (mode === 'append') setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const response = await fetch(urlFor(next), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Highlights HTTP ${response.status}`);
      const payload = await response.json() as { board?: unknown; index?: unknown };
      if (!payload || !validBoard(payload.board) || !validIndex(payload.index)) throw new Error('Invalid highlights response');
      if (controller.signal.aborted) return;
      const read = payload.index;
      setBoard(payload.board);
      setIndex(read);
      setStored((previous) => (mode === 'append'
        ? { match: [...previous.match, ...read.match], league: [...previous.league, ...read.league] }
        : { match: read.match, league: read.league }));
      // The chips follow what is on screen, not what was clicked: a read that
      // failed leaves both the clips and the filter that produced them alone.
      setLeague(next.league);
      setStatus(next.status);
      setDays(next.days);
      setOffset(next.offset);
    } catch {
      if (!controller.signal.aborted) setError('Could not refresh highlights. Keeping the clips already shown. Please try again.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) { setLoading(false); setLoadingMore(false); }
    }
  };

  const refresh = () => load({ league, status, days, offset: 0, refresh: true }, 'replace');
  const loadMore = () => load({ league, status, days, offset: offset + limit }, 'append');

  /**
   * Ask for one bounded sweep pass, then re-read. The report is shown as it came
   * back, including when the pass did no work because one ran recently: coverage
   * is rate-limited on purpose, and saying so beats a button that lies.
   */
  const sweep = async () => {
    if (sweeping || request.current) return;
    setSweeping(true); setNote(''); setError('');
    try {
      const params = new URLSearchParams({ force: '1' });
      if (league) params.set('league', league);
      const response = await fetch(`/api/sports/highlights/sweep?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Sweep HTTP ${response.status}`);
      const payload = await response.json() as { pass?: unknown };
      if (!validPass(payload.pass)) throw new Error('Invalid sweep response');
      const pass = payload.pass;
      if (!pass.ok) {
        setNote(pass.reason === 'rate-limited'
          ? 'A sweep ran moments ago, so this one did nothing. Coverage advances a bounded slice at a time, on a rate limit, so ESPN is never hammered.'
          : pass.reason === 'no-database'
            ? 'No database is configured, so there is nowhere to store clips. The live board above is all this page can show.'
            : pass.reason === 'unknown-competition'
              ? 'That competition is not one this site covers, so nothing was asked.'
              : 'The sweep failed. Nothing stored changed.');
      } else {
        setNote([
          `Sweep: ${pass.cells} ${pass.cells === 1 ? 'scoreboard' : 'scoreboards'} walked, ${pass.games} ${pass.games === 1 ? 'game' : 'games'} asked, ${pass.clips} match ${pass.clips === 1 ? 'clip' : 'clips'} and ${pass.leagueClips} league ${pass.leagueClips === 1 ? 'clip' : 'clips'} stored, ${pass.requests} requests in ${(pass.durationMs / 1000).toFixed(1)}s.`,
          pass.truncated ? 'The pass stopped at its deadline or its slice; the rest of the catalog waits for the next one.' : '',
        ].filter(Boolean).join(' '));
        await load({ league, status, days, offset: 0 }, 'replace');
      }
    } catch {
      setNote('Could not run a sweep. Nothing stored changed.');
    } finally {
      setSweeping(false);
    }
  };

  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  // Without a stored index the board is the whole page, so filters are applied to
  // what is already in memory and no request is made.
  const chooseLeague = (next: string) => { if (hasIndex) void load({ league: next, status, days, offset: 0 }, 'replace'); else setLeague(next); };
  const chooseStatus = (next: string) => { if (hasIndex) void load({ league, status: next, days, offset: 0 }, 'replace'); else setStatus(next); };
  const chooseDays = (next: number) => { if (hasIndex) void load({ league, status, days: next, offset: 0 }, 'replace'); else setDays(next); };
  const clearFilters = () => {
    if (hasIndex) void load({ league: '', status: '', days: 0, offset: 0 }, 'replace');
    else { setLeague(''); setStatus(''); setDays(0); }
  };

  // A sample board is placeholder data, so it gets no anchor posts — the same
  // rule the homepage card follows. Stored clips are never samples: a row exists
  // only because ESPN reported it.
  const sample = board.status !== 'live' && board.status !== 'partial';

  const boardClips = board.clips.filter((clip) => (!league || clip.league === league) && (!status || clip.status === status));
  // The same clip can be on the live board and in the index; one card per clip.
  const boardIds = new Set(board.clips.map((clip) => highlightAnchorId(clip)));
  const storedMatch = stored.match.filter((clip) => !boardIds.has(highlightAnchorId(clip)));
  const storedLeague = stored.league.filter((clip) => (!league || clip.league === league));

  const storedCount = (slug: string) => index?.byLeague.find((entry) => entry.league === slug)?.total ?? 0;
  const storedStatusCount = (value: SportsHighlightStatus) => index?.byStatus.find((entry) => entry.status === value)?.total ?? 0;
  const countWhere = (nextLeague: string, nextStatus: string) => board.clips
    .filter((clip) => (!nextLeague || clip.league === nextLeague) && (!nextStatus || clip.status === nextStatus)).length;

  /**
   * What a chip's badge counts. Stored totals while anything is stored, because
   * that is the number a reader cannot work out from the page in front of them;
   * the board's own clips while the index is empty or unreadable, because a badge
   * reading zero next to four cards would be a lie about those cards.
   */
  const countsAreStored = hasIndex && (summary?.clips ?? 0) > 0;
  const countLabel = countsAreStored ? 'Stored clips' : 'Clips on the live board';

  // Competitions offered as filters: every one the board has clips for, plus every
  // one the index has stored clips for. A filter cannot be chosen that empties the
  // page by construction.
  const leagueNames = new Map<string, string>();
  for (const clip of board.clips) leagueNames.set(clip.league, clip.leagueName);
  for (const entry of index?.byLeague ?? []) {
    if (!leagueNames.has(entry.league)) leagueNames.set(entry.league, entry.leagueName);
  }
  for (const clip of stored.match) if (!leagueNames.has(clip.league)) leagueNames.set(clip.league, clip.leagueName);
  for (const clip of stored.league) if (!leagueNames.has(clip.league)) leagueNames.set(clip.league, clip.leagueName);
  const leagues = [...leagueNames.entries()]
    .filter(([slug]) => !hasIndex || countWhere(slug, '') > 0 || storedCount(slug) > 0)
    .sort((a, b) => a[1].localeCompare(b[1]));
  const statuses = STATUSES.filter((value) => board.clips.some((clip) => clip.status === value) || storedStatusCount(value) > 0);

  const filtered = !!league || !!status || days > 0;
  const shown = boardClips.length + storedMatch.length + storedLeague.length;
  const card = (clip: SportsHighlightClip) => {
    const anchor = sample ? null : anchorRef('highlight', highlightAnchorId(clip));
    return <HighlightPostCard
      key={`stored-${clip.league}-${clip.id}`}
      clip={clip}
      anchor={anchor}
      engagement={anchor ? engagement[anchorKey(anchor)] ?? null : null}
      signedIn={signedIn}
    />;
  };

  return <div className="mx-auto max-w-3xl p-3 text-gray-900 sm:p-5 dark:text-white">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Link href={safeSportsReturnPath(returnTo)} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to sports scores
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void sweep()}
          disabled={sweeping || loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-200 px-4 text-sm font-bold text-rose-600 disabled:opacity-60 dark:border-gray-700 dark:text-rose-400"
        >
          <Database aria-hidden="true" className={`h-4 w-4 ${sweeping ? 'animate-pulse' : ''}`} />
          {sweeping ? 'Sweeping…' : 'Sweep more competitions'}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || sweeping}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing…' : 'Refresh highlights'}
        </button>
      </div>
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
      {hasIndex && summary && <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700 dark:text-gray-200">
        <span>
          <span className="font-bold">{summary.clips.toLocaleString(undefined)}</span>
          {' '}{noun(summary.clips, 'clip')} stored across {plural(summary.competitions, 'competition')}
        </span>
        <span aria-hidden="true">·</span>
        <span>{summary.matchClips} match, {summary.leagueClips} league video</span>
        {summary.lastSweepAt && <><span aria-hidden="true">·</span><span>last swept {ago(summary.lastSweepAt)}</span></>}
        {summary.oldestAt && <><span aria-hidden="true">·</span><span>oldest {shortDate(summary.oldestAt)}</span></>}
      </p>}
      {index && !index.ok && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {index.reason === 'no-database'
          ? 'No database is configured on this deployment, so there is nowhere to keep clips between requests. Showing the live board only.'
          : 'The stored clip index could not be read, so this page is showing the live board only. Stored clips are kept, not lost.'}
      </p>}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        ESPN publishes per-game clips for some competitions and not others — the Premier League and the NFL answer a game’s
        own collection with an empty list — so league video is stored and shown alongside them rather than left out.
      </p>
    </header>

    {error && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {note && <p role="status" className="mb-3 text-sm text-gray-700 dark:text-gray-200">{note}</p>}

    {(board.clips.length > 0 || hasIndex) && <div className="mb-4 space-y-2">
      <div role="group" aria-label="Filter highlights by competition" className="flex min-w-0 flex-wrap items-center gap-2">
        <Chip
          label="Every competition"
          count={countsAreStored ? summary?.clips ?? 0 : countWhere('', status)}
          countLabel={countsAreStored ? 'Stored clips in every competition' : 'Clips on the live board'}
          active={league === ''}
          onClick={() => chooseLeague('')}
        />
        {leagues.map(([slug, name]) => <Chip
          key={slug}
          label={name}
          count={countsAreStored ? storedCount(slug) : countWhere(slug, status)}
          countLabel={countsAreStored ? `Stored clips in ${name}` : `Clips on the live board in ${name}`}
          active={league === slug}
          onClick={() => chooseLeague(slug)}
        />)}
      </div>
      <div role="group" aria-label="Filter highlights by match state" className="flex min-w-0 flex-wrap items-center gap-2">
        <Chip
          label="Any state"
          count={countsAreStored ? undefined : countWhere(league, '')}
          countLabel={countsAreStored ? undefined : 'Clips on the live board'}
          active={status === ''}
          onClick={() => chooseStatus('')}
        />
        {statuses.map((value) => <Chip
          key={value}
          label={STATUS_LABEL[value]}
          count={countsAreStored ? storedStatusCount(value) : countWhere(league, value)}
          countLabel={countsAreStored ? `Stored match clips at ${STATUS_LABEL[value].toLowerCase()}` : `Clips on the live board at ${STATUS_LABEL[value].toLowerCase()}`}
          active={status === value}
          onClick={() => chooseStatus(value)}
        />)}
      </div>
      {hasIndex && <div role="group" aria-label="Filter highlights by age" className="flex min-w-0 flex-wrap items-center gap-2">
        {AGES.map((age) => <Chip
          key={age.days}
          label={age.label}
          countLabel="Stored clips this recent"
          active={days === age.days}
          onClick={() => chooseDays(age.days)}
        />)}
      </div>}
      {countsAreStored && <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Counts on these chips are clips stored in the index, not clips on this page.
      </p>}
      {hasIndex && <p className="text-[11px] text-gray-500 dark:text-gray-400">
        {countLabel} are counted here. League video has no match state, so a state filter shows match clips only, and an age
        filter measures from the match or the publication ESPN reported.
      </p>}
    </div>}

    {boardClips.length > 0 && <section aria-label="Live highlights board" className="space-y-4">
      {hasIndex && <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <Clapperboard aria-hidden="true" className="h-4 w-4" /> On the live board now
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-200">{boardClips.length}</span>
      </h2>}
      <div aria-busy={loading} className="space-y-4">
        {boardClips.map((clip) => {
          const anchor = sample ? null : anchorRef('highlight', highlightAnchorId(clip));
          return <HighlightPostCard
            key={`${clip.eventId}-${clip.id}`}
            clip={clip}
            anchor={anchor}
            engagement={anchor ? engagement[anchorKey(anchor)] ?? null : null}
            signedIn={signedIn}
          />;
        })}
      </div>
    </section>}

    {hasIndex && storedMatch.length > 0 && <section aria-label="Stored match highlights" className="mt-5 space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <Database aria-hidden="true" className="h-4 w-4" /> Stored match clips
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-200">{storedMatch.length}</span>
      </h2>
      <div className="space-y-4">{storedMatch.map(card)}</div>
    </section>}

    {hasIndex && storedLeague.length > 0 && <section aria-label="Stored league video" className="mt-5 space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <Clapperboard aria-hidden="true" className="h-4 w-4" /> League video
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-200">{storedLeague.length}</span>
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Clips ESPN publishes as competition video. They have no fixture behind them, so no score, kickoff or match page is
        shown for one.
      </p>
      <div className="space-y-4">
        {storedLeague.map((clip) => <SportsVideoNewsCard key={`league-${clip.id}`} clip={clip} currentUser={currentUser} />)}
      </div>
    </section>}

    {hasIndex && (index?.remaining ?? 0) > 0 && <div className="mt-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void loadMore()}
        disabled={loadingMore || loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-200 px-4 text-sm font-bold text-rose-600 disabled:opacity-60 dark:border-gray-700 dark:text-rose-400"
      >
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loadingMore ? 'animate-spin' : ''}`} />
        {loadingMore ? 'Loading…' : `Load ${Math.min(limit, index?.remaining ?? 0)} more stored clips`}
      </button>
      <span className="text-xs text-gray-500 dark:text-gray-400">{(index?.remaining ?? 0).toLocaleString(undefined)} more match this filter</span>
    </div>}

    {!shown && (board.clips.length || hasIndex
      ? <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
        <p className="font-bold">No clips match those filters.</p>
        <p className="mt-1">
          {hasIndex
            ? `${(summary?.clips ?? 0).toLocaleString(undefined)} clips are stored, none of them${league ? ` in ${leagueNames.get(league) ?? 'that competition'}` : ''}${league && status ? ' and' : ''}${status ? ` ${STATUS_LABEL[status as SportsHighlightStatus]}` : ''}${days ? ` in the last ${days} days` : ''}.`
            : `${board.clips.length} ${board.clips.length === 1 ? 'clip is' : 'clips are'} on this board, none of them${league ? ` in ${leagueNames.get(league) ?? 'that competition'}` : ''}${league && status ? ' and' : ''}${status ? ` ${STATUS_LABEL[status as SportsHighlightStatus]}` : ''}.`}
        </p>
        <button type="button" onClick={clearFilters} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-gray-200 px-4 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-gray-700 dark:text-rose-400 dark:hover:bg-gray-700/60">
          Show every clip
        </button>
      </div>
      : <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
        <p className="font-bold">No highlight clips right now.</p>
        <p className="mt-1">
          {sample
            ? 'The highlights feed could not be read at all, so there is nothing to show. Sample cards are always labelled as samples where they do appear, and this page substitutes none of them for a missing clip.'
            : 'ESPN published no clips for the fixtures this board asked about, and nothing is stored yet. Clips are published per game, and coverage varies by competition; a sweep walks the catalog a bounded slice at a time.'}
        </p>
      </div>)}

    <details className="mt-5 min-w-0 rounded-xl border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
      <summary className="min-h-11 cursor-pointer font-semibold">ESPN highlights feed and stored index details</summary>
      <p className="mt-2 break-words">
        Live board: {board.status} · {board.clips.length} {board.clips.length === 1 ? 'clip' : 'clips'} from {board.games} {board.games === 1 ? 'game' : 'games'}
        {sample ? ' · sample cards, no posts to engage with' : ''}
      </p>
      <p className="mt-1 break-words">
        {board.source.ok ? 'Reported' : 'Not reported'}
        {board.source.httpStatus === null ? ' · No HTTP response' : ` · HTTP ${board.source.httpStatus}`}
        {board.source.errorKind ? ` · ${board.source.errorKind}` : ''}
        {board.source.error ? ` · ${board.source.error}` : ''}
      </p>
      {board.source.url && <a href={board.source.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-blue-600 underline dark:text-blue-400">{board.source.url}</a>}
      <p className="mt-2 break-words">
        Stored index: {index
          ? `${index.ok ? 'read' : `unavailable (${index.reason ?? 'unknown'})`} · ${plural(summary?.clips ?? 0, 'clip')} (${summary?.matchClips ?? 0} match, ${summary?.leagueClips ?? 0} league video) across ${plural(summary?.competitions ?? 0, 'competition')} · ${plural(summary?.sweptCells ?? 0, 'scoreboard')} walked · showing ${shown}`
          : 'not read for this page'}
      </p>
      <p className="mt-1 break-words">
        Clips are kept permanently: nothing deletes a stored clip. Coverage grows one bounded pass at a time — at most 24
        scoreboards and 24 game collections per pass, inside a four-second deadline — because ESPN has no bulk highlights
        endpoint and no date range, so every clip costs one request per game.
      </p>
      <p className="mt-2 break-words">Refresh re-reads <code className="break-all">/api/sports/highlights?index=1</code>; the stored half of that read costs no ESPN
        request. Sweep calls <code className="break-all">/api/sports/highlights/sweep?force=1</code>, which is rate-limited per process.</p>
    </details>
  </div>;
}
