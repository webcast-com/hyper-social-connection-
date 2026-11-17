/**
 * The home page's match hero: the first fixture of the match centre, drawn the
 * way the NFL & basketball dashboard draws its featured game — a photograph
 * behind the two crests, the scoreline, the clock and the broadcaster.
 *
 * What the hero claims is decided here, next to `score-card.ts`, and not in the
 * component: a fixture this site invented is labelled a sample and is never
 * called live, and the photograph behind a fixture matches its sport.
 *
 * Nothing here reads a database or a network, so the hero stays client-safe.
 */
import type { SportsEvent } from './sports';
import type { ClockTone } from './score-card';

/** The dashboard's two hero photographs, plus a crowd-only crop of the second. */
export const HERO_BACKDROPS = {
  basketball: '/sports/hero-basketball.webp',
  'american-football': '/sports/hero-football.webp',
  stadium: '/sports/hero-stadium.webp',
} as const;

/**
 * The photograph behind a fixture.
 *
 * The dashboard has one picture per sport it covers: a basketball player and an
 * American football quarterback. Every other sport — association football
 * first of all — gets the stands of that second picture without the player in
 * it, so a Premier League match is never drawn over a quarterback.
 */
export function heroBackdrop(event: Pick<SportsEvent, 'sport'>): string {
  if (event.sport === 'basketball') return HERO_BACKDROPS.basketball;
  if (event.sport === 'american-football') return HERO_BACKDROPS['american-football'];
  return HERO_BACKDROPS.stadium;
}

/** The pill in the hero's corner. Only a fixture the provider reports as in play is `live`. */
export function heroStatus(event: Pick<SportsEvent, 'source' | 'status'>): { label: string; live: boolean } {
  if (event.source === 'demo') return { label: 'Sample', live: false };
  if (event.status === 'live') return { label: 'Live', live: true };
  if (event.status === 'final') return { label: 'Final', live: false };
  return { label: 'Upcoming', live: false };
}

/**
 * The chip beside the broadcaster, in the dashboard's words: the clock and "in
 * progress", "Full time", or the kickoff. `kickoff` is null until the viewer's
 * own time zone is known, and a sample fixture says that it is one.
 */
export function heroFootnote(
  event: Pick<SportsEvent, 'source'>,
  clock: { label: string; tone: ClockTone },
  kickoff: string | null,
): string {
  if (event.source === 'demo') return 'Sample data';
  if (clock.tone === 'live') return clock.label === 'Live' ? 'In progress' : `${clock.label} · in progress`;
  if (clock.tone === 'final') return 'Full time';
  return kickoff ? `Kick-off ${kickoff}` : 'Not started';
}
