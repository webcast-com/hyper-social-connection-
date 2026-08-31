import type { Metadata } from 'next';
import SportsPredictionsBoard from '@/components/SportsPredictionsBoard';
import { getSportsBoard } from '@/lib/sports';

export const metadata: Metadata = {
  title: 'Sports Predictions — Football picks and odds',
  description: 'View football match predictions, odds, and shareable picks for upcoming UEFA fixtures.',
  alternates: { canonical: '/sports/predictions' },
  openGraph: {
    title: 'Sports Predictions | Hyper',
    description: 'Football match predictions and odds powered by the RapidAPI prediction feed.',
    url: '/sports/predictions',
    images: ['/og-image.png'],
  },
};

export const dynamic = 'force-dynamic';

export default async function SportsPredictionsPage() {
  const board = await getSportsBoard({ bypassCache: true });
  return <SportsPredictionsBoard initial={board} />;
}
