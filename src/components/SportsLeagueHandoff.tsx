import Link from 'next/link';

/**
 * A Sports league URL whose scores moved to the dashboard.
 *
 * The page stays reachable so existing links keep working, and its canonical
 * tag points at the dashboard route that now owns the competition, so search
 * engines consolidate the two URLs instead of competing with each other.
 */
export default function SportsLeagueHandoff({ name, dashboardPath }: { name: string; dashboardPath: string }) {
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 mt-2 sm:mt-4">
      <h1 className="text-xl font-black text-gray-900 sm:text-2xl dark:text-white">{name} scores</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {name} scores, fixtures, standings and top scorers are part of the Basketball &amp; NFL dashboard, which uses the
        same ESPN feeds as the rest of Hyper Sports.
      </p>
      <p className="mt-4">
        <Link
          href={dashboardPath}
          className="inline-flex min-h-11 items-center rounded-full bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
        >
          Open the {name} dashboard
        </Link>
      </p>
      <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
        Looking for other sports? <Link href="/sports" className="font-bold text-blue-600 underline hover:no-underline dark:text-blue-400">Worldwide sports scores</Link>{' '}
        still covers football, rugby, American football, baseball, ice hockey and motorsport.
      </p>
    </div>
  );
}
