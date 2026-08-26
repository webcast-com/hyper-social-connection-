import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { getSportsBoard } from '@/lib/sports';

export default async function SportsLiveWidget() {
  const board = await getSportsBoard();
  const live = board.events.filter((e) => e.status === 'live').slice(0, 3);
  const upcoming = board.events.filter((e) => e.status === 'upcoming').slice(0, 3);
  const rows = live.length > 0 ? live : upcoming;

  if (rows.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/60">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-gray-500 dark:text-gray-400 font-semibold text-xs uppercase tracking-wide flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500" />
          {live.length > 0 ? 'Live scores' : 'Upcoming'}
        </h3>
        <Link href="/sports" className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          All sports
        </Link>
      </div>
      <div className="space-y-2.5">
        {rows.map((ev) => (
          <Link
            key={ev.id}
            href="/sports"
            className="block p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
          >
            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
              <span className="truncate">{ev.leagueName}</span>
              {ev.status === 'live' ? (
                <span className="text-red-500 font-bold">LIVE {ev.detail || ''}</span>
              ) : (
                <span>{ev.detail || 'Soon'}</span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-900 dark:text-white gap-2">
              <span className="truncate">{ev.away.short || ev.away.name}</span>
              <span className="tabular-nums shrink-0">
                {ev.status === 'upcoming' ? 'vs' : `${ev.away.score ?? 0}–${ev.home.score ?? 0}`}
              </span>
              <span className="truncate text-right">{ev.home.short || ev.home.name}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
