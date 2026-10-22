import type { Metadata } from 'next';
import SportsPredictionsBoard from '@/components/SportsPredictionsBoard';

export const metadata: Metadata = {
  title: 'Sports Predictions',
  description: 'Match predictions on Hyper. Live predictions are currently unavailable.',
  alternates: { canonical: '/sports/predictions' },
  openGraph: {
    title: 'Sports Predictions | Hyper',
    description: 'Match predictions on Hyper. Live predictions are currently unavailable.',
    url: '/sports/predictions',
    images: ['/og-image.png'],
  },
};

export const dynamic = 'force-dynamic';

export default function SportsPredictionsPage() {
  // Keep this route independent of score-provider availability. No provider is connected.
  return <SportsPredictionsBoard />;
}
