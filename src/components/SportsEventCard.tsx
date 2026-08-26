'use client';

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

function TeamSide({
  team,
  align,
  showScore,
}: {
  team: SportsEvent['home'];
  align: 'left' | 'right';
  showScore: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 min-w-0 flex-1 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      {team.logo ? (
        <img src={team.logo} alt="" className="w-8 h-8 object-contain shrink-0" />
      ) : (
        <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
          {(team.short || team.name).slice(0, 3).toUpperCase()}
        </span>
      )}
      <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
        {team.name}
      </span>
      {showScore && (
        <span className="font-display font-extrabold text-lg tabular-nums text-gray-900 dark:text-white shrink-0 w-7 text-center">
          {team.score ?? '–'}
        </span>
      )}
    </div>
  );
}

export default function SportsEventCard({ event }: { event: SportsEvent }) {
  const showScore = event.status !== 'upcoming';
  const shareLine =
    event.status === 'upcoming'
      ? `${event.away.name} vs ${event.home.name} — ${event.leagueName}`
      : `${event.away.name} ${event.away.score ?? ''}–${event.home.score ?? ''} ${event.home.name} (${event.detail || event.status})`;

  return (
    <article className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/60 p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
          {event.leagueName}
        </span>
        {event.status === 'live' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE{event.detail ? ` · ${event.detail}` : ''}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
            {event.status === 'final' ? event.detail || 'FT' : formatKickoff(event.startAt)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <TeamSide team={event.away} align="left" showScore={showScore} />
        <span className="text-[10px] font-bold text-gray-400 shrink-0">
          {event.status === 'upcoming' ? 'VS' : '–'}
        </span>
        <TeamSide team={event.home} align="right" showScore={showScore} />
      </div>

      {(event.venue || event.status === 'upcoming') && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-gray-400">
          <span className="truncate">{event.venue || 'Venue TBC'}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(`${shareLine} #HyperSports`)}
            className="shrink-0 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Copy to post
          </button>
        </div>
      )}
    </article>
  );
}
