'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Play } from 'lucide-react';
import SportsPostCard from './SportsPostCard';
import LinkMediaPlayer from './LinkMediaPlayer';
import { anchorKey, anchorRef, highlightAnchorId, type SportsAnchorEngagement, type SportsAnchorEngagementMap, type SportsAnchorRef } from '@/lib/sports-anchor';
import { clipHref, clipMedia as clipMediaFor } from '@/lib/highlight-clip';
import type { LinkMedia } from '@/lib/link-media';
import type { SportsHighlightsBoard } from '@/lib/espn-highlights-feed';
import type { SportsHighlightClip } from '@/lib/espn-highlights';

/**
 * Match highlights on the homepage, laid out as posts.
 *
 * Every clip is a post card (see `SportsPostCard`): the home team's crest is
 * the author image, the fixture is the author name, the clip title is the post
 * text, and the media block is the site's own play card (`LinkMediaPlayer`)
 * with the clip's ESPN MP4 as the source and its thumbnail as the poster. The
 * details below the video carry the length, the competition and the state of
 * the match, and the Like / Comment / Share row works the same way it does on
 * a post.
 *
 * The card stays on Hyper: clicking it opens the match on this site, never
 * ESPN. ESPN is one click away behind a labelled link, and a clip whose file
 * ESPN refuses to serve (their renditions are geo-restricted per competition)
 * falls back to the thumbnail with that labelled link instead of a player that
 * silently does nothing.
 */

const mmss = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

const STATUS_LABEL: Record<SportsHighlightClip['status'], string> = {
  live: 'Live',
  final: 'Full time',
  upcoming: 'Upcoming',
};

/**
 * Where the card goes. Basketball and American football live in the dashboard
 * the rest of the site links to; everything else is the competition board.
 */
const matchHrefFor = (clip: SportsHighlightClip) => {
  if (clip.sport === 'basketball') return '/nfl-basketball/basketball';
  if (clip.sport === 'american-football') return '/nfl-basketball/nfl';
  return `/sports?league=${encodeURIComponent(clip.league)}`;
};

/** The clip as the play card's own media descriptor. One rule, shared with the
 * clip's own page, so a card and the page it links to cannot describe it differently. */
const clipMedia = clipMediaFor;

/**
 * One clip as a post card. Exported for the highlights page, which lays the same
 * cards out full-width with filters; the homepage feed below is unchanged.
 */
export function HighlightPostCard({ clip, anchor, engagement, signedIn }: {
  clip: SportsHighlightClip;
  /** Null on a sample board: placeholder clips get no post to engage with. */
  anchor: SportsAnchorRef | null;
  engagement: SportsAnchorEngagement | null;
  signedIn: boolean;
}) {
  // Always somewhere on this site, so the card never navigates the reader away.
  const cardHref = matchHrefFor(clip);
  // ESPN's own clip page, offered as a labelled link rather than a redirect.
  const espnHref = clip.page ?? cardHref;
  // A file ESPN will not serve for this reader (their renditions are
  // geo-restricted per competition) leaves the player and shows the thumbnail.
  const [unplayable, setUnplayable] = useState(false);

  const media = clip.mp4 && !unplayable ? (
    // Above the card-wide link, so the player's own controls stay clickable.
    <div className="relative z-10">
      <LinkMediaPlayer
        url={espnHref}
        media={clipMedia(clip)}
        poster={clip.thumbnail}
        // A board of cards must not pull a dozen streams on page load; the
        // poster carries the card until the reader presses play.
        preload="none"
        onError={() => setUnplayable(true)}
      />
    </div>
  ) : (
    <div className="relative z-10 group bg-gray-900/5 dark:bg-black/40 overflow-hidden">
      {clip.thumbnail ? (
        <img
          src={clip.thumbnail}
          alt={clip.title}
          className="w-full object-contain max-h-[520px] transition-transform duration-300 group-hover:scale-[1.01]"
          loading="lazy"
        />
      ) : (
        <div className="flex h-48 w-full items-center justify-center bg-gradient-to-tr from-slate-700 to-slate-900 text-sm font-bold text-white/80">
          Highlight unavailable
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3 pt-12">
        <div className="font-bold text-white text-sm truncate">{clip.title}</div>
        <div className="text-xs text-white/85 truncate">{clip.eventName}</div>
      </div>
      {clip.page && (
        <a
          href={clip.page}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-10 flex items-center justify-center"
          aria-label={`Watch ${clip.title} on ESPN`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform group-hover:scale-105">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </a>
      )}
    </div>
  );

  return (
    <SportsPostCard
      href={cardHref}
      authorHref={cardHref}
      authorImage={clip.homeLogo}
      authorName={clip.home}
      authorFallback={clip.home.slice(0, 3).toUpperCase()}
      title={clip.eventName}
      subtitle={`${clip.leagueName} · ${STATUS_LABEL[clip.status]}`}
      body={clip.description ? `${clip.title} — ${clip.description}` : clip.title}
      media={media}
      details={[
        { label: 'Length', value: mmss(clip.duration) },
        { label: 'Competition', value: clip.leagueName },
        { label: 'State', value: STATUS_LABEL[clip.status] },
      ]}
      likeLabel={`Like ${clip.title}`}
      anchor={anchor}
      engagement={engagement}
      signedIn={signedIn}
      permalink={{ href: clipHref(clip), label: 'Highlight page' }}
      menuLinks={[
        { label: 'Open Competition', href: cardHref },
        ...(clip.page ? [{ label: 'Watch on ESPN', href: clip.page }] : []),
      ]}
      footnote={clip.mp4 && !unplayable
        ? 'Highlights are ESPN clips.'
        : 'This clip cannot play here. Open it on ESPN to watch the full highlight.'}
    />
  );
}

export default function SportsHighlightsFeed({ board, limit = 4, engagement = {}, signedIn = false }: {
  board: SportsHighlightsBoard;
  limit?: number;
  /** Saved likes, threads and bookmarks per clip, loaded once by the page. */
  engagement?: SportsAnchorEngagementMap;
  /** Guests read every card; only a member can engage with one. */
  signedIn?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const clips = board.clips.slice(0, expanded ? board.clips.length : limit);
  if (!board.clips.length) return null;
  const sample = board.status !== 'live' && board.status !== 'partial';

  return (
    <section aria-label="Match highlights" className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm dark:border-gray-700/60 dark:bg-gray-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white">
            <span aria-hidden="true" className="text-rose-500">🎬</span> Match highlights
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {sample
              ? 'Sample cards · ESPN highlight videos are unreachable right now'
              : `Highlights from ${board.games} ESPN ${board.games === 1 ? 'game' : 'games'}`}
          </p>
        </div>
        <Link href="/sports" className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-gray-700/60">
          All sports
        </Link>
      </div>

      <div className="space-y-4">
        {clips.map((clip) => {
          // A sample board is placeholder data, so it gets no anchor post.
          const anchor = sample ? null : anchorRef('highlight', highlightAnchorId(clip));
          return <HighlightPostCard
            key={`${clip.eventId}-${clip.id}`}
            clip={clip}
            anchor={anchor}
            engagement={anchor ? engagement[anchorKey(anchor)] ?? null : null}
            signedIn={signedIn}
          />;
        })}
      </div>

      {board.clips.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-gray-600 hover:bg-blue-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          {expanded ? 'Show fewer highlights' : `Show all ${board.clips.length} highlights`}
        </button>
      )}
    </section>
  );
}
