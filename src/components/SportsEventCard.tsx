'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { matchHref } from '@/lib/espn-match';
import SportsRaceSummary from './SportsRaceSummary';
import type { SportsEvent } from '@/lib/sports';

function formatKickoff(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TeamLogo({ team }: { team: SportsEvent['home'] }) {
  return team.logo ? (
    <img src={team.logo} alt="" className="mx-auto w-8 h-8 object-contain shrink-0" />
  ) : (
    <span className="mx-auto w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
      {(team.short || team.name).slice(0, 3).toUpperCase()}
    </span>
  );
}

function MatchTarget({ href, label, children }: { href?: string; label: string; children: ReactNode }) {
  return href ? <Link href={href} prefetch={false} aria-label={label} className="block rounded-xl transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:hover:bg-blue-950/40">{children}</Link> : <div>{children}</div>;
}

export default function SportsEventCard({ event, compact = false, returnTo }: { event: SportsEvent; compact?: boolean; returnTo?: string }) {
  const back = safeSportsReturnPath(returnTo);
  const href = event.source === 'espn' && event.sport !== 'motorsport' && !event.race && event.details
    ? `${matchHref(event.details)}${back === '/sports' ? '' : `?returnTo=${encodeURIComponent(back)}`}` : undefined;
  const showScore = event.status !== 'upcoming';
  const shareLine = event.race ? `${event.race.title} — ${event.leagueName}` :
    event.status === 'upcoming'
      ? `${event.away.name} vs ${event.home.name} — ${event.leagueName}`
      : `${event.away.name} ${event.away.score ?? ''}–${event.home.score ?? ''} ${event.home.name} (${event.detail || event.status})`;

  return (
    <article className="min-w-0 h-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/60 p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2.5">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide min-w-0 break-words">
          {event.leagueName}
        </span>
        {event.source === 'demo' ? (
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Sample fixture</span>
        ) : event.status === 'live' ? (
          <span className="inline-flex flex-wrap items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE{event.detail ? ` · ${event.detail}` : ''}
          </span>
        ) : (
          <span className="min-w-0 break-words text-[11px] font-medium text-gray-500 dark:text-gray-400">
            {event.status === 'final' ? event.detail || 'FT' : formatKickoff(event.startAt)}
          </span>
        )}
      </div>

      <MatchTarget href={href} label={`Open ${event.away.name}${showScore ? ` (${event.away.score ?? 'not reported'})` : ''} vs ${event.home.name}${showScore ? ` (${event.home.score ?? 'not reported'})` : ''} match details`}>
      {event.race ? <SportsRaceSummary race={event.race} /> : compact ? <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0 space-y-2">{[event.away, event.home].map((team, index) => <div key={index} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><span className="shrink-0"><TeamLogo team={team} /></span><span className="min-w-0 break-words">{team.name}</span></div>)}</div>
        <span aria-label={showScore ? `${event.away.name}: ${event.away.score ?? 'not reported'}; ${event.home.name}: ${event.home.score ?? 'not reported'}` : 'Scheduled match'} className="min-w-20 shrink-0 whitespace-nowrap rounded-xl bg-gray-50 px-2 py-3 text-center text-lg font-black tabular-nums text-gray-900 dark:bg-gray-900 dark:text-white">{showScore ? `${event.away.score ?? '–'}–${event.home.score ?? '–'}` : 'VS'}</span>
      </div> : <div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <TeamLogo team={event.away} />
          <span className={showScore
            ? 'shrink-0 whitespace-nowrap font-display font-extrabold text-lg tabular-nums text-gray-900 dark:text-white'
            : 'shrink-0 text-[10px] font-bold text-gray-400'}>
            {showScore ? `${event.away.score ?? '–'}–${event.home.score ?? '–'}` : 'VS'}
          </span>
          <TeamLogo team={event.home} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-center text-xs font-semibold text-gray-900 sm:text-sm dark:text-white">
          <span title={event.away.name} className="min-w-0 break-words">{event.away.name}</span>
          <span title={event.home.name} className="min-w-0 break-words">{event.home.name}</span>
        </div>
      </div>}

      </MatchTarget>

      {href && <Link href={href} prefetch={false} className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">View match details</Link>}

      {(event.venue || event.status === 'upcoming') && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-gray-400">
          <span className="truncate">{event.venue || 'Venue TBC'}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(`${shareLine} #HyperSports`)}
            className="min-h-11 shrink-0 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Copy to post
          </button>
        </div>
      )}
    </article>
  );
}
