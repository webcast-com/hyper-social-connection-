'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Maximize2, Pause, Play } from 'lucide-react';

/**
 * "Latest Highlights" on the live-stream page: each clip plays where it is.
 *
 * The row keeps the size it had as a link — an 84×54 picture and a title — and
 * the picture becomes the player: pressing the row plays the clip in it,
 * pressing again pauses, and a thin bar under the picture shows how far it is.
 * A picture that small is for following along, so each row also has a
 * full-screen button; the browser's own controls appear there.
 *
 * Rules:
 *
 *   - one clip at a time: starting a clip stops the one that was playing;
 *   - nothing is fetched until the reader presses play (`preload="none"`);
 *   - a clip with no file, or whose file will not play for this reader (ESPN's
 *     renditions are restricted by region), is the link to the clip's own page
 *     that every row used to be, so it is never a dead control;
 *   - the row's state follows the video's own events, so pausing from the
 *     full-screen controls shows in the row as well.
 */
export type StreamHighlightItem = {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: string | null;
  /** The clip's own page on this site. */
  href: string;
  /** A progressive file a `<video>` can play, when ESPN published one. */
  mp4?: string | null;
};

type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/** Only an https file with no credentials is ever given to a `<video>`. */
export function playableClipFile(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span aria-hidden="true" className="sx-clips__img sx-thumb--empty" />;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="sx-clips__img" />;
}

export default function StreamHighlightClips({ items, paused = false }: {
  items: StreamHighlightItem[];
  /** True while the page's main player is playing: a clip does not talk over it. */
  paused?: boolean;
}) {
  /** The clip whose player is showing, playing or paused. */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [unplayable, setUnplayable] = useState<ReadonlySet<string>>(new Set());
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const videos = useRef(new Map<string, FullscreenVideo>());

  // The browser's controls are shown only while a clip fills the screen.
  useEffect(() => {
    const changed = () => {
      const element = document.fullscreenElement;
      const entry = [...videos.current].find(([, video]) => video === element);
      setFullscreenId(entry ? entry[0] : null);
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  // The main player started: stop the clip rather than play over the match.
  useEffect(() => {
    if (paused) videos.current.forEach((video) => { if (!video.paused) video.pause(); });
  }, [paused]);

  const fail = (id: string) => {
    setUnplayable((current) => new Set(current).add(id));
    setActiveId((current) => (current === id ? null : current));
  };

  /** Starts a clip from inside the reader's own press, so it may play with sound. */
  const start = (id: string) => {
    const video = videos.current.get(id);
    if (!video) return;
    videos.current.forEach((other, key) => { if (key !== id && !other.paused) other.pause(); });
    if (activeId !== id) { setProgress(0); setPlaying(false); }
    setActiveId(id);
    try {
      // A file the browser cannot play rejects here as well as raising `error`.
      const started = video.play() as Promise<void> | undefined;
      started?.catch?.((error: unknown) => { if ((error as { name?: string } | null)?.name === 'NotSupportedError') fail(id); });
    } catch { /* The `error` event reports it. */ }
  };

  const toggle = (id: string) => {
    const video = videos.current.get(id);
    if (video && activeId === id && !video.paused) video.pause();
    else start(id);
  };

  const fullscreen = (id: string) => {
    const video = videos.current.get(id);
    if (!video) return;
    if (video.paused) start(id);
    try {
      if (video.requestFullscreen) void video.requestFullscreen().catch(() => undefined);
      // iPhone Safari has only its own video full screen.
      else video.webkitEnterFullscreen?.();
    } catch { /* Full screen refused: the clip keeps playing in its row. */ }
  };

  return (
    <ul className="sx-clips">
      {items.map((item) => {
        const file = unplayable.has(item.id) ? null : playableClipFile(item.mp4);
        const face = (
          <>
            <span aria-hidden="true" className="sx-clips__play"><Play /></span>
            {item.duration && <span className="sx-clips__time">{item.duration}</span>}
          </>
        );
        if (!file) {
          return (
            <li key={item.id}>
              <Link href={item.href} prefetch={false} className="sx-clips__link"
                title={unplayable.has(item.id) ? 'This clip could not be played here. Open its page.' : undefined}>
                <span className="sx-clips__thumb"><Thumb src={item.thumbnail} />{face}</span>
                <span className="sx-clips__title">{item.title}</span>
              </Link>
            </li>
          );
        }
        const active = activeId === item.id;
        const on = active && playing;
        return (
          <li key={item.id} className={`sx-clips__item${active ? ' is-active' : ''}${on ? ' is-playing' : ''}`} data-clip={item.id}>
            <span className="sx-clips__thumb">
              <video
                ref={(element) => { if (element) videos.current.set(item.id, element); else videos.current.delete(item.id); }}
                src={file}
                playsInline
                preload="none"
                controls={fullscreenId === item.id}
                // Not in the tab order while it is a picture in a row: the row's button is its control.
                tabIndex={fullscreenId === item.id ? 0 : -1}
                aria-label={item.title}
                className="sx-clips__video"
                onPlay={() => { setActiveId(item.id); setPlaying(true); }}
                onPause={() => setPlaying(false)}
                onEnded={(event) => { setPlaying(false); setProgress(0); setActiveId((current) => (current === item.id ? null : current)); event.currentTarget.currentTime = 0; }}
                onTimeUpdate={(event) => {
                  const { currentTime, duration } = event.currentTarget;
                  if (Number.isFinite(duration) && duration > 0) setProgress(Math.min(1, currentTime / duration));
                }}
                onError={() => fail(item.id)}
              />
              {/* The picture covers the player until this clip is the one playing. */}
              {!active && <Thumb src={item.thumbnail} />}
              <span aria-hidden="true" className="sx-clips__play">{on ? <Pause /> : <Play />}</span>
              {item.duration && !active && <span className="sx-clips__time">{item.duration}</span>}
              {active && <span aria-hidden="true" className="sx-clips__bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span>}
            </span>
            {/* One button for the whole row: its hit area is stretched over the picture too. */}
            <button type="button" className="sx-clips__toggle" aria-pressed={on} aria-label={`${on ? 'Pause' : 'Play'} highlight: ${item.title}`} onClick={() => toggle(item.id)}>
              <span aria-hidden="true" className="sx-clips__title">{item.title}</span>
            </button>
            <button type="button" className="sx-icon-btn sx-clips__full" aria-label={`Play full screen: ${item.title}`} title="Full screen" onClick={() => fullscreen(item.id)}>
              <Maximize2 aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
