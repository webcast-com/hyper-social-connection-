import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import SportsTeamDetails from '@/components/SportsTeamDetails';
import { getPageMetadata } from '@/lib/seo';
import { getSiteUrl } from '@/lib/site-url';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { cdnPortraits, resolveTeam, teamHref, TeamInputError, type TeamBoard } from '@/lib/espn-team';
import { readTeamClips, TEAM_CLIPS_LIMIT } from '@/lib/highlights-index';
import { teamBreadcrumbFor, teamPageDescription, teamPageFacts, teamPageTitle } from '@/lib/team-page';
import { clipHref, clockDuration } from '@/lib/highlight-clip';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * A team page: `/sports/teams/{competition}/{espnTeamId}`.
 *
 * The record, fixtures and squad below are fetched in the browser, because that is
 * a live read of one team and it is the reader who decides to wait for it. But a
 * crawler does not wait, and until now it arrived at a heading that said "Loading
 * team details…" and nothing else — which is why this page was `noindex`, the
 * honest setting for a shell.
 *
 * The server cannot name a team from its id on its own: this site stores no team
 * table. What it does store is clips, and every swept clip carries both sides'
 * names *and* both sides' ESPN team ids. So for any team this site holds a clip
 * for, the id resolves to a name and to a list of real fixtures from rows already
 * in the database — no ESPN call, and nothing inferred from the URL. When it can,
 * the page says so in the HTML and is indexable. When it cannot, it is exactly the
 * shell it was and stays `noindex`: an index full of team pages that cannot name
 * their own team would be worse than none.
 *
 * The reference is still resolved and validated first — an unknown competition or a
 * non-numeric id is a 404 before anything is read.
 */

type Props = {
  params: Promise<{ league: string; teamId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The clips stored for this team, read once per request: the metadata and the page
 * both ask, and `cache` makes the second ask free.
 *
 * Scoped to the competition in the URL, so a numeric id can never pull clips stored
 * under a different league's id space.
 */
const loadStoredTeam = cache((league: string, teamId: string) => readTeamClips(league, teamId, TEAM_CLIPS_LIMIT));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, teamId } = await params;
  let resolved;
  try { resolved = resolveTeam(league, teamId); }
  catch { notFound(); }
  const { clips, teamName } = await loadStoredTeam(league, teamId);
  const facts = teamPageFacts(clips, teamId, teamName);
  return getPageMetadata({
    title: teamPageTitle(facts, resolved.meta.name),
    description: teamPageDescription(facts, resolved.meta.name),
    path: teamHref(resolved.reference),
    // Indexable only when this server can name the team and cite real fixtures for
    // it, rather than only describe the shape of the page that will fetch them.
    index: !!facts,
    image: clips[0]?.thumbnail ?? null,
    keywords: [facts?.teamName, facts?.leagueName, resolved.meta.name, 'team highlights', 'record', 'squad']
      .filter((word): word is string => !!word && !!word.trim()),
  });
}

export default async function TeamDetailsPage({ params, searchParams }: Props) {
  const { league, teamId } = await params;
  let resolved;
  try { resolved = resolveTeam(league, teamId); }
  catch (error) { if (error instanceof TeamInputError) notFound(); throw error; }
  const query = await searchParams;
  const returnTo = safeSportsReturnPath(query?.returnTo);
  const { clips, teamName } = await loadStoredTeam(league, teamId);
  const facts = teamPageFacts(clips, teamId, teamName);
  const origin = getSiteUrl();
  const structured = [teamBreadcrumbFor(facts, origin, resolved.meta.name)]
    .filter((entry): entry is Record<string, unknown> => !!entry);
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
      />

      {facts ? (
        <section
          data-team-stored={clips.length}
          aria-label="Stored highlights for this team"
          className="mx-auto max-w-5xl px-3 pt-3 text-gray-900 sm:px-5 sm:pt-5 dark:text-white"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {facts.leagueName ?? resolved.meta.name}
          </p>
          {/* The team's own stored facts as prose: this is the paragraph a search
              result shows, and the only text here a browser did not fetch. It
              claims a count and opponents, never a score or a result. */}
          <p className="mt-1 break-words text-sm leading-relaxed text-gray-700 sm:text-base dark:text-gray-300">
            {teamPageDescription(facts, resolved.meta.name)}
          </p>

          <h2 className="mt-4 mb-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Highlights stored for this team
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {clips.map((clip) => (
              <li key={`${clip.eventId}-${clip.id}`}>
                <Link
                  href={clipHref(clip)}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-2.5 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                >
                  {clip.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={clip.thumbnail}
                      alt=""
                      loading="lazy"
                      className="h-14 w-24 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {clip.title}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {clockDuration(clip.duration) ?? 'Length not reported'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SportsTeamDetails
        key={`${league}/${teamId}`}
        initial={initial}
        reference={resolved.reference}
        returnTo={returnTo}
        // So the page's own heading names the team in the HTML a crawler reads,
        // instead of saying it is still loading something the server already knew.
        knownTitle={facts?.teamName ?? null}
      />
    </>
  );
}
