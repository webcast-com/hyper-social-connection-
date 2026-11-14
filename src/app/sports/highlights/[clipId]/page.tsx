import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getPageMetadata } from '@/lib/seo';
import { getSiteUrl } from '@/lib/site-url';
import { EVENT_CLIPS_LIMIT, readEventClips, readStoredClip } from '@/lib/highlights-index';
import {
  CLIP_PAGE_ROOT, CLIP_STATUS_LABEL, clipBreadcrumbFor, clipFixtureHref, clipHref, clipMedia,
  clipPageDescription, clipPageTitle, clockDuration, videoObjectFor,
} from '@/lib/highlight-clip';
import LinkMediaPlayer from '@/components/LinkMediaPlayer';

/**
 * One stored highlight clip, as a page of its own.
 *
 * The site keeps every clip it has ever read — hundreds of them, each with a title,
 * a description, a fixture, a competition and a length — and until now all of that
 * lived behind one filterable list, so there was no URL for a search engine to
 * crawl and nothing for a video result to point at. This page is that URL.
 *
 * It is server-rendered from storage, which is the point: a crawler that arrives
 * here gets the clip's title, its description as real text, its facts, the links to
 * the fixture and to the clips beside it, and `VideoObject` plus `BreadcrumbList`
 * structured data — without executing a fetch, and without costing an ESPN request.
 * A clip this site has not stored is a 404, never a page with a heading and nothing
 * under it.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Props = { params: Promise<{ clipId: string }> };

/** Read once per request: the metadata and the page both need the same clip. */
const loadClip = cache((clipId: string) => readStoredClip(clipId));
const loadSiblings = cache((eventId: string) => readEventClips(eventId, EVENT_CLIPS_LIMIT));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clipId } = await params;
  const { clip } = await loadClip(clipId);
  if (!clip) notFound();
  return getPageMetadata({
    title: clipPageTitle(clip),
    description: clipPageDescription(clip),
    path: clipHref(clip),
    type: 'video.other',
    // The clip's own thumbnail, so the shared card is the moment being shared.
    image: clip.thumbnail,
    keywords: [clip.leagueName, clip.eventName, clip.home, clip.away, 'highlights', 'video']
      .filter((word): word is string => !!word && !!word.trim()),
  });
}

export default async function HighlightClipPage({ params }: Props) {
  const { clipId } = await params;
  const { clip } = await loadClip(clipId);
  if (!clip) notFound();

  const origin = getSiteUrl();
  const siblings = clip.eventId
    ? (await loadSiblings(clip.eventId)).clips.filter((other) => other.id !== clip.id)
    : [];
  const structured = [videoObjectFor(clip, origin), clipBreadcrumbFor(clip, origin)]
    .filter((entry): entry is Record<string, unknown> => !!entry);
  const media = clipMedia(clip);
  const length = clockDuration(clip.duration);
  const played = clip.startAt ? new Date(clip.startAt) : null;
  const facts: [string, string | null][] = [
    ['Fixture', clip.eventName || null],
    ['Competition', clip.leagueName || null],
    ['Match state', CLIP_STATUS_LABEL[clip.status] ?? null],
    ['Length', length ? `${length} minutes` : null],
    ['Played', played && !Number.isNaN(played.getTime())
      ? played.toISOString().slice(0, 10)
      : null],
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-3 sm:px-4 py-4 sm:py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
      />

      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <li>
            <Link href="/sports" className="hover:underline">Sports</Link>
            <span aria-hidden="true" className="mx-1">/</span>
          </li>
          <li>
            <Link href={CLIP_PAGE_ROOT} className="hover:underline">Match highlights</Link>
            <span aria-hidden="true" className="mx-1">/</span>
          </li>
          <li aria-current="page" className="text-gray-900 dark:text-gray-100 truncate max-w-[16rem]">
            {clip.title}
          </li>
        </ol>
      </nav>

      <article
        data-highlight-clip={clip.id}
        className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-5 dark:border-gray-800 dark:bg-gray-900"
      >
        <header className="mb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {clip.leagueName}
            <span aria-hidden="true"> · </span>
            {CLIP_STATUS_LABEL[clip.status]}
          </p>
          <h1 className="mt-1 text-lg sm:text-2xl font-semibold leading-snug text-gray-900 dark:text-gray-100">
            {clip.title}
          </h1>
        </header>

        {media ? (
          <div data-clip-player="" className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
            <LinkMediaPlayer
              url={clip.page ?? clip.mp4 ?? origin}
              media={media}
              poster={clip.thumbnail}
              // One video on a page whose whole subject is that video, so its
              // metadata is worth fetching — unlike a board of a dozen cards.
              preload="metadata"
            />
          </div>
        ) : clip.thumbnail ? (
          // Nothing ESPN will serve, but the frame it reported is still the moment.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clip.thumbnail}
            alt={clip.title}
            data-clip-poster=""
            className="w-full rounded-xl border border-gray-200 object-cover dark:border-gray-800"
          />
        ) : (
          <p
            data-clip-unplayable=""
            className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
          >
            ESPN has not reported a playable file for this clip.
          </p>
        )}

        {/* The description as real text: this is the sentence a search result shows,
            and the only prose on the page that is about this clip. */}
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-900 dark:text-gray-100">
          {clipPageDescription(clip)}
        </p>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          {facts.filter(([, value]) => !!value).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-1 dark:border-gray-800">
              <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100 text-right">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={clipFixtureHref(clip)}
            className="rounded-full border border-gray-300 px-3 py-1.5 font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {clip.leagueName} board
          </Link>
          <Link
            href={CLIP_PAGE_ROOT}
            className="rounded-full border border-gray-300 px-3 py-1.5 font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            All match highlights
          </Link>
          {clip.page ? (
            // ESPN one labelled click away, never a redirect: the clip stays on Hyper.
            <a
              href={clip.page}
              rel="noopener noreferrer"
              className="rounded-full px-3 py-1.5 font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Open original on ESPN
            </a>
          ) : null}
        </div>
      </article>

      {siblings.length ? (
        <section aria-label="More clips from this match" className="mt-4" data-related-clips={siblings.length}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            More from {clip.eventName || 'this match'}
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {siblings.map((other) => (
              <li key={`${other.eventId}-${other.id}`}>
                <Link
                  href={clipHref(other)}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                >
                  {other.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={other.thumbnail}
                      alt=""
                      className="h-14 w-24 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {other.title}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {other.leagueName}
                      {clockDuration(other.duration) ? ` · ${clockDuration(other.duration)}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
