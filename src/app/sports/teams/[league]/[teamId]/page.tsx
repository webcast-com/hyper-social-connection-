import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SportsTeamDetails from '@/components/SportsTeamDetails';
import { getPageMetadata } from '@/lib/seo';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { cdnPortraits, resolveTeam, teamHref, TeamInputError, type TeamBoard } from '@/lib/espn-team';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * A team page: `/sports/teams/{competition}/{espnTeamId}`.
 *
 * The server resolves and validates the reference — an unknown competition or a
 * non-numeric id is a 404 before anything is fetched — then hands the browser an
 * honest `unavailable` board to replace. No team data is rendered server-side, so
 * a slow or refused ESPN endpoint can never delay or break the page shell, and no
 * sample squad is ever substituted for the real one.
 */
export async function generateMetadata({ params }: { params: Promise<{ league: string; teamId: string }> }): Promise<Metadata> {
  const { league, teamId } = await params;
  let resolved;
  try { resolved = resolveTeam(league, teamId); }
  catch { notFound(); }
  return getPageMetadata({
    title: `${resolved.meta.name} team details`,
    description: `ESPN-reported record, fixtures and squad for this ${resolved.meta.name} team on Hyper.`,
    path: teamHref(resolved.reference),
    index: false,
  });
}

export default async function TeamDetailsPage({ params, searchParams }: { params: Promise<{ league: string; teamId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { league, teamId } = await params;
  let resolved;
  try { resolved = resolveTeam(league, teamId); }
  catch (error) { if (error instanceof TeamInputError) notFound(); throw error; }
  const query = await searchParams;
  const returnTo = safeSportsReturnPath(query?.returnTo);
  const initial: TeamBoard = {
    reference: resolved.reference,
    leagueName: resolved.meta.name,
    sport: resolved.meta.kind,
    portraitsFromCdn: cdnPortraits(resolved.meta),
    team: null,
    fixtures: [],
    roster: [],
    status: 'unavailable',
    fetchedAt: new Date().toISOString(),
    sources: [{ ok: false, part: 'info', url: resolved.urls.info, httpStatus: null, error: 'Loading team feed' }],
  };
  return <SportsTeamDetails
    key={`${league}/${teamId}`}
    initial={initial}
    reference={resolved.reference}
    returnTo={returnTo}
  />;
}
