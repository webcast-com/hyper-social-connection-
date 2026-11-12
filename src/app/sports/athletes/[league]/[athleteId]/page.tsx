import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SportsAthleteDetails from '@/components/SportsAthleteDetails';
import { getPageMetadata } from '@/lib/seo';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { athleteHref, resolveAthlete, AthleteInputError, type AthleteBoard } from '@/lib/espn-athlete';
import { cdnPortraits } from '@/lib/espn-team';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * A player page: `/sports/athletes/{competition}/{espnAthleteId}`.
 *
 * The server resolves and validates the reference — an unknown competition or a
 * non-numeric id is a 404 before anything is fetched — then hands the browser an
 * honest `unavailable` board to replace. No sample biography or statistics are
 * substituted: what ESPN did not report stays absent.
 */
export async function generateMetadata({ params }: { params: Promise<{ league: string; athleteId: string }> }): Promise<Metadata> {
  const { league, athleteId } = await params;
  let resolved;
  try { resolved = resolveAthlete(league, athleteId); }
  catch { notFound(); }
  return getPageMetadata({
    title: `${resolved.meta.name} player details`,
    description: `ESPN-reported biography, team and season statistics for this ${resolved.meta.name} player on Hyper.`,
    path: athleteHref(resolved.reference),
    index: false,
  });
}

export default async function AthleteDetailsPage({ params, searchParams }: { params: Promise<{ league: string; athleteId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { league, athleteId } = await params;
  let resolved;
  try { resolved = resolveAthlete(league, athleteId); }
  catch (error) { if (error instanceof AthleteInputError) notFound(); throw error; }
  const query = await searchParams;
  const returnTo = safeSportsReturnPath(query?.returnTo);
  const initial: AthleteBoard = {
    reference: resolved.reference,
    leagueName: resolved.meta.name,
    sport: resolved.meta.kind,
    portraitsFromCdn: cdnPortraits(resolved.meta),
    athlete: null,
    status: 'unavailable',
    fetchedAt: new Date().toISOString(),
    sources: [{ ok: false, url: resolved.urls.site, httpStatus: null, error: 'Loading player feed' }],
  };
  return <SportsAthleteDetails
    key={`${league}/${athleteId}`}
    initial={initial}
    reference={resolved.reference}
    returnTo={returnTo}
  />;
}
