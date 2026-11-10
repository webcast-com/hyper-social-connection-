'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { portraitFor } from '@/lib/player-portraits';
import type { SportsTopScorerBoard, SportsTopScorerRow } from '@/lib/sports-top-scorers';
import type { SportsLeaderSport } from '@/lib/espn-leaders';

/**
 * Top scorers on the discovery page.
 *
 * The rows deliberately reuse the discovery page's own "Suggested for You"
 * layout - circular headshot, bold name, one info line, and a View pill - so a
 * player reads like a person you can follow rather than a foreign scoreboard.
 * The info line carries the team and the competition, and the headshot falls
 * back to the player's initials exactly like a user without an avatar.
 */

function ScorerRow({
  player,
  rank,
  sport,
  competition,
}: {
  player: SportsTopScorerRow;
  rank: number;
  sport: SportsLeaderSport;
  competition: string;
}) {
  // Which image failed, not whether the row is broken: when the ESPN headshot
  // arrives later the derived flag clears itself, with no effect to re-run.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const photo = player.headshot ?? portraitFor(sport, player.name);
  const broken = failedSource === photo;
  const info = [player.team !== '—' ? player.team : player.teamAbbr, player.metric, player.value]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={`/nfl-basketball/${sport === 'football' ? 'nfl' : 'basketball'}/player/${player.key}`}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded-lg border border-gray-100 dark:border-gray-700 transition-colors"
    >
      <div className="flex items-center space-x-3 min-w-0">
        {photo && !broken ? (
          <img
            src={photo}
            alt={player.name}
            className="w-12 h-12 rounded-full object-cover shrink-0"
            loading="lazy"
            onError={() => setFailedSource(photo)}
          />
        ) : (
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
            {player.initials || player.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <div className="font-bold truncate text-gray-900 dark:text-white">
            {player.name}
            <span className="ml-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500">#{rank}</span>
            {/* The competition rides along in the name line so the info line
                below stays free for the team and the reported value. */}
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {competition}
            </span>
          </div>
          {/* One info line: team, statistic and the reported value. */}
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{info}</div>
        </div>
      </div>
      <span className="text-blue-600 dark:text-blue-400 text-xs sm:text-sm font-semibold shrink-0 bg-blue-50 dark:bg-blue-900/30 sm:bg-transparent sm:dark:bg-transparent px-2.5 py-1 sm:p-0 rounded-full">View</span>
    </Link>
  );
}

const SPORT_TABS: { id: SportsLeaderSport; label: string; competition: string }[] = [
  { id: 'basketball', label: 'Basketball', competition: 'NBA' },
  { id: 'football', label: 'NFL', competition: 'NFL' },
];

export default function DiscoveryTopScorers({ boards }: { boards: Record<SportsLeaderSport, SportsTopScorerBoard> }) {
  const [sport, setSport] = useState<SportsLeaderSport>('basketball');
  const board = boards[sport] ?? boards.basketball;
  const tab = SPORT_TABS.find((entry) => entry.id === sport)!;
  const rows = board.groups.flatMap((group) => group.entries);
  const seen = new Set<string>();
  const players = rows.filter((player) => (seen.has(player.key) ? false : (seen.add(player.key), true)));

  if (!players.length) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-bold text-lg flex items-center gap-2 text-gray-900 dark:text-white">
          <Trophy className="text-amber-500" /> Top scorers
        </h3>
        <div role="group" aria-label="Top scorers sport" className="flex shrink-0 gap-1.5">
          {SPORT_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={sport === entry.id}
              onClick={() => setSport(entry.id)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-bold transition-colors ${
                sport === entry.id
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-blue-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/60'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {board.status === 'live'
          ? `${tab.competition} season leaders from ESPN.`
          : `${tab.competition} leaders board · sample values while ESPN is unreachable.`}
      </p>

      <div className="space-y-3">
        {players.map((player, index) => (
          <ScorerRow key={`${player.key}-${index}`} player={player} rank={index + 1} sport={sport} competition={tab.competition} />
        ))}
      </div>

      <Link
        href={`/nfl-basketball/${sport === 'football' ? 'nfl' : 'basketball'}/top-scorers`}
        className="mt-4 inline-flex min-h-11 items-center text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
      >
        All {tab.label} top scorers →
      </Link>
    </div>
  );
}
