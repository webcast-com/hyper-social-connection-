import Link from 'next/link';
import { Trophy } from 'lucide-react';
import type { SportsBoard } from '@/lib/sports';

/** Shared homepage presentation: compact mobile summary and desktop rail. */
export default function SportsScoresWidget({ board, compact = false }: { board: SportsBoard; compact?: boolean }) {
  const limit = compact ? 2 : 3;
  const ordered = [...board.events].sort((a, b) => {
    const priority = { live: 0, upcoming: 1, final: 2 };
    return priority[a.status] - priority[b.status];
  });
  // Prefer distinct competitions, then fill from the remaining fixtures.
  const rows = ordered.filter((event, index) => ordered.findIndex((other) => other.league === event.league) === index).slice(0, limit);
  for (const event of ordered) {
    if (rows.length >= limit) break;
    if (!rows.includes(event)) rows.push(event);
  }
  if (rows.length === 0) return null;
  const sample = board.mode === 'demo';
  const hasLive = rows.some((event) => event.status === 'live' && event.source !== 'demo');

  return (
    <section aria-label="Sports scores" data-sports-summary className={compact
      ? 'min-w-0 border-t border-gray-100 px-3 py-3 dark:border-slate-800'
      : 'min-w-0 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/60'}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-gray-500 dark:text-gray-400 font-semibold text-xs uppercase tracking-wide flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          {sample ? 'Sample fixtures' : hasLive ? 'Live scores' : 'Sports scores'}
        </h3>
        <Link href="/sports" className="inline-flex min-h-11 items-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          All competitions
        </Link>
      </div>
      <div className="space-y-1">
        {rows.map((event) => (
          <Link key={event.id} href="/sports" className="block min-w-0 rounded-xl p-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
            <div className="flex min-w-0 items-start justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400 mb-1">
              <span title={event.leagueName} className="min-w-0 flex-1 break-words">{event.leagueName}</span>
              <span className="max-w-[45%] break-words text-right text-[10px] font-semibold">
                {event.source === 'demo' ? 'Sample' : event.status === 'live' ? 'LIVE' : event.status === 'final' ? 'Final' : 'Upcoming'}
              </span>
            </div>
            {event.race ? <p className="break-words text-xs font-semibold text-gray-900 dark:text-white">{event.race.title}</p> : <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center text-xs font-semibold text-gray-900 dark:text-white gap-2">
              <span title={event.away.name} className="truncate">{event.away.short || event.away.name}</span>
              <span className="tabular-nums whitespace-nowrap">
                {event.status === 'upcoming' ? 'vs' : `${event.away.score ?? '–'}–${event.home.score ?? '–'}`}
              </span>
              <span title={event.home.name} className="truncate text-right">{event.home.short || event.home.name}</span>
            </div>}
          </Link>
        ))}
      </div>
    </section>
  );
}
