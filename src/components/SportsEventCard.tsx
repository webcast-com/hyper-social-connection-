'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { eventMatchHref } from '@/lib/espn-match';
import SportsMatchFace, { MATCH_CARD, MATCH_FRAME, matchFaceTone } from './SportsMatchFace';
import { kickoffCountdown, scoreKey, winningSide } from '@/lib/featured-match';
import type { SportsEvent } from '@/lib/sports';

/**
 * True for a moment after the scoreline changes between two refreshes, so the
 * card can draw the eye to it. A match kicking off (no score, then a score) is
 * not a change of score and does not flash.
 */
function useScoreFlash(score: string) {
  const previous = useRef(score);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const before = previous.current;
    previous.current = score;
    if (!before || !score || before === score) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(id);
  }, [score]);
  return flash;
}

/**
 * One fixture on the sports board, drawn exactly like the featured match above
 * it: the same frame, pill, crests, scoreline and footer (`SportsMatchFace`).
 * What differs is what the fixture is — the pill says Live, Final, Upcoming or
 * Sample fixture instead of Featured, a fixture that has not started shows "VS"
 * and its kickoff, and the loser of a finished match is dimmed.
 *
 * The whole card opens the match page when ESPN gave the fixture an id. "Copy to
 * post" is the one thing a card has that the featured match does not, and it
 * sits above the card's link so it stays a button of its own.
 *
 * `now` is the board's clock. With it, an upcoming fixture inside the next day
 * says how long until kickoff; without it the card shows the kickoff time alone.
 */
export default function SportsEventCard({ event, returnTo, now }: { event: SportsEvent; returnTo?: string; now?: number }) {
  const flash = useScoreFlash(scoreKey(event)) ? ' score-pop' : '';
  const winner = winningSide(event);
  const countdown = now === undefined ? null : kickoffCountdown(event, now);
  const back = safeSportsReturnPath(returnTo);
  const href = event.source === 'espn' && event.sport !== 'motorsport' && !event.race && event.details
    ? `${eventMatchHref(event)}${back === '/sports' ? '' : `?returnTo=${encodeURIComponent(back)}`}` : undefined;
  const showScore = event.status !== 'upcoming';
  const shareLine = event.race ? `${event.race.title} — ${event.leagueName}` :
    event.status === 'upcoming'
      ? `${event.away.name} vs ${event.home.name} — ${event.leagueName}`
      : `${event.away.name} ${event.away.score ?? ''}–${event.home.score ?? ''} ${event.home.name} (${event.detail || event.status})`;
  const face = (
    <SportsMatchFace event={event} tone={matchFaceTone(event)} linked={!!href} flashClass={flash}
      loser={winner ? (winner === 'home' ? 'away' : 'home') : null} countdown={countdown} />
  );

  return (
    <article className={`h-full ${MATCH_CARD}`}>
      <div className={`relative flex flex-col ${MATCH_FRAME}${href ? ' transition-colors has-[a:hover]:border-blue-300 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-blue-600 dark:has-[a:hover]:border-blue-700' : ''}`}>
        {href ? (
          // The link's own box is the card's content; its `after` covers the
          // whole frame, so the card is one target the way the featured match is.
          <Link href={href} prefetch={false}
            aria-label={`Open ${event.away.name}${showScore ? ` (${event.away.score ?? 'not reported'})` : ''} vs ${event.home.name}${showScore ? ` (${event.home.score ?? 'not reported'})` : ''} match details`}
            className="block outline-none after:absolute after:inset-0 after:rounded-2xl">
            {face}
          </Link>
        ) : <div>{face}</div>}

        {(event.venue || event.status === 'upcoming') && (
          <div className="relative z-10 -mb-2 mt-auto flex justify-center">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(`${shareLine} #HyperSports`)}
              className="min-h-11 px-3 text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Copy to post
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
