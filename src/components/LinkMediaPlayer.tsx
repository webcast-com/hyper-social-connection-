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
      ? 'aspect-square w-full max-w-sm mx-auto'
      : resolved.aspect === 'audio'
        ? 'w-full'
        : 'aspect-video w-full';

  return (
    <div className="relative my-3 group/media w-full min-w-0 max-w-full">
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 z-20 p-1.5 bg-black/60 hover:bg-black text-white rounded-full transition-colors"
          aria-label="Remove media preview"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700/80 bg-black w-full min-w-0">
        {/* ── Direct video file ─────────────────────────────────────────── */}
        {resolved.kind === 'video' && (
          <video
            src={src}
            controls
            playsInline
            preload="metadata"
            className="block w-full max-h-[min(70vh,520px)] object-contain bg-black"
            onError={() => setFailed(true)}
          />
        )}

        {/* ── Direct image file ─────────────────────────────────────────── */}
        {resolved.kind === 'image' && (
          <img
            src={src}
            alt="Linked media"
            loading="lazy"
            className="block w-full object-contain max-h-[min(70vh,520px)] bg-gray-900/5 dark:bg-black/40"
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
          <div className={`relative min-w-0 ${aspectClass} bg-black`}>
            {playing ? (
              <iframe
                src={src}
                title={`${resolved.provider} player`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                className={
                  resolved.aspect === 'audio'
                    ? 'block w-full h-[152px] sm:h-[166px] border-0'
                    : 'absolute inset-0 w-full h-full border-0'
                }
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className={`group/play relative w-full min-w-0 ${
                  resolved.aspect === 'audio' ? 'h-[104px] sm:h-[120px]' : 'h-full min-h-[160px] sm:min-h-0'
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

                <span className="relative flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/95 text-gray-900 shadow-xl group-hover/play:scale-110 transition-transform">
                  <Play className="w-5 h-5 sm:w-7 sm:h-7 ml-0.5 fill-current" />
                </span>

                <span className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 max-w-[calc(100%-1rem)] truncate px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-[10px] sm:text-[11px] font-semibold">
                  {resolved.provider}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer: provider + escape hatch to the original link */}
      <div className="flex items-center gap-2 px-1 pt-1.5 text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
        <span className="font-medium truncate min-w-0">{resolved.provider}</span>
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
