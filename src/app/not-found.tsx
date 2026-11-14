import Link from 'next/link';

/**
 * The page behind every 404 this site returns.
 *
 * Without it, `notFound()` renders Next's bare fallback: an empty body with no
 * navigation and nothing to read, inside a layout that offers no way out. A reader
 * who follows an old link lands on a blank screen, and a crawler that meets a 404 —
 * which is the correct answer for a profile, group or post that is gone — gets a
 * page that says nothing and links nowhere.
 *
 * So this says what happened, guesses honestly at why, and points at the pages that
 * do carry something: all crawlable, all in the sitemap, and all more useful than a
 * dead end. It is deliberately not specific to any one route, because it answers
 * every unmatched URL on the site as well as every `notFound()`.
 */

const WAYS_BACK = [
  { href: '/', label: 'Home', detail: 'The feed, live scores and highlights' },
  { href: '/discover', label: 'Discover people', detail: 'Members and what they post' },
  { href: '/groups', label: 'Groups', detail: 'Communities you can join' },
  { href: '/sports', label: 'Sports', detail: 'Scores, fixtures and tables' },
  { href: '/sports/highlights', label: 'Match highlights', detail: 'Every clip this site holds' },
];

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
        404 — page not found
      </p>
      <h1 className="mt-2 text-2xl font-black text-gray-900 sm:text-3xl dark:text-white">
        This page isn&rsquo;t here
      </h1>
      {/* The honest range of reasons, without claiming to know which one it was:
          this page answers for every missing profile, group and post on the site. */}
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-600 sm:text-base dark:text-gray-300">
        The link may be out of date, or the person, group or post it pointed to may
        have been removed or made private.
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {WAYS_BACK.map((way) => (
          <li key={way.href}>
            <Link
              href={way.href}
              className="block rounded-2xl border border-gray-200 bg-white p-3.5 transition-colors hover:border-blue-300 dark:border-gray-700/60 dark:bg-gray-800 dark:hover:border-blue-700"
            >
              <span className="block text-sm font-bold text-gray-900 dark:text-white">{way.label}</span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{way.detail}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
        Looking for a match? Try{' '}
        <Link href="/sports" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
          the sports boards
        </Link>{' '}
        or{' '}
        <Link href="/search" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
          search
        </Link>
        .
      </p>
    </main>
  );
}
