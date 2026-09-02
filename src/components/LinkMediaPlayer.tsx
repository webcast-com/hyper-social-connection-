'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Music, Play, X } from 'lucide-react';
import { resolveLinkMedia, type LinkMedia } from '@/lib/link-media';

/**
 * Plays a pasted link inline — native <video>/<audio>/<img> for direct media
 * files, and the provider's own embed (YouTube, Vimeo, SoundCloud, Spotify,
 * TikTok, Twitch, …) inside a sandboxed iframe for everything else.
 *
 * Third-party iframes stay behind a click-to-play facade so the feed doesn't
 * load a dozen trackers on scroll, and every player keeps an "open original"
 * link so the existing behaviour is always one click away.
 */
export default function LinkMediaPlayer({
  url,
  media,
  onRemove,
}: {
  url: string;
  media?: LinkMedia | null;
  onRemove?: () => void;
}) {
  const resolved = useMemo(() => media ?? resolveLinkMedia(url), [media, url]);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  // Twitch needs the embedding page's hostname; only known at runtime.
  const src = useMemo(() => {
    if (!resolved) return '';
    if (!resolved.src.includes('%%PARENT%%')) return resolved.src;
    const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return resolved.src.replace('%%PARENT%%', encodeURIComponent(parent));
  }, [resolved]);

  if (!resolved || failed) return null;

  const aspectClass =
    resolved.aspect === 'square'
      ? 'aspect-square max-w-sm'
      : resolved.aspect === 'audio'
        ? ''
        : 'aspect-video';

  return (
    <div className="relative my-3 group/media">
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 z-20 p-1 bg-black/60 hover:bg-black text-white rounded-full transition-colors"
          aria-label="Remove media preview"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700/80 bg-black">
        {/* ── Direct video file ─────────────────────────────────────────── */}
        {resolved.kind === 'video' && (
          <video
            src={src}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[520px] bg-black"
            onError={() => setFailed(true)}
          />
        )}

        {/* ── Direct image file ─────────────────────────────────────────── */}
        {resolved.kind === 'image' && (
          <img
            src={src}
            alt="Linked media"
            loading="lazy"
            className="w-full object-contain max-h-[520px] bg-gray-900/5 dark:bg-black/40"
            onError={() => setFailed(true)}
          />
        )}

        {/* ── Direct audio file ─────────────────────────────────────────── */}
        {resolved.kind === 'audio' && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4">
            <div className="flex items-center gap-2 text-white/90 text-xs font-semibold mb-2">
              <Music className="w-4 h-4" />
              <span className="truncate">{resolved.provider}</span>
            </div>
            <audio
              src={src}
              controls
              preload="metadata"
              className="w-full"
              onError={() => setFailed(true)}
            />
          </div>
        )}

        {/* ── Third-party embed: click-to-play facade, then the iframe ──── */}
        {resolved.kind === 'iframe' && (
          <div className={`relative w-full ${aspectClass} bg-black`}>
            {playing ? (
              <iframe
                src={src}
                title={`${resolved.provider} player`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                className={resolved.aspect === 'audio' ? 'w-full h-[166px]' : 'absolute inset-0 w-full h-full'}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className={`group/play relative w-full ${
                  resolved.aspect === 'audio' ? 'h-[120px]' : 'h-full'
                } flex items-center justify-center bg-black`}
                aria-label={`Play this ${resolved.provider} media`}
              >
                {resolved.thumbnail ? (
                  <img
                    src={resolved.thumbnail}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover/play:opacity-60 transition-opacity"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
                )}

                <span className="relative flex items-center justify-center w-16 h-16 rounded-full bg-white/95 text-gray-900 shadow-xl group-hover/play:scale-110 transition-transform">
                  <Play className="w-7 h-7 ml-1 fill-current" />
                </span>

                <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-[11px] font-semibold">
                  {resolved.provider}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer: provider + escape hatch to the original link */}
      <div className="flex items-center gap-2 px-1 pt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="font-medium truncate">{resolved.provider}</span>
        <a
          href={resolved.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
        >
          Open original <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
