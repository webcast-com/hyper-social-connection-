'use client';

import { useState } from 'react';
import SportsRaceSummary from './SportsRaceSummary';
import { matchProgressPercent } from '@/lib/featured-match';
import type { SportsEvent } from '@/lib/sports';

/**
 * The one face every match on the sports board wears: the featured match above
 * the competitions and each fixture's card below it are drawn by the component
 * in this file, so the two cannot drift apart.
 *
 * Sizes follow the card's own width, not the window's. The wrapper is a
 * container (`MATCH_CARD`), and the crests, scoreline and padding step up once
 * the card itself is wide enough — so a card in a two-column grid on a desktop
 * looks like the featured match does on a phone, and a full-width card looks
 * like the featured match does on a desktop.
 */
export const MATCH_CARD = '@container min-w-0';

/** The card's frame: border, tint, padding. The element that carries it decides its own display. */
export const MATCH_FRAME = 'h-full rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-3 shadow-sm @xl:p-4 dark:border-blue-900/70 dark:from-blue-950/50 dark:via-gray-800 dark:to-gray-800';

/**
 * What the card says about the fixture in its pill:
 * `featured` is the live match leading the board; the rest are the fixture's own
 * state. A sample fixture is `sample` whatever its state, and is never called live.
 */
export type MatchFaceTone = 'featured' | 'live' | 'final' | 'upcoming' | 'sample';

export function matchFaceTone(event: SportsEvent): Exclude<MatchFaceTone, 'featured'> {
  if (event.source === 'demo') return 'sample';
  return event.status;
}

const PILL: Record<MatchFaceTone, { label: string; className: string; pulse: boolean }> = {
  featured: { label: 'Featured', className: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300', pulse: true },
  live: { label: 'Live', className: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300', pulse: true },
  final: { label: 'Final', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', pulse: false },
  upcoming: { label: 'Upcoming', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300', pulse: false },
  sample: { label: 'Sample fixture', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', pulse: false },
};

function formatKickoff(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * A side's crest: the provider's logo, or the side's code when there is no logo
 * or it does not load, so a broken image is never left in the card.
 */
function Crest({ team }: { team: SportsEvent['home'] }) {
  const [failed, setFailed] = useState<string | null>(null);
  return team.logo && team.logo !== failed ? (
    <img src={team.logo} alt="" onError={() => setFailed(team.logo ?? null)} className="h-11 w-11 shrink-0 object-contain @xl:h-14 @xl:w-14" />
  ) : (
    <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gray-100 text-xs font-extrabold text-gray-500 @xl:h-14 @xl:w-14 dark:bg-gray-700 dark:text-gray-300">
      {(team.short || team.name).slice(0, 3).toUpperCase()}
    </span>
  );
}

/** `dimmed` is the losing side of a finished match; every other name keeps the card's colour. */
function Side({ team, dimmed }: { team: SportsEvent['home']; dimmed: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Crest team={team} />
      <span title={team.name} className={`w-full min-w-0 break-words text-[11px] font-bold leading-tight @xl:text-sm ${dimmed ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>{team.name}</span>
    </div>
  );
}

/** The line under the scoreline: the provider's clock, the result, or the kickoff. */
function StatusLine({ event, tone, countdown }: { event: SportsEvent; tone: MatchFaceTone; countdown?: string | null }) {
  const base = 'mt-0.5 max-w-full break-words text-center text-[10px] font-bold uppercase';
  if (tone === 'featured' || tone === 'live') {
    return <span className={`${base} text-red-600 dark:text-red-400`}>Live{event.detail ? ` · ${event.detail}` : ''}</span>;
  }
  // A sample fixture's clock and kickoff are as made up as its score: the pill
  // says what it is, and nothing here dresses it up as a real state.
  if (tone === 'sample') return null;
  if (tone === 'final') return <span className={`${base} text-gray-500 dark:text-gray-400`}>{event.detail || 'FT'}</span>;
  const kickoff = formatKickoff(event.startAt);
  if (!kickoff && !countdown) return null;
  return (
    <span className={`${base} text-gray-500 dark:text-gray-400`}>
      {kickoff}
      {countdown && <span data-kickoff-countdown className="text-blue-600 dark:text-blue-400"> · {countdown}</span>}
    </span>
  );
}

/**
 * The inside of a match card.
 *
 * Away is first, the way the board has always read; a score the provider did
 * not report is a dash, not a zero; a fixture that has not started shows "VS"
 * where the scoreline will be. The middle column is as wide as the scoreline
 * needs and no wider than 45% of the card: a long status line wraps under it
 * rather than squeezing the two sides out. A progress bar is drawn only from a football
 * minute the provider reported. A race has no two sides, so it keeps its own
 * summary under the same heading.
 *
 * @param linked     the card opens the match page, so the footer says so
 * @param flashClass set for a moment after the scoreline changes
 * @param loser      the side that lost a finished match, if one did
 * @param countdown  "in 2h 15m" for a kickoff inside the next day
 */
export default function SportsMatchFace({ event, tone, linked = false, flashClass = '', loser = null, countdown = null }: {
  event: SportsEvent;
  tone: MatchFaceTone;
  linked?: boolean;
  flashClass?: string;
  loser?: 'home' | 'away' | null;
  countdown?: string | null;
}) {
  const pill = PILL[tone];
  const featured = tone === 'featured';
  const showScore = event.status !== 'upcoming';
  const progress = tone === 'sample' ? null : matchProgressPercent(event);
  const venue = event.venue || (event.status === 'upcoming' ? 'Venue TBC' : '');

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${pill.className}`}>
          {pill.pulse && <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
          {pill.label}
        </span>
        <span className="min-w-0 break-words text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{event.leagueName}</span>
      </div>

      {event.race ? (
        <div className="mt-2 @xl:mt-3">
          <SportsRaceSummary race={event.race} />
          <p className="flex"><StatusLine event={event} tone={tone} countdown={countdown} /></p>
        </div>
      ) : (
        <div className="mx-auto mt-2 grid max-w-xl grid-cols-[minmax(0,1fr)_fit-content(45%)_minmax(0,1fr)] items-center gap-1.5 @xl:mt-3 @xl:gap-4">
          <Side team={event.away} dimmed={loser === 'away'} />
          <div className="flex min-w-14 max-w-full flex-col items-center px-1">
            <span {...(featured ? { 'data-featured-score': '' } : { 'data-match-score': '' })}
              className={`whitespace-nowrap font-display text-2xl font-black tabular-nums tracking-wide @xl:text-4xl ${showScore ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}${flashClass}`}>
              {showScore ? `${event.away.score ?? '–'}–${event.home.score ?? '–'}` : 'VS'}
            </span>
            <StatusLine event={event} tone={tone} countdown={countdown} />
            {progress !== null && (
              <span aria-hidden="true" {...(featured ? { 'data-featured-progress': '' } : { 'data-match-progress': '' })}
                className="mt-1.5 block h-1 w-full max-w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <span className="block h-full rounded-full bg-red-500" style={{ width: `${progress}%` }} />
              </span>
            )}
          </div>
          <Side team={event.home} dimmed={loser === 'home'} />
        </div>
      )}

      {(venue || linked) && (
        <p className="mt-2 flex min-w-0 flex-wrap items-center justify-center gap-x-2 text-center text-[11px] text-gray-500 @xl:mt-3 dark:text-gray-400">
          {venue && <span className="min-w-0 break-words">{venue}</span>}
          {linked && <span aria-hidden="true" className="font-bold text-blue-600 dark:text-blue-400">Match details →</span>}
        </p>
      )}
    </>
  );
}
