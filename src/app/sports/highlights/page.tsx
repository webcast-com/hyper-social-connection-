import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import { getViewer } from '@/lib/viewer';
import { getSportsHighlights, type SportsHighlightsBoard } from '@/lib/espn-highlights-feed';
import { highlightsStore } from '@/lib/highlights-index';
import { nudgeHighlightsSweep } from '@/lib/highlights-sweep';
import { highlightAnchorRefs, highlightClipsAnchorRefs, loadAnchorEngagement } from '@/lib/sports-anchor-store';
import { ESPN_LEAGUES } from '@/lib/sports-catalog';
import { SPORTS_BOARD_KEYWORDS } from '@/lib/sports-keywords';
import SportsHighlightsPage from '@/components/SportsHighlightsPage';

export const metadata: Metadata = getPageMetadata({
  title: 'Match Highlights',
  description: 'Every ESPN highlight clip this site has read, on one page: the live board plus a permanent stored index across every competition, filterable by competition, match state and age.',
  path: '/sports/highlights',
  keywords: SPORTS_BOARD_KEYWORDS,
});

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const STATUSES = ['live', 'upcoming', 'final'] as const;

/** What the page renders if the highlights feed itself throws. */
const emptyBoard = (): SportsHighlightsBoard => ({
  clips: [],
  status: 'unavailable',
  games: 0,
  source: { ok: false, url: '', httpStatus: null, error: 'Loading highlights feed' },
});

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';

/** A whole-number filter, or 0 meaning "not asked for". Never negative, never NaN. */
const intParam = (value: string, min: number): number => {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? Math.trunc(parsed) : 0;
};

export default async function SportsHighlightsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A filter is only honoured when it is one this site knows: an arbitrary
  // `?league=` cannot be turned into a request, and a page never invents one.
  // The index read clamps all of them again, server-side, before any SQL.
  const league = first(params.league);
  const status = first(params.status);
  const initialLeague = ESPN_LEAGUES.some((entry) => entry.slug === league) ? league : '';
  // Typed as one of the three states the card speaks, so the index query needs no
  // cast: an unknown `?status=` becomes '' here and null in SQL.
  const initialStatus = (STATUSES as readonly string[]).includes(status) ? (status as (typeof STATUSES)[number]) : '';
  const days = intParam(first(params.days), 1);
  const limit = intParam(first(params.limit), 1);
  const offset = intParam(first(params.offset), 0);

  const [board, index] = await Promise.all([
    getSportsHighlights().catch(emptyBoard),
    // A stored read costs no ESPN request: it is a query against clips a bounded
    // sweeper already fetched. Without a database it resolves inert, and the page
    // shows the live board exactly as it did before the index existed.
    highlightsStore.read({
      league: initialLeague || null,
      status: initialStatus || null,
      days: days || null,
      limit: limit || null,
      offset: offset || null,
    }),
  ]);

  // Coverage grows with traffic: one bounded pass, never awaited by this render.
  // Scheduled past the response with `after` so the pass is not frozen mid-flight
  // when this page finishes streaming, and rate-limited to one per ten minutes per
  // process, so a page load can never turn into a fan-out.
  nudgeHighlightsSweep();

  const viewer = await getViewer();
  // One bounded read of the saved likes, threads and bookmarks for the clips
  // about to be rendered — the live board's and the stored ones, which share an
  // anchor per clip, so the same clip engages identically wherever it is read.
  // A sample board contributes no refs at all.
  const engagement = await loadAnchorEngagement(
    [...highlightAnchorRefs(board), ...highlightClipsAnchorRefs(index.match)],
    viewer?.id ?? null,
  );

  return <SportsHighlightsPage
    initial={board}
    initialIndex={index}
    engagement={engagement}
    signedIn={!!viewer}
    currentUser={viewer ?? null}
    initialLeague={initialLeague}
    initialStatus={initialStatus}
    initialDays={days}
    initialOffset={offset}
    initialLimit={limit || undefined}
  />;
}
