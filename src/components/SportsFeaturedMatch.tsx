'use client';

import Link from 'next/link';
import { eventMatchHref } from '@/lib/espn-match';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import SportsMatchFace, { MATCH_CARD, MATCH_FRAME } from './SportsMatchFace';
import type { SportsEvent } from '@/lib/sports';

/**
 * The board's featured match: the live fixture `pickFeaturedEvent` chose, drawn
 * above the competitions — crests either side of a display-size scoreline, the
 * provider's clock, and a progress bar when that clock is a football minute.
 *
 * It wears the same face as every card on the board (`SportsMatchFace`), with
 * "Featured" in its pill. The whole card is one link to the match page when ESPN
 * gave the fixture an id, and plain text when it did not.
 *
 * It is a labelled section and not an `article`: the fixture is still listed in
 * its competition below, so the featured card is a second view of one of the
 * board's cards, never an extra fixture.
 */
export default function SportsFeaturedMatch({ event, returnTo }: { event: SportsEvent; returnTo?: string }) {
  const back = safeSportsReturnPath(returnTo);
  const href = event.source === 'espn' && event.details
    ? `${eventMatchHref(event)}${back === '/sports' ? '' : `?returnTo=${encodeURIComponent(back)}`}` : undefined;
  const spoken = `Featured live match: ${event.away.name} ${event.away.score ?? 'not reported'}, ${event.home.name} ${event.home.score ?? 'not reported'}, ${event.leagueName}${event.detail ? `, ${event.detail}` : ''}`;
  const face = <SportsMatchFace event={event} tone="featured" linked={!!href} />;

  return (
    <section aria-label="Featured match" data-featured-match={event.id} className={`mb-4 ${MATCH_CARD}`}>
      {href ? (
        <Link href={href} prefetch={false} aria-label={`${spoken}. Open match details`}
          className={`block ${MATCH_FRAME} transition-colors hover:border-blue-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:hover:border-blue-700`}>
          {face}
        </Link>
      ) : (
        <div role="group" aria-label={spoken} className={MATCH_FRAME}>{face}</div>
      )}
    </section>
  );
}
