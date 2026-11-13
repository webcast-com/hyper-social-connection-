import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';
import { getEspnOdds } from '@/lib/espn-odds-feed';
import { getViewer } from '@/lib/viewer';
import type { OddsBoard } from '@/lib/espn-odds';
import { indexPicksByEvent, pickEventKey, type MatchPick } from '@/lib/sports-picks';
import { findViewerPicks, getPicksLeaderboard } from '@/lib/sports-picks-store';
import SportsPredictionsBoard from '@/components/SportsPredictionsBoard';
import SportsPicksRail from '@/components/SportsPicksRail';

export const metadata: Metadata = getPageMetadata({
  title: 'Sports Predictions and Odds',
  description: 'Upcoming ESPN fixtures and bookmaker odds, with optional reported model estimates, game probabilities and strength metrics where available. Record a pick and it is graded once ESPN reports the result.',
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

  // Two small indexed reads, and neither throws: with no database a reader gets
  // no rail and no recorded picks, and the odds on this page are unchanged from
  // what they were before picks existed.
  const [leaderboard, viewerPicks] = await Promise.all([
    getPicksLeaderboard(viewer?.id ?? null),
    viewer ? findViewerPicks(viewer.id) : Promise.resolve([] as MatchPick[]),
  ]);

  // Keyed by the odds board's own match id, so the card never builds a fixture
  // key. A fixture the viewer picked that is no longer listed simply has no card
  // to appear on; it is still on the rail.
  const byEvent = indexPicksByEvent(viewerPicks);
  const picksByMatchId: Record<string, MatchPick> = {};
  for (const match of initial.matches) {
    if (!match.details) continue;
    const pick = byEvent.get(pickEventKey(match.details.league, match.details.eventId));
    if (pick) picksByMatchId[match.id] = pick;
  }

  return (
    <SportsPredictionsBoard
      initial={initial}
      currentUserId={viewer?.id}
      picksByMatchId={picksByMatchId}
      leaderboard={<SportsPicksRail leaderboard={leaderboard} picks={viewerPicks} signedIn={!!viewer} />}
    />
  );
}
