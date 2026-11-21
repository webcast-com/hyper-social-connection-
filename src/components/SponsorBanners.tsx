'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SPONSOR_BANNERS, SPONSOR_REL, sponsorLayout, usableSponsorBanners, type SponsorBanner } from '@/lib/sponsor-banners';

/**
 * The sponsored banners (see `src/lib/sponsor-banners.ts` for the lists).
 *
 * They are advertising, so they are the last thing the page spends anything on
 * and the first thing to get out of the way:
 *
 *   - nothing is rendered on the server and nothing is requested until the slot
 *     is about to scroll into view. A visitor who never reaches it pays nothing;
 *   - a visitor who asked their browser to save data gets no banner at all;
 *   - the slot takes no room until a creative has loaded, and a creative that
 *     fails (an ad blocker, the advertiser's host being down) is removed, so
 *     there is never an empty box. With none left the block is gone;
 *   - a video plays muted, looped and inline, only while it is on screen and the
 *     tab is in front. With reduced motion it does not play: its first frame is
 *     shown, and it is still a link. A still image is simply shown;
 *   - the block says what it is: "Sponsored", and for betting, 18+.
 *
 * The creatives' sizes are not known in advance, so each tile takes the
 * proportions of its own video or image, and a pair sits side by side or
 * stacked depending on those proportions (`sponsorLayout`).
 */
type Props = {
  banners?: readonly SponsorBanner[];
  /**
   * Classes for the block: its spacing in the column, and where it applies, the
   * screen sizes it is for. A block that is `display: none` at this width never
   * comes near the viewport, so it never loads anything.
   */
  className?: string;
  /** Where the block is, for whoever reads the markup or a click report. */
  placement?: string;
  /** How far ahead of the viewport loading starts. */
  rootMargin?: string;
  /** The tallest a banner may be drawn; a taller creative is scaled down to fit. */
  maxHeight?: string;
};

type Size = { width: number; height: number };

export default function SponsorBanners({ banners = SPONSOR_BANNERS, className = '', placement = 'page', rootMargin = '600px 0px', maxHeight = '20rem' }: Props) {
  const [list] = useState(() => usableSponsorBanners(banners));
  /** `off` until mounted and allowed; `near` once the slot approaches the viewport. */
  const [stage, setStage] = useState<'off' | 'waiting' | 'near'>('off');
  const [still, setStill] = useState(false);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [failed, setFailed] = useState<readonly string[]>([]);
  const slot = useRef<HTMLDivElement | null>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const onScreen = useRef(new Set<string>());

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const motion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const frame = requestAnimationFrame(() => {
      setStill(motion?.matches ?? false);
      setStage('waiting');
    });
    const changed = (event: MediaQueryListEvent) => setStill(event.matches);
    motion?.addEventListener?.('change', changed);
    return () => {
      cancelAnimationFrame(frame);
      motion?.removeEventListener?.('change', changed);
    };
  }, []);

  // Load only when the slot is about to be seen.
  useEffect(() => {
    if (stage !== 'waiting') return;
    const node = slot.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setStage('near'));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setStage('near');
    }, { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [stage, rootMargin]);

  const sync = useCallback(() => {
    for (const [id, video] of videos.current) {
      const play = !still && onScreen.current.has(id) && document.visibilityState === 'visible';
      try {
        if (play) {
          video.muted = true;
          void video.play()?.catch(() => {});
        } else {
          video.pause();
        }
      } catch {
        // A browser that will not play it still shows the frame and the link.
      }
    }
  }, [still]);

  /** A creative reported its size: the tile can be drawn. A size of zero is a failure. */
  const measured = useCallback((id: string, width: number, height: number) => {
    if (width > 0 && height > 0) {
      setSizes((held) => (held[id]?.width === width && held[id]?.height === height ? held : { ...held, [id]: { width, height } }));
    } else {
      setFailed((held) => (held.includes(id) ? held : [...held, id]));
    }
  }, []);
  const broke = useCallback((id: string) => setFailed((held) => (held.includes(id) ? held : [...held, id])), []);

  const shown = list.filter((banner) => !failed.includes(banner.id));
  const ready = stage === 'near' && shown.some((banner) => sizes[banner.id]);
  const shownKey = shown.map((banner) => banner.id).join(',');

  // Play what is on screen, pause what is not.
  useEffect(() => {
    if (!ready) return;
    const watched = [...videos.current.entries()];
    if (typeof IntersectionObserver === 'undefined') {
      for (const [id] of watched) onScreen.current.add(id);
      sync();
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.sponsorVideo ?? '';
        if (entry.isIntersecting) onScreen.current.add(id);
        else onScreen.current.delete(id);
      }
      sync();
    }, { threshold: 0.25 });
    for (const [, video] of watched) observer?.observe(video);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      for (const [, video] of watched) {
        try {
          video.pause();
        } catch {
          // Already gone.
        }
      }
    };
  }, [ready, shownKey, sync]);

  if (list.length === 0) return null;
  if (stage === 'off') return null;
  if (shown.length === 0) return null;

  const layout = sponsorLayout(shown.map((banner) => (sizes[banner.id] ? sizes[banner.id].width / sizes[banner.id].height : NaN)));

  return (
    <aside
      ref={slot}
      aria-label="Sponsored"
      data-sponsor-banners={placement}
      data-ready={ready ? 'true' : 'false'}
      data-layout={layout}
      // Until a creative has loaded the slot has no height and no margin, and
      // nothing in it can be reached.
      inert={!ready}
      className={className || undefined}
      style={ready ? undefined : { height: 0, margin: 0, padding: 0, border: 0, overflow: 'hidden', opacity: 0 }}
    >
      {stage === 'near' && (
        <>
          <p className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5 text-[11px] font-medium leading-none text-gray-500 dark:text-gray-400">
            <span className="uppercase tracking-[0.14em]">Sponsored</span>
            <span>18+ · Gamble responsibly</span>
          </p>
          <ul className={`grid list-none items-center gap-2 p-0 sm:gap-3 ${layout === 'pair' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {shown.map((banner) => {
              const size = sizes[banner.id];
              return (
                // A creative that has not loaded yet takes no room in the grid. It
                // is taken out of the flow rather than hidden, so it still loads.
                <li key={banner.id} className="min-w-0" style={size ? undefined : { position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
                  <a
                    href={banner.href}
                    target="_blank"
                    rel={SPONSOR_REL}
                    data-sponsor-link={banner.id}
                    aria-label="Sponsored betting offer (opens in a new tab)"
                    className="mx-auto block overflow-hidden rounded-xl border border-white/10 bg-black outline-none ring-offset-2 ring-offset-transparent transition hover:border-white/25 focus-visible:ring-2 focus-visible:ring-blue-400"
                    style={size ? { aspectRatio: `${size.width} / ${size.height}`, maxHeight } : undefined}
                  >
                    {banner.video ? (
                      <video
                        ref={(node) => {
                          if (node) videos.current.set(banner.id, node);
                          else videos.current.delete(banner.id);
                        }}
                        data-sponsor-video={banner.id}
                        // `#t` asks for a frame to be drawn before anything plays.
                        src={`${banner.video}#t=0.001`}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        disablePictureInPicture
                        disableRemotePlayback
                        aria-hidden="true"
                        tabIndex={-1}
                        className="pointer-events-none block h-full w-full object-contain"
                        onLoadedMetadata={(event) => measured(banner.id, event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
                        onError={() => broke(banner.id)}
                      />
                    ) : (
                      // A still. The link is already labelled, so the picture is
                      // decoration to a screen reader. It is asked for as soon as
                      // it is rendered: the block renders it only once the slot is
                      // near the viewport, which is the lazy loading.
                      // eslint-disable-next-line @next/next/no-img-element -- the advertiser's own file, on its own host
                      <img
                        // An image the browser already holds may finish before the
                        // handler below is attached; ask it directly as well.
                        ref={(node) => { if (node?.complete && node.naturalWidth > 0) measured(banner.id, node.naturalWidth, node.naturalHeight); }}
                        data-sponsor-image={banner.id}
                        src={banner.image}
                        alt=""
                        decoding="async"
                        draggable={false}
                        className="pointer-events-none block h-full w-full object-contain"
                        onLoad={(event) => measured(banner.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                        onError={() => broke(banner.id)}
                      />
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </aside>
  );
}
