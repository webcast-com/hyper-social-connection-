'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { matchHref } from '@/lib/espn-match';
import { matchProgressPercent } from '@/lib/featured-match';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import type { SportsEvent } from '@/lib/sports';

/**
 * A side's crest at the featured size: the provider's logo, or the side's code
 * when there is no logo or it does not load.
 */
function Crest({ team }: { team: SportsEvent['home'] }) {
  const [failed, setFailed] = useState<string | null>(null);
  return team.logo && team.logo !== failed ? (
    <img src={team.logo} alt="" onError={() => setFailed(team.logo ?? null)} className="h-11 w-11 shrink-0 object-contain sm:h-14 sm:w-14" />
  ) : (
    <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gray-100 text-xs font-extrabold text-gray-500 sm:h-14 sm:w-14 dark:bg-gray-700 dark:text-gray-300">
      {(team.short || team.name).slice(0, 3).toUpperCase()}
    </span>
  );
}

function Side({ team }: { team: SportsEvent['home'] }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Crest team={team} />
      <span title={team.name} className="w-full min-w-0 break-words text-[11px] font-bold leading-tight text-gray-900 sm:text-sm dark:text-white">{team.name}</span>
    </div>
  );
}

/**
 * The board's featured match: the live fixture `pickFeaturedEvent` chose, drawn
 * large above the competitions — crests either side of a display-size scoreline,
 * the provider's clock, and a progress bar when that clock is a football minute.
 *
 * It follows the board's own card rules. Away is first, the way every card on
 * the board reads; a score the provider did not report is a dash, not a zero;
 * and the whole card is one link to the match page when ESPN gave the fixture an
 * id, and plain text when it did not.
 *
 * It is a labelled section and not an `article`: the fixture is still listed in
 * its competition below, so the featured card is a second view of one of the
 * board's cards, never an extra fixture.
 */
export default function SportsFeaturedMatch({ event, returnTo }: { event: SportsEvent; returnTo?: string }) {
  const back = safeSportsReturnPath(returnTo);
  const href = event.source === 'espn' && event.details
    ? `${matchHref(event.details)}${back === '/sports' ? '' : `?returnTo=${encodeURIComponent(back)}`}` : undefined;
  const progress = matchProgressPercent(event);
  const score = `${event.away.score ?? '–'}–${event.home.score ?? '–'}`;
  const spoken = `Featured live match: ${event.away.name} ${event.away.score ?? 'not reported'}, ${event.home.name} ${event.home.score ?? 'not reported'}, ${event.leagueName}${event.detail ? `, ${event.detail}` : ''}`;
  const frame = 'block rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-3 shadow-sm sm:p-4 dark:border-blue-900/70 dark:from-blue-950/50 dark:via-gray-800 dark:to-gray-800';

  const body: ReactNode = (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-600 dark:bg-red-950/60 dark:text-red-300">
          <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          Featured
        </span>
        <span className="min-w-0 break-words text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{event.leagueName}</span>
      </div>

      <div className="mx-auto mt-2 grid max-w-xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:mt-3 sm:gap-4">
        <Side team={event.away} />
        <div className="flex min-w-14 flex-col items-center px-1">
          <span data-featured-score className="whitespace-nowrap font-display text-2xl font-black tabular-nums tracking-wide text-gray-900 sm:text-4xl dark:text-white">{score}</span>
          <span className="mt-0.5 text-center text-[10px] font-bold uppercase text-red-600 dark:text-red-400">
            Live{event.detail ? ` · ${event.detail}` : ''}
          </span>
          {progress !== null && (
            <span aria-hidden="true" data-featured-progress className="mt-1.5 block h-1 w-full max-w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <span className="block h-full rounded-full bg-red-500" style={{ width: `${progress}%` }} />
            </span>
          )}
        </div>
        <Side team={event.home} />
      </div>

      {(event.venue || href) && (
        <p className="mt-2 flex min-w-0 flex-wrap items-center justify-center gap-x-2 text-center text-[11px] text-gray-500 sm:mt-3 dark:text-gray-400">
          {event.venue && <span className="min-w-0 break-words">{event.venue}</span>}
          {href && <span aria-hidden="true" className="font-bold text-blue-600 dark:text-blue-400">Match details →</span>}
        </p>
      )}
    </>
  );

  return (
    <section aria-label="Featured match" data-featured-match={event.id} className="mb-4 min-w-0">
      {href ? (
        <Link href={href} prefetch={false} aria-label={`${spoken}. Open match details`}
          className={`${frame} transition-colors hover:border-blue-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:hover:border-blue-700`}>
          {body}
        </Link>
      ) : (
        <div role="group" aria-label={spoken} className={frame}>{body}</div>
      )}
    </section>
  );
}
