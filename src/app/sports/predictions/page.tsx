import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import { getEspnOdds } from '@/lib/espn-odds-feed';
import { getViewer } from '@/lib/viewer';
import type { OddsBoard } from '@/lib/espn-odds';
import SportsPredictionsBoard from '@/components/SportsPredictionsBoard';

export const metadata: Metadata = getPageMetadata({
  title: 'Sports Predictions',
  description: 'Upcoming ESPN fixtures and reported bookmaker odds for match discussions and polls.',
  path: '/sports/predictions',
});

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
