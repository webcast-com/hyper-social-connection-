import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import SportsBoardView from '@/components/SportsBoard';
import { getSportsBoard } from '@/lib/sports';

export const metadata: Metadata = getPageMetadata({
  title: 'Sports',
  description: 'Follow worldwide football, basketball, rugby, baseball, ice hockey, American football and motorsport scores and fixtures.',
  path: '/sports',
});

export const dynamic = 'force-dynamic';

export default async function SportsPage() {
  const board = await getSportsBoard();
  return <SportsBoardView initial={board} />;
}
