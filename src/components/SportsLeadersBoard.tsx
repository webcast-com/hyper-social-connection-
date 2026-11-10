'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ThumbsUp,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Bookmark,
  BookmarkCheck,
  Copy,
  Check,
  Maximize2,
  X,
} from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import { portraitFor } from '@/lib/player-portraits';
import type { SportsLeaderBoard, SportsLeaderRow, SportsLeaderSport } from '@/lib/espn-leaders';

/**
 * Players & top scorers on the homepage, laid out as posts.
 *
 * Every player is a post card: the markup and class names are the feed's own
 * post card (`src/components/Post.tsx`), so a player reads like something in
 * the timeline rather than a foreign scoreboard. The team crest stands in for
 * the author image, the player name for the author name, the player portrait
 * uses the post media block with a readable caption inside the image, the
 * player details sit below the image, and the Like / Comment / Share row works
 * the same way it does on a post.
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
 * does not know falls back to the abbreviation circle below.
 */
const crestFor = (player: SportsLeaderRow, sport: SportsLeaderSport) =>
  player.teamLogo
  ?? (player.teamAbbr ? `https://a.espncdn.com/i/teamlogos/${sport === 'football' ? 'nfl' : 'nba'}/500/${player.teamAbbr.toLowerCase()}.png` : null);

type LocalComment = { id: string; body: string };

function LeaderPostCard({
  player,
  sport,
  league,
  sample,
}: {
  player: SportsLeaderRow;
  sport: SportsLeaderSport;
  league: string;
  sample: boolean;
}) {
  const [cheered, setCheered] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [commentValue, setCommentValue] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [copied, setCopied] = useState(false);
  // Which image failed, not whether the card is broken: when the ESPN headshot
  // arrives later the derived flag clears itself, with no effect to re-run.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [failedCrest, setFailedCrest] = useState<string | null>(null);

  const hub = hubFor(sport);
  const playerHref = `${hub}/player/${player.key}`;
  const teamHref = `${hub}/team/${slugify(player.team || player.teamAbbr || player.name)}`;
  const photo = player.headshot ?? portraitFor(sport, player.name);
  const brokenPhoto = failedSource === photo;
  const short = metricShort(player.metric);
  const crest = crestFor(player, sport);
  const brokenCrest = failedCrest === crest;

  const copyLink = async () => {
    const url = typeof window === 'undefined' ? playerHref : `${window.location.origin}${playerHref}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // The share menu also carries the link as text, so a denied clipboard is
      // not an error the reader has to act on.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addComment = () => {
    const body = commentValue.trim();
    if (!body) return;
    setComments((prev) => [...prev, { id: `${player.key}-${prev.length}-${body.length}`, body }]);
    setCommentValue('');
  };

  return (
    <article className="relative bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-100 dark:border-gray-700/60 overflow-hidden transition-all">
      {/* The card itself is clickable, exactly like a post in the feed. The
          controls below sit above it, so they keep their own behaviour. */}
      <Link href={playerHref} className="absolute inset-0 z-0" aria-label={`Player profile: ${player.name}`} />

      {/* Author header - the team crest stands in for the user image. */}
      <div className="p-4 flex items-center justify-between relative gap-2">
        <div className="flex items-center space-x-3 min-w-0">
          <Link href={teamHref} className="shrink-0 relative z-10" aria-label={`Team profile: ${player.team}`}>
            {crest && !brokenCrest ? (
              <img
                src={crest}
                alt={player.team}
                className="w-10 h-10 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                loading="lazy"
                onError={() => setFailedCrest(crest)}
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm">
                {player.teamAbbr || player.initials || player.name.charAt(0)}
              </div>
            )}
          </Link>
          <div className="min-w-0">
            <Link href={playerHref} className="relative z-10 font-bold text-gray-900 dark:text-white hover:underline text-sm truncate block">
              {player.name}
            </Link>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {player.position ?? '—'}
              {player.teamAbbr ? ` · ${player.teamAbbr}` : ''} · {player.metric}
            </div>
          </div>
        </div>

        {/* More options */}
        <div className="relative z-10 shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 transition-colors"
            aria-label="More player options"
            aria-expanded={showMenu}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 z-30 animate-fade-in">
              <button
                type="button"
                onClick={() => { setShowMenu(false); setSaved(!saved); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                {saved ? <BookmarkCheck className="w-4 h-4 text-blue-600" /> : <Bookmark className="w-4 h-4 text-gray-500" />}
                <span>{saved ? 'Remove Player' : 'Save Player'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowMenu(false); void copyLink(); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
              </button>
              <Link
                href={playerHref}
                onClick={() => setShowMenu(false)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                <Maximize2 className="w-4 h-4 text-gray-500" />
                <span>Open Player Profile</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Post text content - the player's line. */}
      <div className="px-4 pb-3 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {player.name} leads the {league.toUpperCase()} in {player.metric.toLowerCase()} with {player.value}
        {sample ? ' (sample value while ESPN is unreachable)' : ''}.
      </div>

      {/* Attached media - the post image block, with the player readable inside it. */}
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

        <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 text-xs">
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Expand</span>
        </div>
      </div>

      {/* Player details, below the image. */}
      <dl className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-700 border-b border-gray-100 dark:border-gray-700">
        <div className="px-3 py-2 text-center min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Team</dt>
          <dd className="text-sm font-bold text-gray-900 dark:text-white truncate">{player.teamAbbr || '—'}</dd>
        </div>
        <div className="px-3 py-2 text-center min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Stat</dt>
          <dd className="text-sm font-bold text-gray-900 dark:text-white truncate">{short}</dd>
        </div>
        <div className="px-3 py-2 text-center min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Value</dt>
          <dd className="text-sm font-bold text-gray-900 dark:text-white truncate">{player.value}</dd>
        </div>
      </dl>

      {/* Post metrics row */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 text-gray-500 dark:text-gray-400 text-xs border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center space-x-1.5 min-w-0">
          <div className="bg-blue-600 rounded-full p-1 shadow-sm shrink-0">
            <ThumbsUp className="w-2.5 h-2.5 text-white fill-white" />
          </div>
          <span className="font-semibold text-gray-700 dark:text-gray-300 truncate">
            {cheered ? 1 : 0} {cheered ? 'cheer' : 'cheers'}
          </span>
        </div>
        <div className="flex space-x-4 shrink-0">
          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className="hover:underline cursor-pointer font-medium"
          >
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </button>
        </div>
      </div>

      {/* Action buttons row - Like, Comment, Share and save, as on a post. */}
      <div className="relative px-2 py-1 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => setCheered(!cheered)}
          aria-label={`Like ${player.name}`}
          aria-pressed={cheered}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 font-semibold transition-colors ${
            cheered ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
          }`}
        >
          <ThumbsUp className={`w-4 h-4 ${cheered ? 'fill-current' : ''}`} />
          <span className="hidden min-[360px]:inline">Like</span>
        </button>

        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          aria-label={`Comment on ${player.name}`}
          aria-expanded={showComments}
          className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300 font-semibold transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="hidden min-[360px]:inline">Comment</span>
        </button>

        <button
          type="button"
          onClick={() => setShowShare(!showShare)}
          aria-label={`Share ${player.name}`}
          aria-expanded={showShare}
          className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300 font-semibold transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden min-[360px]:inline">Share</span>
        </button>

        <button
          type="button"
          onClick={() => setSaved(!saved)}
          title={saved ? 'Remove Player' : 'Save Player'}
          className={`px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors ${
            saved ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
          }`}
          aria-label={saved ? `Remove ${player.name} from saved players` : `Save ${player.name}`}
          aria-pressed={saved}
        >
          {saved ? <BookmarkCheck className="w-4 h-4 fill-current" /> : <Bookmark className="w-4 h-4" />}
        </button>

        {showShare && (
          <div className="absolute right-2 bottom-full mb-1 z-30 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 animate-fade-in">
            <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Share this player</p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
              <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
            </button>
            <Link
              href={playerHref}
              onClick={() => setShowShare(false)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <Maximize2 className="w-4 h-4 text-gray-500" />
              <span>Open Player Profile</span>
            </Link>
            <button
              type="button"
              onClick={() => setShowShare(false)}
              className="w-full px-4 py-2 text-left text-sm text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        )}
      </div>

      {/* Expandable comments section */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 bg-gray-50/50 dark:bg-gray-900/30">
          <div className="space-y-3 mb-3">
            {comments.map((comment) => (
              <div key={comment.id} className="flex space-x-2">
                <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 mt-1">
                  Y
                </div>
                <div className="min-w-0 flex-1">
                  <div className="bg-gray-100 dark:bg-gray-700/80 rounded-2xl px-3.5 py-2 inline-block max-w-full">
                    <div className="font-bold text-xs text-gray-900 dark:text-white">You</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200 break-words mt-0.5">{comment.body}</div>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1 ml-2">Just now</div>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">No comments on this card yet.</p>
            )}
          </div>

          <div className="flex space-x-2 items-center">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
              Y
            </div>
            <div className="flex-1 flex items-center gap-1">
              <input
                type="text"
                value={commentValue}
                onChange={(event) => setCommentValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addComment(); } }}
                placeholder="Write a comment..."
                aria-label={`Write a comment about ${player.name}`}
                className="bg-gray-100 dark:bg-gray-700 rounded-full py-2 pl-4 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={addComment}
                disabled={!commentValue.trim()}
                className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:hover:bg-transparent dark:text-blue-400 dark:hover:bg-gray-700/60"
              >
                Post
              </button>
            </div>
          </div>
          {/* Comments on a player card live in this browser only; the dashboard
              holds the real conversation. */}
          <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
            Comments stay in this browser. Open the player profile to follow the real conversation.
          </p>
        </div>
      )}

      {/* Lightbox full-screen modal */}
      {showLightbox && photo && (
        <ImageLightbox src={photo} alt={player.name} onClose={() => setShowLightbox(false)} />
      )}
    </article>
  );
}

const SPORT_TABS: { id: SportsLeaderSport; label: string }[] = [
  { id: 'basketball', label: 'Basketball' },
  { id: 'football', label: 'NFL' },
];

export default function SportsLeadersBoard({ boards }: { boards: Record<SportsLeaderSport, SportsLeaderBoard> }) {
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
        {board.rows.map((player, index) => (
          <LeaderPostCard
            key={`${player.key}-${index}`}
            player={player}
            sport={sport}
            league={board.league}
            sample={sample}
          />
        ))}
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
