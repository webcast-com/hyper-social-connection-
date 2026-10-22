import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SportsMatchDetails from '@/components/SportsMatchDetails';
import { getMatchDetails } from '@/lib/espn-match-feed';
import { MatchInputError, resolveMatch, type MatchBoard } from '@/lib/espn-match';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const metadata: Metadata = { title: 'Match details', description: 'ESPN-reported match statistics, lineups, player stats and match events.' };
export default async function MatchDetailsPage({ params }: { params: Promise<{ league: string; eventId: string }> }) {
  const { league, eventId } = await params;
  let resolved;
  try { resolved = resolveMatch(league, eventId); }
  catch (error) { if (error instanceof MatchInputError) notFound(); throw error; }
  const initial = await getMatchDetails(league, eventId).catch((): MatchBoard => ({
    match: null, status: 'unavailable', fetchedAt: new Date().toISOString(),
    source: { ok: false, url: resolved.url, httpStatus: null, error: 'Match details are busy. Please try again shortly.' },
  }));
  if (initial.source.httpStatus === 404) notFound();
  return <SportsMatchDetails key={`${league}/${eventId}`} initial={initial} reference={resolved.reference} />;
}
