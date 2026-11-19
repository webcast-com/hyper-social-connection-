'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

const subscribe = () => () => {};
const canObserve = () => typeof IntersectionObserver !== 'undefined';

/**
 * The end of an endless list: when the reader scrolls near it, ask for more.
 *
 * It sits after the last card and calls `onReach` once it comes within `margin`
 * pixels of the window, so the next cards are in place before the reader gets
 * to them and nobody has to press anything.
 *
 * An observer only reports a *change*. If more cards arrive and this element is
 * still in range afterwards (the batch was short, or it was added above), there
 * would be no second report and the list would stall with room to spare. So the
 * observer is rebuilt whenever `watch` or `enabled` changes, and a new observer
 * always reports where its target is right now.
 *
 * `enabled` is how a caller pauses it: while a request is in flight, or after
 * one failed, so a failing request is not retried in a loop.
 *
 * A browser with no IntersectionObserver gets a plain button instead, because a
 * list whose rest cannot be reached is worse than one with a button.
 */
export default function InfiniteSentinel({
  onReach,
  watch,
  enabled = true,
  margin = 800,
  fallbackLabel = 'Show more',
  className = '',
  children,
}: {
  onReach: () => void;
  /** Changes whenever the list grows: how many cards are on screen. */
  watch: string | number;
  enabled?: boolean;
  /** How far below the window, in pixels, counts as "near". */
  margin?: number;
  /** The button's label where the browser cannot observe scrolling. */
  fallbackLabel?: string;
  className?: string;
  /** What a reader who outruns the loading sees: "Loading more…". */
  children?: ReactNode;
}) {
  const node = useRef<HTMLDivElement>(null);
  const reach = useRef(onReach);
  useEffect(() => { reach.current = onReach; });
  // The server cannot know, and assumes the common case, so the button is never
  // in the HTML a capable browser receives.
  const automatic = useSyncExternalStore(subscribe, canObserve, () => true);

  useEffect(() => {
    const el = node.current;
    if (!enabled || !automatic || !el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) reach.current();
    }, { rootMargin: `0px 0px ${margin}px 0px` });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, automatic, watch, margin]);

  return (
    <div ref={node} data-infinite-sentinel="" className={`min-h-px min-w-0 ${className}`}>
      {automatic ? children : (
        <button
          type="button"
          onClick={() => reach.current()}
          disabled={!enabled}
          className="min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-blue-600 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-gray-700/60"
        >
          {fallbackLabel}
        </button>
      )}
    </div>
  );
}
