import type { Metadata } from 'next';
import './stream.css';
import SportsStreamDashboard, { type StreamHighlightItem, type StreamNewsItem } from '@/components/SportsStreamDashboard';
import { getPageMetadata } from '@/lib/seo';
import { getViewer } from '@/lib/viewer';
import { getStreamBoardForRender } from '@/lib/sportsrc-feed';
import { getSportsVideoNewsForRender } from '@/lib/espn-video-news-feed';
import { getHighlightsBoardForRender } from '@/lib/highlights-board';
import { clipHref, clockDuration } from '@/lib/highlight-clip';
import { streamMatchId } from '@/lib/sportsrc';

export const metadata: Metadata = getPageMetadata({
  title: 'Live Football Streams',
  description: 'Watch live football: the matches streaming now, upcoming and finished fixtures by league, with the latest sports news and match highlights alongside.',
  path: '/sports/live',
});

export const dynamic = 'force-dynamic';

/** How many rail items are sent to the browser. The rail shows four until "See All". */
const NEWS_ITEMS = 12;
const HIGHLIGHT_ITEMS = 4;

/**
 * The live-stream dashboard. Three independent reads, started together so the
 * slowest sets the wait: SportSRC's streamed fixtures, the league video news the
 * home feed already shows, and the stored match highlights. Each has its own
 * time budget and resolves to "nothing" rather than failing the page.
 */
export default async function SportsLivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // `?match=<id>`: the homepage's floating card links to one match. Anything
  // that is not a SportSRC id is ignored and the page opens as usual.
  const asked = (await searchParams).match;
  const initialMatchId = streamMatchId(Array.isArray(asked) ? asked[0] : asked);
  const [viewer, board, newsBoard, highlightsBoard] = await Promise.all([
    getViewer().catch(() => null),
    getStreamBoardForRender(),
    getSportsVideoNewsForRender(),
    getHighlightsBoardForRender(),
  ]);

  const news: StreamNewsItem[] = newsBoard.clips.slice(0, NEWS_ITEMS).map((clip) => ({
    id: clip.id,
    title: clip.title,
    href: clip.page,
    thumbnail: clip.thumbnail,
    date: clip.publishedAt,
    sport: clip.sport,
  }));

  // A board ESPN did not answer holds sample clips; a sample is not a highlight.
  const realClips = highlightsBoard.status === 'live' || highlightsBoard.status === 'partial' ? highlightsBoard.clips : [];
  const highlights: StreamHighlightItem[] = realClips.slice(0, HIGHLIGHT_ITEMS).map((clip) => ({
    id: clip.id,
    title: clip.title,
    thumbnail: clip.thumbnail,
    duration: clockDuration(clip.duration),
    href: clipHref(clip),
  }));

  return (
    <SportsStreamDashboard
      initial={board}
      initialMatchId={initialMatchId}
      news={news}
      highlights={highlights}
      viewer={viewer ? { id: viewer.id, name: viewer.name ?? null, avatar: viewer.avatar ?? null } : null}
    />
  );
}
