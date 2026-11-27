import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import { getEspnOdds } from '@/lib/espn-odds-feed';
import type { OddsBoard } from '@/lib/espn-odds';
import SportsPredictionsTips from '@/components/goaledge/SportsPredictionsTips';
import { getViewer } from '@/lib/viewer';
import { isProUser } from '@/lib/paypal';
import { getSiteUrl } from '@/lib/site-url';
import { HOME_CRUMB, SPORTS_CRUMB, breadcrumbStructuredData } from '@/lib/structured-data';
import JsonLd from '@/components/JsonLd';

export const metadata: Metadata = getPageMetadata({
  title: 'Sports Predictions and Odds',
  description: 'Upcoming fixtures and bookmaker odds, with optional reported model estimates, game probabilities and strength metrics where available. Record a pick and it is graded once the final result is reported.',
  path: '/sports/predictions',
  keywords: [
    "today's tips",
    "today's predictions",
    "tomorrow's tips",
    'sports predictions',
    'football predictions',
    'soccer predictions',
    'daily tips',
    'NFL today',
    'NFL predictions',
    'NFL odds',
    'NBA score',
    'NBA predictions',
    'NBA odds',
    'Premier League predictions',
    'Champions League tips',
    'bookmaker odds',
    'odds comparison',
    '1X2 predictions',
    'money line odds',
    'point spread',
    'over under odds',
    'team standings',
    'team form',
    'head to head',
    'match stats',
    'upcoming fixtures',
    'bet slip',
    'stake calculator',
    'match odds',
  ],
});

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function SportsPredictionsPage() {
  const [initial, viewer] = await Promise.all([
    getEspnOdds().catch((): OddsBoard => ({
      matches: [],
      sources: [],
      fetchedAt: new Date().toISOString(),
      status: 'unavailable',
      truncated: false,
    })),
    getViewer(),
  ]);
  const isPro = viewer ? await isProUser(viewer.id).catch(() => false) : false;

  return (
    <>
      <JsonLd data={breadcrumbStructuredData([HOME_CRUMB, SPORTS_CRUMB, { name: 'Predictions', path: '/sports/predictions' }], getSiteUrl())} />
      <SportsPredictionsTips initial={initial} isPremium={isPro} />
    </>
  );
}
