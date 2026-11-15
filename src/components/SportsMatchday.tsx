'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Expand, X } from 'lucide-react';
import { matchHref } from '@/lib/espn-match';
import { kickoffCountdown, matchdayPage, matchdayStatus, winningSide } from '@/lib/featured-match';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import SportsRaceSummary from './SportsRaceSummary';
import type { SportsEvent } from '@/lib/sports';

const CONTROL = 'min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200';

function formatKickoff(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** A side's crest at the matchday size, or its code when there is no logo or it does not load. */
function Crest({ team }: { team: SportsEvent['home'] }) {
  const [failed, setFailed] = useState<string | null>(null);
  return team.logo && team.logo !== failed ? (
    <img src={team.logo} alt="" onError={() => setFailed(team.logo ?? null)} className="mx-auto h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14" />
  ) : (
    <span aria-hidden="true" className="mx-auto grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gray-100 text-xs font-extrabold text-gray-500 sm:h-14 sm:w-14">
      {(team.short || team.name).slice(0, 3).toUpperCase()}
    </span>
  );
}

const STATUS_TONES = {
  live: 'bg-red-50 text-red-600 dark:text-red-300',
  upcoming: 'bg-blue-50 text-blue-700 dark:text-blue-300',
  final: 'bg-gray-100 text-gray-600',
  sample: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
} as const;

/** One fixture at matchday size. Away is first, as on every card of the board. */
function MatchdayCard({ event, returnTo, now }: { event: SportsEvent; returnTo: string; now?: number }) {
  const href = event.source === 'espn' && event.sport !== 'motorsport' && !event.race && event.details
    ? `${matchHref(event.details)}${returnTo === '/sports' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}` : undefined;
  const showScore = event.status !== 'upcoming';
  const winner = winningSide(event);
  const dim = (side: 'home' | 'away') => (winner && winner !== side ? ' text-gray-500' : ' text-gray-900');
  const countdown = now === undefined ? null : kickoffCountdown(event, now);
  const line = event.status === 'upcoming'
    ? [formatKickoff(event.startAt), countdown, event.venue].filter(Boolean).join(' · ')
    : event.venue ?? '';

  return (
    <li data-matchday-card={event.id} className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <span className="min-w-0 break-words uppercase tracking-wide text-gray-500">{event.leagueName}</span>
        <span className={`rounded-full px-3 py-1 font-bold ${STATUS_TONES[event.source === 'demo' ? 'sample' : event.status]}`}>{matchdayStatus(event)}</span>
      </div>

      {event.race ? <SportsRaceSummary race={event.race} /> : (
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <Crest team={event.away} />
            <span
              data-matchday-score
              aria-label={showScore ? `${event.away.name}: ${event.away.score ?? 'not reported'}; ${event.home.name}: ${event.home.score ?? 'not reported'}` : 'Scheduled match'}
              className={showScore
                ? 'shrink-0 whitespace-nowrap text-center font-display text-3xl font-black tabular-nums text-gray-900 sm:text-5xl'
                : 'shrink-0 px-2 text-center text-sm font-bold uppercase text-gray-400'}
            >
              {showScore ? `${event.away.score ?? '–'}–${event.home.score ?? '–'}` : 'vs'}
            </span>
            <Crest team={event.home} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center text-sm font-bold leading-tight sm:text-base">
            <span title={event.away.name} className={`min-w-0 break-words${dim('away')}`}>{event.away.name}</span>
            <span title={event.home.name} className={`min-w-0 break-words${dim('home')}`}>{event.home.name}</span>
          </div>
        </div>
      )}

      {/* Pinned to the foot of the card, so a row of cards lines its links up. */}
      <div className="mt-auto pt-4">
        <p className="min-h-5 break-words text-center text-sm text-gray-500">{line}</p>
        {href && (
          <Link href={href} prefetch={false} aria-label={`Match details: ${event.away.name} vs ${event.home.name}`}
            className={`${CONTROL} mt-3 inline-flex w-full items-center justify-center`}>
            Match details
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Matchday mode: the fixtures in the current view, drawn large and six to a
 * page in a window-filling dialog, for following scores from across a room.
 *
 * It shows exactly what the board shows — the same filtered fixtures, in the
 * same order, from the same feed, so it refreshes when the board does and never
 * fetches on its own. Nothing is rendered while it is closed.
 *
 * A native modal `<dialog>` supplies what a full-screen layer needs: focus stays
 * inside it, Escape closes it, the page behind is inert, and focus returns to
 * the launcher. Where `showModal` is not available the launcher does nothing
 * rather than open a layer that cannot be left.
 *
 * The close handler checks the element before trusting the event: an effect
 * that is torn down and set up again closes and reopens the dialog, and the
 * first close must not be read as the reader leaving.
 */
export default function SportsMatchday({ events, returnTo, now, feedLabel, refreshing = false }: {
  events: readonly SportsEvent[];
  returnTo?: string;
  now?: number;
  /** The board's own feed badge: "Live feeds", "Partial feeds" or "Sample board". */
  feedLabel: string;
  refreshing?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const titleId = useId();
  const descriptionId = useId();
  const back = safeSportsReturnPath(returnTo);
  const { pageCount, current, rows } = matchdayPage(events, page);

  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    if (!element.open) element.showModal();
    // The page behind must not scroll under a layer that covers it.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (element.open) element.close();
    };
  }, [open]);

  const launch = () => {
    if (typeof dialog.current?.showModal !== 'function') return;
    setPage(0);
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={launch} aria-haspopup="dialog" title="Fill the window with big scores"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
        <Expand aria-hidden="true" className="h-4 w-4" />Matchday
      </button>
      <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onClose={() => { if (!dialog.current?.open) setOpen(false); }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[#f8fafc] p-0 text-gray-900 backdrop:bg-black/60 dark:bg-[#0f172a]">
        {open && (
          <div className="flex h-full min-h-0 flex-col">
            <header className="shrink-0 border-b border-gray-200 px-4 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <h2 id={titleId} className="text-xl font-black sm:text-2xl">Matchday board</h2>
                <button type="button" onClick={() => setOpen(false)} className={`${CONTROL} inline-flex shrink-0 items-center gap-2`}>
                  <X aria-hidden="true" className="h-4 w-4" />Exit matchday
                </button>
              </div>
              <p id={descriptionId} className="mt-1 text-xs text-gray-500">
                Big scores, less clutter. The same fixtures and filters as the board, updated with it. Escape returns to the board.
              </p>
              <p className="mt-1 text-xs font-semibold text-gray-600">
                {feedLabel}{refreshing ? ' · refreshing…' : ''}
              </p>
            </header>

            <div role="region" aria-label="Matchday scores" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:p-6">
              {rows.length ? (
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {rows.map((event) => <MatchdayCard key={event.id} event={event} returnTo={back} now={now} />)}
                </ul>
              ) : (
                <div className="mx-auto max-w-md rounded-xl border border-dashed border-gray-300 p-8 text-center">
                  <h3 className="text-lg font-semibold">{refreshing ? 'Loading scores…' : 'No matches in this view'}</h3>
                  <p className="mt-2 text-sm text-gray-500">Exit matchday mode to change the filters.</p>
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:px-6">
              <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className={CONTROL}>Previous</button>
              <p role="status" className="text-center text-xs tabular-nums text-gray-500">
                Page {current + 1} of {pageCount} · {events.length} {events.length === 1 ? 'match' : 'matches'}
              </p>
              <button type="button" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)} className={CONTROL}>Next</button>
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}
