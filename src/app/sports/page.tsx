import type { Metadata } from 'next';
import SportsBoardView from '@/components/SportsBoard';
import { getSportsBoard } from '@/lib/sports';

export const metadata: Metadata = {
  title: 'Sports — Live scores and fixtures',
  description:
    'Follow live scores and upcoming fixtures across the Premier League, Champions League, NBA, NFL and F1.',
  alternates: { canonical: '/sports' },
  openGraph: {
    title: 'Sports | Hyper',
    description: 'Live scores and fixtures from multiple sports feeds.',
    url: '/sports',
    images: ['/og-image.png'],
  },
};

export const dynamic = 'force-dynamic';

export default async function SportsPage() {
  const board = await getSportsBoard();
  return <SportsBoardView initial={board} />;
}
