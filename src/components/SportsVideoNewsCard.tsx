'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Clapperboard, ExternalLink, MessageCircle, Play, Send, Share2, X } from 'lucide-react';
import { createPost } from '@/app/actions';
import { SPORT_LABELS } from '@/lib/sports-catalog';
import type { SportsVideoNewsClip } from '@/lib/espn-video-news';

/**
 * A league video clip in the feeds section.
 *
 * Its own card and its own player, built apart from the match highlights board:
 * this one renders a clip ESPN published as league video (a goal, a recap, a
 * reaction), which has no fixture, no score and no match page behind it. It does
 * not use the highlights play card, and nothing in the highlights stack renders
 * it, so the two can change independently.
 *
 * The listing carries no media URL — ESPN's news feed reports a clip page and an
 * id, not a file — so the card shows a poster with a play button and asks
 * `/api/sports/video-news/clip` only when a reader presses play. That keeps a
 * feed of clips free of video requests nobody asked for, and it means the host
 * the media comes from is decided server-side.
 *
 * When ESPN will not serve the file to this reader (a geofenced rendition, a
 * removed clip), the player is replaced by the labelled ESPN link rather than a
 * black rectangle that does nothing. Comment and Share follow the feeds
 * section's own convention: they compose a real post through `createPost`.
 */

type PlayState = 'idle' | 'loading' | 'playing' | 'unplayable';
type Mode = 'comment' | 'share' | null;

const relativeTime = (publishedAt: string | null) => {
  if (!publishedAt) return null;
  const then = Date.parse(publishedAt);
  if (Number.isNaN(then)) return null;
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function shareText(clip: SportsVideoNewsClip, note?: string) {
  const where = clip.teams.length ? clip.teams.join(' · ') : clip.leagueName;
  return [
    `🎬 ${clip.title}`,
    `${where} · ${SPORT_LABELS[clip.sport]} video`,
    note?.trim() ? `\n${note.trim()}` : '',
    clip.page,
    '\n#Sports #Highlights #HyperSports',
  ].filter(Boolean).join('\n');
}

export default function SportsVideoNewsCard({ clip, currentUser }: { clip: SportsVideoNewsClip; currentUser?: any }) {
  const [state, setState] = useState<PlayState>('idle');
  const [source, setSource] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();

  const isSignedIn = !!currentUser?.id;
  const published = relativeTime(clip.publishedAt);

  const play = async () => {
    if (state === 'loading' || state === 'playing') return;
    setState('loading');
    try {
      const response = await fetch(`/api/sports/video-news/clip?id=${encodeURIComponent(clip.clipId)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        setState('unplayable');
        return;
      }
      const media = await response.json() as { mp4?: string | null; hls?: string | null };
      // A progressive file plays everywhere; HLS needs the browser to say so,
      // so it is only used when this one can actually play it.
      const canHls = typeof document !== 'undefined'
        && !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
      const chosen = media.mp4 || (canHls ? media.hls : null);
      if (!chosen) {
        setState('unplayable');
        return;
      }
      setSource(chosen);
      setState('playing');
    } catch {
      setState('unplayable');
    }
  };

  const submit = () => {
    if (!mode || !isSignedIn || isPending) return;
    const data = new FormData();
    data.set('content', shareText(clip, text));
    startTransition(async () => {
      await createPost(data);
      setMode(null);
      setText('');
    });
  };

  const controlClass = 'flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:text-sm dark:text-gray-300 dark:hover:bg-gray-700/60';

  return (
    <article className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow transition-all dark:border-violet-900/50 dark:bg-gray-800">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-blue-50 px-4 py-2 dark:border-violet-900/50 dark:from-violet-950/40 dark:via-slate-900 dark:to-blue-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm">
              <Clapperboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <Link href="/sports" className="block truncate text-sm font-bold text-gray-900 hover:underline dark:text-white">
                Hyper Sports
              </Link>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                {clip.leagueName} video · {SPORT_LABELS[clip.sport]}
              </div>
            </div>
          </div>
          {published && (
            <span suppressHydrationWarning className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              {published}
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* The player. A poster and a play button until a reader asks for the
            file, so a feed of clips costs no video requests on scroll. */}
        <div className="relative aspect-video w-full min-w-0 overflow-hidden rounded-2xl bg-gray-900 ring-1 ring-gray-200 dark:ring-slate-700">
          {state === 'playing' && source ? (
            <video
              src={source}
              poster={clip.thumbnail ?? undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onError={() => setState('unplayable')}
              className="h-full w-full bg-black object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={play}
              disabled={state === 'loading'}
              aria-label={`Play ${clip.title}`}
              className="group/play absolute inset-0 flex h-full w-full items-center justify-center disabled:cursor-wait"
            >
              {clip.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- provider art, sized by the card
                <img
                  src={clip.thumbnail}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover/play:opacity-100"
                />
              ) : (
                <span className="absolute inset-0 bg-gradient-to-br from-violet-600/70 to-slate-900" />
              )}
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/40 transition-transform group-hover/play:scale-105">
                {state === 'loading'
                  ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  : <Play className="h-6 w-6 translate-x-0.5 fill-current" />}
              </span>
            </button>
          )}
        </div>

        {state === 'unplayable' && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            ESPN will not serve this clip to your connection.{' '}
            <Link href={clip.page} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-bold underline hover:no-underline">
              Watch it on ESPN <ExternalLink className="h-3 w-3" />
            </Link>
          </p>
        )}

        <h3 className="mt-3 break-words text-sm font-black text-gray-900 sm:text-base dark:text-white">{clip.title}</h3>
        {clip.description && (
          <p className="mt-1 break-words text-xs text-gray-600 sm:text-sm dark:text-gray-300">{clip.description}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <Link href={`/sports?league=${encodeURIComponent(clip.league)}`} className="font-bold text-blue-600 hover:underline dark:text-blue-400">
            {clip.leagueName}
          </Link>
          {/* Team labels only when ESPN reported them: a league clip has no
              fixture, and one is never inferred from the headline. */}
          {clip.teams.map((team) => (
            <span key={team} className="min-w-0 break-words rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600 dark:bg-slate-700/70 dark:text-gray-300">
              {team}
            </span>
          ))}
          <Link
            href={clip.page}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-h-11 items-center gap-1 font-bold text-blue-600 hover:underline dark:text-blue-400"
          >
            ESPN clip page <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-gray-100 px-2 py-1 text-sm dark:border-gray-700">
        <button
          type="button"
          onClick={() => { setMode(mode === 'comment' ? null : 'comment'); setText(''); }}
          disabled={!isSignedIn}
          className={controlClass}
        >
          <MessageCircle className="h-4 w-4" />
          <span>Comment</span>
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'share' ? null : 'share'); setText(''); }}
          disabled={!isSignedIn}
          className={controlClass}
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>
      </div>

      {!isSignedIn && (
        <div className="border-t border-violet-100 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300">
          Sign in to comment on or share this clip.
        </div>
      )}

      {mode && isSignedIn && (
        <div className="border-t border-gray-100 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-slate-900/50">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-black text-gray-900 dark:text-white">
              {mode === 'comment' ? 'Comment on this clip' : 'Share this clip'}
            </h4>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              aria-label="Close clip composer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={mode === 'comment' ? 'Add your take on this clip...' : 'Say something before sharing, or leave empty to share the clip.'}
            rows={3}
            aria-label={mode === 'comment' ? 'Write a comment about this clip' : 'Add a note to your share'}
            className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {isPending ? 'Posting…' : mode === 'comment' ? 'Post comment' : 'Share clip'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
