'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Play } from 'lucide-react';
import SportsPostCard from './SportsPostCard';
import LinkMediaPlayer from './LinkMediaPlayer';
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
 * A clip only renders a player when ESPN published a media file. HLS needs
 * Safari, so those cards link to the ESPN clip page instead of pretending to
 * play; a clip with neither is shown as a card with a link out.
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

/** The clip as the play card's own media descriptor. */
const clipMedia = (clip: SportsHighlightClip): LinkMedia | null =>
  clip.mp4
    ? {
        kind: 'video',
        src: clip.mp4,
        provider: 'ESPN',
        thumbnail: clip.thumbnail,
        aspect: 'video',
        originalUrl: clip.page ?? clip.mp4,
      }
    : null;

function HighlightPostCard({ clip }: { clip: SportsHighlightClip }) {
  // The competition board on /sports, the same target the match details use.
  const matchHref = `/sports?league=${encodeURIComponent(clip.league)}`;
  const href = clip.page ?? matchHref;

  const media = clip.mp4 ? (
    // Above the card-wide link, so the player's own controls stay clickable.
    <div className="relative z-10">
      <LinkMediaPlayer
        url={href}
        media={clipMedia(clip)}
        poster={clip.thumbnail}
        // A board of cards must not pull a dozen streams on page load; the
        // poster carries the card until the reader presses play.
        preload="none"
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
      <Link
        href={href}
        className="absolute inset-0 z-10 flex items-center justify-center"
        aria-label={`Watch ${clip.title} on ESPN`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform group-hover:scale-105">
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        </span>
      </Link>
    </div>
  );

  return (
    <SportsPostCard
      href={href}
      authorHref={matchHref}
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
      menuLinks={[{ label: 'Open Competition', href: matchHref }]}
      footnote={clip.mp4
        ? 'Highlights are ESPN clips. Comments stay in this browser.'
        : 'This clip cannot play inline. Open it on ESPN to watch the full highlight.'}
    />
  );
}

export default function SportsHighlightsFeed({ board, limit = 4 }: { board: SportsHighlightsBoard; limit?: number }) {
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
        {clips.map((clip) => (
          <HighlightPostCard key={`${clip.eventId}-${clip.id}`} clip={clip} />
        ))}
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
