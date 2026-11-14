import { safeSportsReturnPath } from '@/lib/sports-filters';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import SportsMatchDetails from '@/components/SportsMatchDetails';
import { getPageMetadata } from '@/lib/seo';
import { getSiteUrl } from '@/lib/site-url';
import { matchHref, MatchInputError, resolveMatch, type MatchBoard } from '@/lib/espn-match';
import { EVENT_CLIPS_LIMIT, readEventClips } from '@/lib/highlights-index';
import {
  matchBreadcrumbFor, matchPageDescription, matchPageFacts, matchPageTitle, sportsEventObjectFor,
} from '@/lib/match-page';
import { clipHref, clockDuration } from '@/lib/highlight-clip';

/**
 * One fixture.
 *
 * The statistics, lineups and events below are fetched in the browser, because that
 * is a live read of one match and it is the reader who decides to wait for it. But a
 * crawler does not wait, and until now it arrived at a heading that said "Loading
 * match details…" and nothing else — which is why this page was `noindex`, the
 * honest setting for a shell.
 *
 * Every clip this site has swept carries the fixture's own reported facts, so a
 * fixture with stored clips has something true to say before any browser fetch
 * happens: the two sides, the competition, when it started, and the highlights
 * themselves as links. When it can, the page says so in the HTML and is indexable.
 * When it cannot, it is exactly the shell it was and stays `noindex` — an index full
 * of empty match pages would be worse than none, and a page that claims to be about
 * a fixture it can name no part of is not a page worth crawling.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Props = {
  params: Promise<{ league: string; eventId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The clips stored for this fixture, read once per request: the metadata and the
 * page both ask, and `cache` makes the second ask free.
 *
 * A stored event id is namespaced — `espn-{league}-{id}` — and the read matches it
 * exactly or as a dash-separated prefix, so a scoreboard that reported more than one
 * competition for the fixture still lands here.
 */
const loadStoredClips = cache((league: string, eventId: string) => readEventClips(`espn-${league}-${eventId}`, EVENT_CLIPS_LIMIT));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, eventId } = await params;
  let resolved;
  try { resolved = resolveMatch(league, eventId); }
  catch { notFound(); }
  const { clips } = await loadStoredClips(league, eventId);
  const facts = matchPageFacts(clips);
  return getPageMetadata({
    title: matchPageTitle(facts, resolved.meta.name),
    description: matchPageDescription(facts, resolved.meta.name),
    path: matchHref(resolved.reference),
    // Indexable only when this server can say something about the fixture itself,
    // rather than only about the shape of the page that will fetch it.
    index: !!facts,
    image: clips[0]?.thumbnail ?? null,
    keywords: [facts?.leagueName, facts?.home, facts?.away, resolved.meta.name, 'match stats', 'highlights']
      .filter((word): word is string => !!word && !!word.trim()),
  });
}

export default async function MatchDetailsPage({ params, searchParams }: Props) {
  const { league, eventId } = await params;
  let resolved;
  try { resolved = resolveMatch(league, eventId); }
  catch (error) { if (error instanceof MatchInputError) notFound(); throw error; }
  const query = await searchParams;
  const returnTo = safeSportsReturnPath(query?.returnTo);
  const { clips } = await loadStoredClips(league, eventId);
  const facts = matchPageFacts(clips);
  const origin = getSiteUrl();
  const href = matchHref(resolved.reference);
  const structured = [
    sportsEventObjectFor(facts, origin, href),
    matchBreadcrumbFor(facts, origin, resolved.meta.name, href),
  ].filter((entry): entry is Record<string, unknown> => !!entry);
  const initial: MatchBoard = { match: null, status: 'unavailable', fetchedAt: new Date().toISOString(),
    source: { ok: false, url: resolved.url, httpStatus: null, error: 'Loading browser feed' } };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
      />

      {facts ? (
        <section
          data-match-stored={clips.length}
          aria-label="Stored highlights for this fixture"
          className="mx-auto max-w-5xl px-3 pt-3 text-gray-900 sm:px-5 sm:pt-5 dark:text-white"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {facts.leagueName ?? resolved.meta.name}
          </p>
          {/* The fixture's own reported facts as prose: this is the paragraph a
              search result shows, and the only text here a browser did not fetch. */}
          <p className="mt-1 break-words text-sm leading-relaxed text-gray-700 sm:text-base dark:text-gray-300">
            {matchPageDescription(facts, resolved.meta.name)}
          </p>

          <h2 className="mt-4 mb-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Highlights stored for this fixture
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

      <SportsMatchDetails
        key={`${league}/${eventId}`}
        initial={initial}
        reference={resolved.reference}
        returnTo={returnTo}
        // So the page's own heading names the fixture in the HTML a crawler reads,
        // instead of saying it is still loading something the server already knew.
        knownTitle={facts?.eventName ?? null}
      />
    </>
  );
}
