'use client';

import { Children, isValidElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A list of post cards that is a column on a phone and one row on a desktop.
 *
 * The homepage boards (players & top scorers, match highlights) are lists of
 * full post cards. Stacked in the desktop feed column they pushed the feed
 * thousands of pixels down the page; laid side by side they take the height of
 * one card. Below `lg` nothing changes: `layout="row"` is the same stack a
 * `layout="stack"` list is, so a phone renders exactly what it did before.
 *
 * On a desktop the row scrolls sideways. A mouse has no sideways wheel, so the
 * row carries its own previous / next buttons, each shown only while there is
 * something in that direction. Trackpads, touch and the keyboard (focus moves
 * through the cards and the row follows) work without them.
 */
export default function CardRow({ layout = 'stack', label, phoneLimit, children }: {
  layout?: 'stack' | 'row';
  /** What the row holds, for the button names: "match highlights". */
  label: string;
  /**
   * In a row, how many cards the stacked (phone) form shows. The desktop row
   * scrolls, so it carries every card; a stack of every card would bury what is
   * under it, so the ones past this number are not displayed below `lg`.
   */
  phoneLimit?: number;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ before: false, after: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const before = el.scrollLeft > 4;
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((current) => (current.before === before && current.after === after ? current : { before, after }));
  }, []);

  useEffect(() => {
    if (layout !== 'row') return;
    const el = scroller.current;
    if (!el) return;
    measure();
    // Cards arrive and leave (a sport switch), and images load late:
    // the row's width is whatever its contents make it at the time.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    for (const child of Array.from(el.children)) observer?.observe(child);
    return () => observer?.disconnect();
  }, [layout, measure, children]);

  if (layout !== 'row') return <div className="space-y-4">{children}</div>;

  const step = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    // Most of a screenful, so the card that was cut off at the edge is the
    // first whole one after the move.
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: still ? 'auto' : 'smooth' });
  };

  const button = 'absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:flex dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700';

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={measure}
        className="flex flex-col gap-4 lg:flex-row lg:gap-3 lg:overflow-x-auto lg:snap-x lg:snap-proximity lg:scrollbar-hide"
      >
        {Children.toArray(children).map((child, position) => (
          // Two whole cards and the edge of a third, so the row reads as a row.
          <div
            key={isValidElement(child) && child.key != null ? child.key : position}
            className={`min-w-0 lg:flex lg:w-[calc((100%-0.75rem)/2.14)] lg:shrink-0 lg:snap-start lg:[&>*]:w-full ${phoneLimit !== undefined && position >= phoneLimit ? 'hidden' : ''}`}
          >
            {child}
          </div>
        ))}
      </div>
      {edges.before && (
        <button type="button" onClick={() => step(-1)} aria-label={`Previous ${label}`} className={`${button} left-1`}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {edges.after && (
        <button type="button" onClick={() => step(1)} aria-label={`More ${label}`} className={`${button} right-1`}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
