'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';

/**
 * "Latest Highlights" on the live-stream page.
 *
 * Each row is the size it has always been — an 84×54 picture and a title — and
 * pressing it plays the clip in the page's large player, in the middle of the
 * page, instead of opening the clip's own page. The row of the clip that is in
 * the player is marked.
 *
 * A clip with no file, or whose file would not play for this reader (ESPN's
 * renditions are restricted by region), is the link to the clip's own page that
 * every row used to be, so a row is never a dead control.
 *
 * This list owns no player: the dashboard does, because the large player shows
 * one thing at a time, a match or a clip.
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

export default function StreamHighlightClips({ items, activeId = null, unplayable, onPlay }: {
  items: StreamHighlightItem[];
  /** The clip in the large player, if one is. */
  activeId?: string | null;
  /** Clips whose file would not play for this reader: shown as links again. */
  unplayable?: ReadonlySet<string>;
  onPlay: (item: StreamHighlightItem) => void;
}) {
  return (
    <ul className="sx-clips">
      {items.map((item) => {
        const failed = unplayable?.has(item.id) ?? false;
        const face = (
          <>
            <span className="sx-clips__thumb">
              <Thumb src={item.thumbnail} />
              <span aria-hidden="true" className="sx-clips__play"><Play /></span>
              {item.duration && <span className="sx-clips__time">{item.duration}</span>}
            </span>
            <span className="sx-clips__title">{item.title}</span>
          </>
        );
        if (failed || !playableClipFile(item.mp4)) {
          return (
            <li key={item.id}>
              <Link href={item.href} prefetch={false} className="sx-clips__link"
                title={failed ? 'This clip could not be played here. Open its page.' : undefined}>
                {face}
              </Link>
            </li>
          );
        }
        const active = activeId === item.id;
        return (
          <li key={item.id}>
            <button type="button" className={`sx-clips__link sx-clips__button${active ? ' is-active' : ''}`} data-clip={item.id}
              aria-current={active ? 'true' : undefined}
              aria-label={`${active ? 'Now in the player' : 'Play in the player'}: ${item.title}`}
              onClick={() => onPlay(item)}>
              {face}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
