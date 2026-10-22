import type { Metadata } from 'next';
import { getEspnOdds } from '@/lib/espn-odds-feed';
import { getViewer } from '@/lib/viewer';
import type { OddsBoard } from '@/lib/espn-odds';
import SportsPredictionsBoard from '@/components/SportsPredictionsBoard';

export const metadata: Metadata = {
  title: 'Sports Predictions',
  description: 'Upcoming ESPN fixtures and reported bookmaker odds for match discussions and polls.',
  alternates: { canonical: '/sports/predictions' },
  openGraph: {
    title: 'Sports Predictions | Hyper',
    description: 'Upcoming ESPN fixtures and reported bookmaker odds for match discussions and polls.',
    url: '/sports/predictions',
    images: ['/og-image.png'],
  },
};

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function SportsPredictionsPage() {
  const [initial, viewer] = await Promise.all([
    getEspnOdds().catch((): OddsBoard => ({
      matches: [], sources: [], fetchedAt: new Date().toISOString(), status: 'unavailable', truncated: false,
    })),
    getViewer(),
  ]);
  return <SportsPredictionsBoard initial={initial} currentUserId={viewer?.id} />;
}
