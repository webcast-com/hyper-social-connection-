'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portraitFor } from '@/lib/player-portraits';
import type { SportsLeaderBoard, SportsLeaderRow, SportsLeaderSport } from '@/lib/espn-leaders';

/**
 * Player cards for the homepage leaders board.
 *
 * The markup and class names are the dashboard's player card
 * (`vendor/nfl-nba/src/components/PlayerDetails.jsx`) so a card looks the same
 * on both surfaces. The dashboard is a client-side SPA, so this copy keeps the
 * same image chain: ESPN headshot, the sport's bundled portrait, then initials
 * only if the image also fails.
 */

/** Same short labels the dashboard's player card uses. */
const metricShort = (metric = '') => {
  const value = metric.toLowerCase();
  if (value.includes('point')) return 'PTS';
  if (value.includes('rebound')) return 'REB';
  if (value.includes('assist')) return 'AST';
  if (value.includes('block')) return 'BLK';
  if (value.includes('steal')) return 'STL';
  if (value.includes('passing')) return 'PASS';
  if (value.includes('rushing')) return 'RUSH';
  if (value.includes('receiving')) return 'REC';
  if (value.includes('sack')) return 'SACK';
  return metric.split(/\s+/)[0]?.slice(0, 4).toUpperCase() || 'STAT';
};

const teamHue = (value = '') => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) % 360;
  return hash;
};

function PlayerCard({ player, rank, sport }: { player: SportsLeaderRow; rank: number; sport: SportsLeaderSport }) {
  // Which image failed, not whether the card is broken: when the ESPN headshot
  // arrives later the derived flag clears itself, with no effect to re-run.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const hue = teamHue(player.team || player.name);
  const photo = player.headshot ?? portraitFor(sport, player.name);
  const broken = failedSource === photo;

  return (
    <article className="sh-player">
      <div className="sh-player-art" style={{ '--player-hue': hue } as React.CSSProperties}>
        {player.teamLogo ? <img className="sh-player-team" src={player.teamLogo} alt="" loading="lazy" /> : null}

        {photo && !broken ? (
          <img className="sh-player-photo" src={photo} alt={player.name} loading="lazy" onError={() => setFailedSource(photo)} />
        ) : (
          <div className="sh-player-mono" aria-hidden="true">{player.initials}</div>
        )}

        <span className="sh-player-grad" />

        <span className="sh-player-rating">
          <b>{String(rank).padStart(2, '0')}</b>
          <i>RANK</i>
        </span>

        <div className="sh-player-info">
          <div className="sh-player-name">{player.name}</div>
          <div className="sh-player-pos">
            {player.position ?? '—'}
            {player.teamAbbr ? ` · ${player.teamAbbr}` : ''}
          </div>
        </div>
      </div>

      <div className="sh-player-stats">
        <div>
          <b>{player.teamAbbr ?? '—'}</b>
          <i>Team</i>
        </div>
        <div>
          <b>{metricShort(player.metric)}</b>
          <i>Stat</i>
        </div>
        <div>
          <b>{player.value}</b>
          <i>Avg</i>
        </div>
        <div>
          <b>{String(rank).padStart(2, '0')}</b>
          <i>Rank</i>
        </div>
      </div>
    </article>
  );
}

const SPORT_TABS: { id: SportsLeaderSport; label: string; hub: string }[] = [
  { id: 'basketball', label: 'Basketball', hub: '/nfl-basketball/basketball' },
  { id: 'football', label: 'NFL', hub: '/nfl-basketball/nfl' },
];

export default function SportsLeadersBoard({ boards }: { boards: Record<SportsLeaderSport, SportsLeaderBoard> }) {
  const [sport, setSport] = useState<SportsLeaderSport>('basketball');
  const board = boards[sport] ?? boards.basketball;
  const tab = SPORT_TABS.find((entry) => entry.id === sport)!;

  if (!board.rows.length) return null;

  return (
    // aria-label rather than aria-labelledby: the board renders twice on the
    // homepage (mobile column and desktop rail), and an id would be duplicated.
    <section aria-label="Players & top scorers" className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm dark:border-gray-700/60 dark:bg-gray-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white">
            <span aria-hidden="true" className="text-amber-500">🏀</span> Players &amp; top scorers
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {board.status === 'live' ? `${board.league.toUpperCase()} season leaders from ESPN` : `${board.league.toUpperCase()} leaders board · sample values`}
          </p>
        </div>
        <div role="group" aria-label="Leaders sport" className="flex shrink-0 gap-1.5">
          {SPORT_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={sport === entry.id}
              onClick={() => setSport(entry.id)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-xs font-bold transition-colors ${
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

      <div className="sh-players">
        {board.rows.map((player, index) => (
          <Link
            key={`${player.key}-${index}`}
            href={`${tab.hub}/player/${player.key}`}
            className="sh-player-link"
            aria-label={`Player profile: ${player.name}`}
          >
            <PlayerCard player={player} rank={index + 1} sport={sport} />
          </Link>
        ))}
      </div>

      {/* The rest of the sports experience lives on /sports; the homepage keeps a
          direct route to the football board and the predictions that used to be
          the only sports content in the feed. */}
      <nav aria-label="More sports on Hyper" className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={tab.hub} className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-gray-700/60">
          {tab.label} dashboard
        </Link>
        <Link href="/sports?sport=football" className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-gray-600 hover:bg-blue-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/60">
          Football scores
        </Link>
        <Link href="/sports/predictions" className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-gray-600 hover:bg-blue-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/60">
          Predictions
        </Link>
        <Link href="/sports" className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-gray-600 hover:bg-blue-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/60">
          All sports
        </Link>
      </nav>
    </section>
  );
}
