import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import SportsBoardView from '@/components/SportsBoard';
import { sportsFiltersFromRecord, sportsFilterSearch } from '@/lib/sports-filters';
import { getSportsBoard } from '@/lib/sports';

export const metadata: Metadata = getPageMetadata({
  title: 'Sports',
  description: 'Follow worldwide football, basketball, rugby, baseball, ice hockey, American football and motorsport scores and fixtures.',
  path: '/sports',
});

export const dynamic = 'force-dynamic';

export default async function SportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = sportsFiltersFromRecord(params);
  const board = await getSportsBoard();
  return <SportsBoardView key={sportsFilterSearch(filters)} initial={board} initialFilters={filters} />;
}
