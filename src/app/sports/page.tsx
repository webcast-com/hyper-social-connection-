import type { Metadata } from 'next';
import SportsBoardView from '@/components/SportsBoard';
import { getSportsBoard } from '@/lib/sports';

export const metadata: Metadata = {
  title: 'Sports — Live scores and fixtures',
  description:
    'Follow worldwide football, basketball, rugby, baseball, ice hockey, American football and motorsport scores and fixtures.',
  alternates: { canonical: '/sports' },
  openGraph: {
    title: 'Sports | Hyper',
    description: 'Live scores and fixtures from ESPN.',
    url: '/sports',
    images: ['/og-image.png'],
  },
};

export const dynamic = 'force-dynamic';

export default async function SportsPage() {
  const board = await getSportsBoard();
  return <SportsBoardView initial={board} />;
}
