'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import SportsPostCard from './SportsPostCard';
import ImageLightbox from './ImageLightbox';
import { portraitFor } from '@/lib/player-portraits';
import { anchorKey, anchorRef, leaderAnchorId, type SportsAnchorEngagement, type SportsAnchorEngagementMap, type SportsAnchorRef } from '@/lib/sports-anchor';
import type { SportsLeaderBoard, SportsLeaderRow, SportsLeaderSport } from '@/lib/espn-leaders';

/**
 * Players & top scorers on the homepage, laid out as posts.
 *
 * Every player is a post card (see `SportsPostCard`): the team crest stands in
 * for the author image, the player name for the author name, the portrait uses
 * the post media block with a readable caption inside the image, the player
 * details sit below the image, and the Like / Comment / Share row works the
 * same way it does on a post.
 *
 * The ESPN headshot keeps the dashboard's image chain - headshot, the sport's
 * bundled portrait, then initials only if the image also fails.
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

const slugify = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const hubFor = (sport: SportsLeaderSport) => (sport === 'football' ? '/nfl-basketball/nfl' : '/nfl-basketball/basketball');

/**
 * The dashboard builds its crests from the ESPN CDN the same way, so a sample
 * board (which carries no logo URL) still shows the real crest. A code the CDN
 * does not know falls back to the abbreviation circle.
 */
const crestFor = (player: SportsLeaderRow, sport: SportsLeaderSport) =>
  player.teamLogo
  ?? (player.teamAbbr ? `https://a.espncdn.com/i/teamlogos/${sport === 'football' ? 'nfl' : 'nba'}/500/${player.teamAbbr.toLowerCase()}.png` : null);

function LeaderPostCard({
  player,
  sport,
  league,
  sample,
  anchor,
  engagement,
  signedIn,
}: {
  player: SportsLeaderRow;
  sport: SportsLeaderSport;
  league: string;
  sample: boolean;
  /** Null on a sample board: placeholder values get no post to engage with. */
  anchor: SportsAnchorRef | null;
  engagement: SportsAnchorEngagement | null;
  signedIn: boolean;
}) {
  // Which image failed, not whether the card is broken: when the ESPN headshot
  // arrives later the derived flag clears itself, with no effect to re-run.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [failedCrest, setFailedCrest] = useState<string | null>(null);
  const [showLightbox, setShowLightbox] = useState(false);

  const hub = hubFor(sport);
  const playerHref = `${hub}/player/${player.key}`;
  const teamHref = `${hub}/team/${slugify(player.team || player.teamAbbr || player.name)}`;
  const photo = player.headshot ?? portraitFor(sport, player.name);
  const brokenPhoto = failedSource === photo;
  const crest = crestFor(player, sport);
  const brokenCrest = failedCrest === crest;
  const short = metricShort(player.metric);

  const media = (
    <div
      className="relative z-10 group cursor-pointer bg-gray-900/5 dark:bg-black/40 overflow-hidden"
      onClick={() => photo && setShowLightbox(true)}
    >
      {photo && !brokenPhoto ? (
        <img
          src={photo}
          alt={player.name}
          className="w-full object-contain max-h-[520px] transition-transform duration-300 group-hover:scale-[1.01]"
          loading="lazy"
          onError={() => setFailedSource(photo)}
        />
      ) : (
        <div className="flex h-56 w-full items-center justify-center bg-gradient-to-tr from-blue-500 to-indigo-600 text-4xl font-bold text-white">
          {player.initials || player.name.charAt(0)}
        </div>
      )}

      {/* Caption inside the image, readable over the gradient. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3 pt-12">
        <div className="font-bold text-white text-sm truncate">{player.name}</div>
        <div className="text-xs text-white/85 truncate">
          {player.team || player.teamAbbr || '—'} · {short} {player.value}
        </div>
      </div>

      <button
        type="button"
        onClick={() => photo && setShowLightbox(true)}
        aria-label={`Expand the ${player.name} image`}
        className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center space-x-1 text-xs"
      >
        <Maximize2 className="w-3.5 h-3.5" />
        <span>Expand</span>
      </button>
    </div>
  );

  return (
    <>
    <SportsPostCard
      href={playerHref}
      authorHref={teamHref}
      authorImage={crest && !brokenCrest ? crest : null}
      authorName={player.team || player.teamAbbr || player.name}
      authorFallback={player.teamAbbr || player.initials || player.name.charAt(0)}
      title={player.name}
      subtitle={`${player.position ?? '—'}${player.teamAbbr ? ` · ${player.teamAbbr}` : ''} · ${player.metric}`}
      body={`${player.name} leads the ${league.toUpperCase()} in ${player.metric.toLowerCase()} with ${player.value}${sample ? ' (sample value while ESPN is unreachable)' : ''}.`}
      media={media}
      details={[
        { label: 'Team', value: player.teamAbbr || '—' },
        { label: 'Stat', value: short },
        { label: 'Value', value: player.value },
      ]}
      likeLabel={`Like ${player.name}`}
      anchor={anchor}
      engagement={engagement}
      signedIn={signedIn}
      onExpand={() => setShowLightbox(true)}
      menuLinks={[{ label: 'Open Player Profile', href: playerHref }]}
    />
    {showLightbox && photo && !brokenPhoto && (
      <ImageLightbox src={photo} alt={player.name} onClose={() => setShowLightbox(false)} />
    )}
    </>
  );
}

const SPORT_TABS: { id: SportsLeaderSport; label: string }[] = [
  { id: 'basketball', label: 'Basketball' },
  { id: 'football', label: 'NFL' },
];

export default function SportsLeadersBoard({ boards, engagement = {}, signedIn = false }: {
  boards: Record<SportsLeaderSport, SportsLeaderBoard>;
  /** Saved likes, threads and bookmarks per card, loaded once by the page. */
  engagement?: SportsAnchorEngagementMap;
  /** Guests read every card; only a member can engage with one. */
  signedIn?: boolean;
}) {
  const [sport, setSport] = useState<SportsLeaderSport>('basketball');
  const board = boards[sport] ?? boards.basketball;
  const tab = SPORT_TABS.find((entry) => entry.id === sport)!;
  const hub = hubFor(sport);
  const sample = board.status !== 'live';

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
            {sample
              ? `${board.league.toUpperCase()} leaders board · sample values`
              : `${board.league.toUpperCase()} season leaders from ESPN`}
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

      <div className="space-y-4">
        {board.rows.map((player, index) => {
          // A sample board is placeholder data, so it gets no anchor post: a
          // like or comment there would store a value ESPN never reported.
          const anchor = sample ? null : anchorRef('leader', leaderAnchorId(sport, player));
          return <LeaderPostCard
            key={`${player.key}-${index}`}
            player={player}
            sport={sport}
            league={board.league}
            sample={sample}
            anchor={anchor}
            engagement={anchor ? engagement[anchorKey(anchor)] ?? null : null}
            signedIn={signedIn}
          />;
        })}
      </div>

      {/* The rest of the sports experience lives on /sports; the homepage keeps a
          direct route to the football board and the predictions that used to be
          the only sports content in the feed. */}
      <nav aria-label="More sports on Hyper" className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={hub} className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-gray-700/60">
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
