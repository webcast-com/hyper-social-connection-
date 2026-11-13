'use client';

import { useState } from 'react';
import { BarChart2, Clock } from 'lucide-react';
import {
  broadcastLabel, leagueAccent, scoreCardClock, scoreCell,
  type ClockTone,
} from '@/lib/score-card';
import type { SportsEvent } from '@/lib/sports';

/**
 * A side's crest: the logo the provider reported, or its code on a filled crest
 * when there is no logo or the logo does not load. A broken image is not left in
 * the layout to be discovered by the reader.
 */
function TeamLogo({ src, code }: { src?: string | null; code: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || src === failed) {
    return (
      <span
        aria-hidden="true"
        data-team-crest
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-slate-500 to-slate-800 text-[11px] font-extrabold text-slate-100 ring-1 ring-inset ring-white/10 dark:from-slate-600 dark:to-slate-900"
      >
        {code}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      data-team-logo
      loading="lazy"
      onError={() => setFailed(src)}
      className="h-11 w-11 shrink-0 object-contain drop-shadow-sm"
    />
  );
}

/** One side's row: its name, and the score the provider reported or an em dash. */
function ScoreRow({ name, score }: { name: string; score: number | string }) {
  return (
    <div data-score-row className="flex items-center justify-between gap-2.5 border-t border-gray-200 py-2 text-xs dark:border-gray-700/70">
      <span title={name} className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-100">{name}</span>
      <strong className="shrink-0 text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">{score}</strong>
    </div>
  );
}

const CLOCK_TONES: Record<ClockTone, string> = {
  live: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300',
  final: 'bg-gray-100 text-gray-500 dark:bg-slate-700/60 dark:text-gray-300',
  soon: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
};

/**
 * The dashboard's match card, drawn for basketball and American football
 * fixtures in the feed: crests either side of a "V/S", the competition and the
 * clock, one row per side, and the broadcaster.
 *
 * Home is first, as it is on the dashboard this card comes from. Every label is
 * decided by `score-card.ts`, so what the card claims — a live clock, a score, a
 * broadcaster — is the provider's and never this site's invention.
 *
 * Deliberately no router and no link of its own: the feed card wraps it, so the
 * whole card is one destination and this stays mountable in tests.
 */
export default function SportsScoreCard({ event }: { event: SportsEvent }) {
  const clock = scoreCardClock(event);
  const accent = leagueAccent(event.league);

  return (
    <article
      data-score-card
      data-clock-tone={clock.tone}
      className="grid gap-2.5 rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-3.5 transition-colors hover:border-blue-200 dark:border-gray-700 dark:from-slate-800/70 dark:to-gray-800 dark:hover:border-blue-900"
    >
      <div className="flex items-center justify-center gap-4 py-1">
        <TeamLogo src={event.home.logo} code={event.home.short?.trim() || '—'} />
        <span aria-hidden="true" className="text-[13px] font-semibold tracking-[1.5px] text-gray-400 dark:text-gray-500">V/S</span>
        <TeamLogo src={event.away.logo} code={event.away.short?.trim() || '—'} />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex max-w-[55%] min-w-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100/80 px-2.5 py-1 text-[10px] font-bold tracking-wide text-gray-700 dark:border-gray-700 dark:bg-slate-700/50 dark:text-gray-200">
          {/* No colour in the dashboard's catalog for this league means the chip's
              own accent, exactly as the dashboard card falls back. */}
          <i aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent ?? 'currentColor' }} />
          <span className="truncate">{event.leagueName}</span>
        </span>
        <span
          suppressHydrationWarning
          data-score-clock
          className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold whitespace-nowrap ${CLOCK_TONES[clock.tone]}`}
        >
          {clock.label}
        </span>
        <span aria-hidden="true" className="inline-flex shrink-0 text-gray-400 dark:text-gray-500">
          <Clock className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="grid">
        <ScoreRow name={event.home.name} score={scoreCell(event.home.score)} />
        <ScoreRow name={event.away.name} score={scoreCell(event.away.score)} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-2.5 text-[10.5px] text-gray-500 dark:border-gray-700/70 dark:text-gray-400">
        <span data-broadcast className="inline-flex min-w-0 items-center gap-1.5 font-semibold tracking-wide">
          <i
            aria-hidden="true"
            className="h-4 w-4 shrink-0 rounded-full opacity-85"
            style={{ background: 'radial-gradient(circle at 30% 30%, #a78bfa, #3b82f6)' }}
          />
          <span className="truncate">{broadcastLabel(event)}</span>
        </span>
        <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500 dark:bg-slate-700/60 dark:text-gray-300">
          <BarChart2 className="h-3.5 w-3.5" />
        </span>
      </div>
    </article>
  );
}
