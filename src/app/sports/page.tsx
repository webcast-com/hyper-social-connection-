import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import SportsBoardView from '@/components/SportsBoard';
import { sportsFiltersFromRecord, sportsFilterSearch } from '@/lib/sports-filters';
import { emptyBrowserBoard } from '@/lib/espn-browser';
import { SPORTS_BOARD_KEYWORDS } from '@/lib/sports-keywords';

export const metadata: Metadata = getPageMetadata({
  title: 'Live Sports Scores and Fixtures',
  description: 'Follow worldwide football, NBA, WNBA and NCAA basketball, rugby, American football, baseball, ice hockey and motorsport scores and fixtures, with deeper basketball and NFL standings, top scorers and player pages in the Basketball & NFL dashboard.',
  path: '/sports',
  keywords: SPORTS_BOARD_KEYWORDS,
});

export const dynamic = 'force-dynamic';

export default async function SportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = sportsFiltersFromRecord(params);
  const board = emptyBrowserBoard();
  return <SportsBoardView key={sportsFilterSearch(filters)} initial={board} initialFilters={filters} />;
}
