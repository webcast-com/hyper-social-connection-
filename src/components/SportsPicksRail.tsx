import Link from 'next/link';
import { Medal, Trophy } from 'lucide-react';
import { ordinal, pickedName, type MatchPick, type PicksLeaderboard } from '@/lib/sports-picks';

/**
 * The picks leaderboard rail.
 *
 * It shows what has been graded and nothing else: readers ranked by points in a
 * window, the record behind each score, and this reader's own standing. A pick
 * ESPN has not reported a result for is listed as awaiting one, because settling
 * it any other way would put a number on the board that no result supports.
 *
 * With no database there is no rail at all rather than an empty one: picks cannot
 * have been taken, and a leaderboard of nobody is not a smaller version of the
 * truth, it is a different claim.
 */
export default function SportsPicksRail({
  leaderboard, picks = [], signedIn = false,
}: {
  leaderboard: PicksLeaderboard;
  /** This reader's own picks, newest first. */
  picks?: MatchPick[];
  signedIn?: boolean;
}) {
  if (!leaderboard.ok) return null;
  const { rows, viewer, days } = leaderboard;
  const awaiting = picks.filter((pick) => !pick.gradedAt);

  return (
    <section aria-label="Pick leaderboard" data-picks-rail className="min-w-0 rounded-3xl border border-violet-100 bg-white p-4 shadow-sm dark:border-violet-900/50 dark:bg-gray-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Trophy aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          Pick leaderboard
        </h2>
        <Link href="/sports/predictions" prefetch={false} className="inline-flex min-h-11 items-center text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          Take a pick
        </Link>
      </div>

      <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">
        Last {days} days · graded picks only · one point per correct pick
      </p>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-violet-50 p-3 text-xs text-gray-700 dark:bg-violet-950/30 dark:text-gray-300">
          No graded picks yet. A pick is graded once ESPN reports the result of the
          fixture it was made on — nothing is settled before then.
        </p>
      ) : (
        <>
          <ol className="space-y-1">
            {rows.map((row, index) => (
              <li key={row.userId} className={`flex min-w-0 items-center gap-2 rounded-xl p-2 ${viewer?.rank === index + 1 ? 'bg-violet-50 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:ring-violet-900/60' : ''}`}>
                <span className="w-7 shrink-0 text-center text-xs font-black tabular-nums text-gray-400 dark:text-gray-500">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-gray-900 dark:text-white">
                    {row.name || row.username || `Reader ${row.userId}`}
                    {viewer?.rank === index + 1 && <span className="ml-1 font-semibold text-violet-600 dark:text-violet-300">(you)</span>}
                  </span>
                  <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {row.won} correct from {row.graded} graded
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-violet-600 px-2 py-1 text-[11px] font-black tabular-nums text-white">
                  {row.points}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            {leaderboard.readers} {leaderboard.readers === 1 ? 'reader has' : 'readers have'} a graded pick in this window.
          </p>
        </>
      )}

      {signedIn && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-slate-700/60">
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-white">
            <Medal aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            {viewer
              ? `You are ${ordinal(viewer.rank)} — ${viewer.points} ${viewer.points === 1 ? 'point' : 'points'} from ${viewer.graded} graded`
              : 'You have no graded pick in this window yet'}
          </p>

          {picks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {picks.slice(0, 5).map((pick) => (
                <li key={pick.id} className="flex min-w-0 items-start justify-between gap-2 rounded-xl bg-gray-50 p-2 dark:bg-gray-700/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-gray-900 dark:text-white">{pickedName(pick)}</span>
                    <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                      {pick.home} v {pick.away}
                      {pick.price !== null ? ` · ${pick.price.toFixed(2)}` : ' · no price reported'}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                    pick.outcome === 'won' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : pick.outcome === 'lost' ? 'bg-gray-200 text-gray-700 dark:bg-gray-600/60 dark:text-gray-200'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}>
                    {pick.outcome === 'won' ? 'Won +1' : pick.outcome === 'lost' ? 'Lost' : 'Awaiting result'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {awaiting.length > 0 && (
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              {awaiting.length} {awaiting.length === 1 ? 'pick is' : 'picks are'} waiting on a result ESPN has not reported yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
