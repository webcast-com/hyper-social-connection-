import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import { getViewer } from '@/lib/viewer';
import { getSportsHighlights, type SportsHighlightsBoard } from '@/lib/espn-highlights-feed';
import { highlightAnchorRefs, loadAnchorEngagement } from '@/lib/sports-anchor-store';
import { ESPN_LEAGUES } from '@/lib/sports-catalog';
import { SPORTS_BOARD_KEYWORDS } from '@/lib/sports-keywords';
import SportsHighlightsPage from '@/components/SportsHighlightsPage';

export const metadata: Metadata = getPageMetadata({
  title: 'Match Highlights',
  description: 'ESPN match highlight clips from the last seven days of finished fixtures, on one page, filterable by competition and by the state of the match.',
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

export default async function SportsHighlightsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A filter is only honoured when it is one this site knows: an arbitrary
  // `?league=` cannot be turned into a request, and a page never invents one.
  const league = first(params.league);
  const status = first(params.status);
  const initialLeague = ESPN_LEAGUES.some((entry) => entry.slug === league) ? league : '';
  const initialStatus = (STATUSES as readonly string[]).includes(status) ? status : '';

  const board = await getSportsHighlights().catch(emptyBoard);
  const viewer = await getViewer();
  // One bounded read of the saved likes, threads and bookmarks for the clips
  // about to be rendered; a sample board contributes no refs at all.
  const engagement = await loadAnchorEngagement(highlightAnchorRefs(board), viewer?.id ?? null);

  return <SportsHighlightsPage
    initial={board}
    engagement={engagement}
    signedIn={!!viewer}
    initialLeague={initialLeague}
    initialStatus={initialStatus}
  />;
}
