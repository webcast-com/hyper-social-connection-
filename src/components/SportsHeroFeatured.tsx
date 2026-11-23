'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { eventMatchHref } from '@/lib/espn-match';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import type { SportsEvent } from '@/lib/sports';

/**
 * The featured match in the hero of `/sports`, drawn as the card in the hero of
 * the ScoreHub layout (`.featured-match` in `scorehub/index.htm`): the
 * competition and a red "LIVE" with the clock across the top, a shield-shaped
 * crest either side of a large scoreline, a line of facts, a wide green bar at
 * the foot, and a row of dots under the card for the other matches in play.
 *
 * What the layout's sample card shows and this one does not: goal scorers. The
 * board's feed does not carry them, so they are not written here; the venue is
 * shown when ESPN reported one, and the match page has the rest.
 *
 * The contract the board's own featured card keeps is kept here too: a labelled
 * section and not an `article` (the fixture is still listed below), away side
 * first, an unreported score as a dash, and one link to the match page when
 * ESPN gave the fixture an id.
 *
 * @param events the matches in play that may lead the page, best first
 */
export default function SportsHeroFeatured({ events, returnTo }: { events: readonly SportsEvent[]; returnTo?: string }) {
  // The chosen match is remembered by id: when a refresh drops it from the
  // list, the card falls back to the first one instead of an empty slot.
  const [chosen, setChosen] = useState<string | null>(null);
  if (events.length === 0) return null;
  const index = Math.max(0, events.findIndex((event) => event.id === chosen));
  const event = events[index];
  const step = (by: number) => setChosen(events[(index + by + events.length) % events.length].id);

  const back = safeSportsReturnPath(returnTo);
  const href = event.source === 'espn' && event.details
    ? `${eventMatchHref(event)}${back === '/sports' ? '' : `?returnTo=${encodeURIComponent(back)}`}` : undefined;
  const spoken = `Featured live match: ${event.away.name} ${event.away.score ?? 'not reported'}, ${event.home.name} ${event.home.score ?? 'not reported'}, ${event.leagueName}${event.detail ? `, ${event.detail}` : ''}`;

  const face = (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3 text-[11px] text-[#aab7c9]">
        <span className="min-w-0 truncate">{event.leagueName}</span>
        <span className="flex shrink-0 items-center gap-1.5 font-extrabold text-[#ff4c5f]">
          <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff4058] shadow-[0_0_8px_#ff304b]" />
          LIVE
          {event.detail && <b data-featured-clock className="ml-1 text-[#00d6a0]">{event.detail}</b>}
        </span>
      </div>
      <div className="my-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-center sm:my-5">
        <Side team={event.away} />
        <div className="min-w-0 px-1">
          <strong data-featured-score className="block whitespace-nowrap text-[1.9rem] font-black leading-none tracking-wide tabular-nums sm:text-[2.2rem]">
            {`${event.away.score ?? '–'}–${event.home.score ?? '–'}`}
          </strong>
        </div>
        <Side team={event.home} />
      </div>
      <p className="mb-4 flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-[#d5deea]">
        {event.venue && <span className="min-w-0 break-words">{event.venue}</span>}
        <span className="text-[#8795a8]">Score reported by ESPN</span>
      </p>
      {href && (
        // The bar is the visible end of the card's one link, not a control of its own.
        <span aria-hidden="true" className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#29394c] bg-gradient-to-r from-[#00b989] to-[#111d2d] text-xs font-bold text-white">
          <Play className="h-3.5 w-3.5" />Live match details
        </span>
      )}
    </>
  );
  const frame = 'block rounded-[9px] border border-[#29384b] bg-gradient-to-br from-[#111d2e]/95 to-[#08121f]/95 p-4 text-[#f4f7fb] shadow-[0_15px_35px_rgba(0,0,0,0.27)]';

  return (
    <section aria-label="Featured match" data-featured-match={event.id} className="mx-auto w-full min-w-0 max-w-[470px]">
      {href ? (
        <Link href={href} prefetch={false} aria-label={`${spoken}. Open match details`}
          className={`${frame} outline-none transition-colors hover:border-[#00d6a0]/60 focus-visible:ring-2 focus-visible:ring-[#00d6a0]`}>
          {face}
        </Link>
      ) : (
        <div role="group" aria-label={spoken} className={frame}>{face}</div>
      )}
      {events.length > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="Previous live match"
            className="grid h-11 w-11 place-items-center rounded-full text-[#aab7c9] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#00d6a0]">
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <span aria-hidden="true" className="flex items-center gap-1.5">
            {events.map((entry, at) => (
              <i key={entry.id} className={`block rounded-full ${at === index ? 'h-1.5 w-1.5 bg-[#57f2d6]' : 'h-[5px] w-[5px] bg-[#5b6879]'}`} />
            ))}
          </span>
          {/* Read out when the arrows change the match. */}
          <span role="status" className="sr-only">{`Match ${index + 1} of ${events.length}`}</span>
          <button type="button" onClick={() => step(1)} aria-label="Next live match"
            className="grid h-11 w-11 place-items-center rounded-full text-[#aab7c9] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#00d6a0]">
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      )}
    </section>
  );
}

/** The layout's shield: a clipped badge holding ESPN's crest, or the side's initial. */
const SHIELD = 'polygon(12% 0,88% 0,94% 64%,50% 100%,6% 64%)';

function Side({ team }: { team: SportsEvent['home'] }) {
  const [failed, setFailed] = useState<string | null>(null);
  const logo = team.logo && team.logo !== failed ? team.logo : null;
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span data-featured-crest aria-hidden="true" style={{ clipPath: SHIELD }}
        className="grid h-[52px] w-12 shrink-0 place-items-center bg-[#182536] text-2xl font-black text-white shadow-[inset_0_0_0_3px_rgba(255,255,255,0.19)]">
        {logo
          ? <img src={logo} alt="" onError={() => setFailed(team.logo ?? null)} className="h-8 w-8 object-contain" />
          : (team.short || team.name).slice(0, 1).toUpperCase()}
      </span>
      <b title={team.name} className="w-full min-w-0 break-words text-xs font-bold leading-tight">{team.name}</b>
    </div>
  );
}
