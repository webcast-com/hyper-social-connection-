import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import { getEspnOdds } from '@/lib/espn-odds-feed';
import type { OddsBoard } from '@/lib/espn-odds';
import SportsPredictionsTips from '@/components/goaledge/SportsPredictionsTips';
import { getSiteUrl } from '@/lib/site-url';
import { HOME_CRUMB, SPORTS_CRUMB, breadcrumbStructuredData } from '@/lib/structured-data';
import JsonLd from '@/components/JsonLd';

export const metadata: Metadata = getPageMetadata({
  title: 'Sports Predictions and Odds',
  description: 'Upcoming ESPN fixtures and bookmaker odds, with optional reported model estimates, game probabilities and strength metrics where available. Record a pick and it is graded once ESPN reports the result.',
  path: '/sports/predictions',
});

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function SportsPredictionsPage() {
  const initial = await getEspnOdds().catch((): OddsBoard => ({
    matches: [],
    sources: [],
    fetchedAt: new Date().toISOString(),
    status: 'unavailable',
    truncated: false,
  }));

  return (
    <>
      <JsonLd data={breadcrumbStructuredData([HOME_CRUMB, SPORTS_CRUMB, { name: 'Predictions', path: '/sports/predictions' }], getSiteUrl())} />
      <SportsPredictionsTips initial={initial} />
    </>
  );
}
