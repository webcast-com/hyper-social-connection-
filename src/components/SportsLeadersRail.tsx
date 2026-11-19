'use client';

import Link from 'next/link';
import { useState } from 'react';
import { hubFor, leaderPlayerHref, metricShort } from './SportsLeadersBoard';
import { portraitFor } from '@/lib/player-portraits';
import type { SportsLeaderBoard, SportsLeaderRow, SportsLeaderSport } from '@/lib/espn-leaders';

/**
 * Players & top scorers for one sport, as a compact list for a homepage rail.
 *
 * The board in the feed column (`SportsLeadersBoard`) shows the same players as
 * full post cards behind a Basketball / NFL switch. A rail is a quarter of that
 * width, so here each player is one line: photo, name, team and statistic, and
 * the value ESPN reported. One sport per list, so both can be on screen at once.
 *
 * It follows the board's rules: the rows are ESPN's own, one leader per
 * statistic; nothing is invented when ESPN reports none, so there is no list;
 * and a name links by ESPN's id where the payload carried one.
 */

const SPORT_LABEL: Record<SportsLeaderSport, string> = { basketball: 'Basketball', football: 'NFL' };

function LeaderLine({ player, sport, league }: { player: SportsLeaderRow; sport: SportsLeaderSport; league: string }) {
  // Which image failed, not whether the line is broken: the same chain the post
  // card uses, ESPN headshot, then the sport's bundled portrait, then initials.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const photo = player.headshot ?? portraitFor(sport, player.name);
  const showPhoto = !!photo && failedSource !== photo;

  return (
    <li>
      <Link
        href={leaderPlayerHref(player, sport, league)}
        className="flex min-h-11 items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-700/60"
      >
        {showPhoto ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="h-9 w-9 shrink-0 rounded-full bg-gray-100 object-cover object-top dark:bg-gray-700"
            onError={() => setFailedSource(photo)}
          />
        ) : (
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-[11px] font-bold text-white">
            {player.initials || player.name.charAt(0)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-gray-900 dark:text-white">{player.name}</span>
          <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
            {player.teamAbbr || player.team || '—'} · {player.metric}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-black tabular-nums text-gray-900 dark:text-white">{player.value}</span>
          <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">{metricShort(player.metric)}</span>
        </span>
      </Link>
    </li>
  );
}

export default function SportsLeadersRail({ board, className = '' }: {
  /** One sport's board, exactly as the page read it for `SportsLeadersBoard`. */
  board: SportsLeaderBoard | undefined;
  className?: string;
}) {
  // Nothing is invented when ESPN reports no leaders: no sample list, no section.
  if (!board?.rows.length) return null;
  const label = SPORT_LABEL[board.sport];

  return (
    <section
      aria-label={`${label} players & top scorers`}
      className={`rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700/60 dark:bg-gray-800 ${className}`}
    >
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <span>Players &amp; top scorers</span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{label}</span>
      </h3>
      <p className="mt-0.5 px-1.5 text-[11px] text-gray-500 dark:text-gray-400">{board.league.toUpperCase()} season leaders from ESPN</p>
      <ul className="mt-2 space-y-0.5">
        {board.rows.map((player, index) => (
          <LeaderLine key={`${player.key}-${index}`} player={player} sport={board.sport} league={board.league} />
        ))}
      </ul>
      <Link
        href={hubFor(board.sport)}
        className="mt-1 inline-flex min-h-11 items-center px-1.5 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
      >
        {label} dashboard →
      </Link>
    </section>
  );
}
