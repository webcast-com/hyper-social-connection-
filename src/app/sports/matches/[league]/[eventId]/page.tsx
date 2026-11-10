import { safeSportsReturnPath } from '@/lib/sports-filters';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SportsMatchDetails from '@/components/SportsMatchDetails';
import { getPageMetadata } from '@/lib/seo';
import { matchHref, MatchInputError, resolveMatch, type MatchBoard } from '@/lib/espn-match';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function generateMetadata({ params }: { params: Promise<{ league: string; eventId: string }> }): Promise<Metadata> {
  const { league, eventId } = await params;
  let resolved;
  try { resolved = resolveMatch(league, eventId); }
  catch { notFound(); }
  return getPageMetadata({
    title: `${resolved.meta.name} match details`,
    description: 'ESPN-reported match statistics, lineups, player stats and match events on Hyper.',
    path: matchHref(resolved.reference), index: false,
  });
}
export default async function MatchDetailsPage({ params, searchParams }: { params: Promise<{ league: string; eventId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { league, eventId } = await params;
  let resolved;
  try { resolved = resolveMatch(league, eventId); }
  catch (error) { if (error instanceof MatchInputError) notFound(); throw error; }
  const query = await searchParams;
  const returnTo = safeSportsReturnPath(query?.returnTo);
  const initial: MatchBoard = { match: null, status: 'unavailable', fetchedAt: new Date().toISOString(),
    source: { ok: false, url: resolved.url, httpStatus: null, error: 'Loading browser feed' } };
  return <SportsMatchDetails key={`${league}/${eventId}`} initial={initial} reference={resolved.reference} returnTo={returnTo} />;
}
