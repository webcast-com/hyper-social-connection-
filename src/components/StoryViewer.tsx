'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/** How long each story stays on screen before auto-advancing. */
const STORY_DURATION_MS = 5000;

/**
 * Full-screen story preview — opens when a story card is clicked in the
 * stories row.
 *
 * Features:
 *  - Segmented progress bar across the top (one segment per story).
 *  - Auto-advances every 5s; closes after the last story.
 *  - Press-and-hold (or arrow keys) controls: hold pauses, release resumes;
 *    Esc closes; ←/→ navigate; click left third = previous, right two thirds = next.
 */
export default function StoryViewer({
  stories,
  initialIndex = 0,
  onClose,
}: {
  stories: any[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const count = stories?.length ?? 0;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0)),
  );
  const [paused, setPaused] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(STORY_DURATION_MS);
  const prevIndexRef = useRef(index);
  // Timestamp of the current press — distinguishes a tap (navigate) from a
  // press-and-hold (pause), the same way Instagram/Facebook stories behave.
  const pressStartRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i >= count - 1) {
        // Last story finished — close the viewer.
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [count, onClose]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  /** Press start (any pointer): freeze the story. */
  const handlePressStart = useCallback(() => {
    pressStartRef.current = Date.now();
    setPaused(true);
  }, []);

  /** Press end: resume from the exact moment it froze. */
  const handlePressEnd = useCallback(() => {
    setPaused(false);
  }, []);

  /**
   * Tap zones: only navigate on a real tap (< 300 ms). A long press is a
   * hold-to-pause gesture and must not advance the story when released.
   */
  const handleTap = useCallback((navigate: () => void) => {
    if (Date.now() - pressStartRef.current < 300) navigate();
  }, []);

  /**
   * Single countdown effect.
   *  - New story (index changed)      → reset to the full duration.
   *  - Not paused                     → schedule auto-advance; the cleanup
   *    subtracts the elapsed time so pause/resume stays accurate.
   *  - Paused (press-and-hold)        → no countdown; the CSS progress bar is
   *    frozen at the same moment, so both stay in sync.
   */
  useEffect(() => {
    if (prevIndexRef.current !== index) {
      prevIndexRef.current = index;
      remainingRef.current = STORY_DURATION_MS;
    }
    if (paused) return;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(goNext, remainingRef.current);
    return () => {
      clearTimer();
      remainingRef.current = Math.max(
        remainingRef.current - (Date.now() - startedAtRef.current),
        150, // never resume into an instant advance
      );
    };
  }, [index, paused, goNext, clearTimer]);

  // Keyboard controls + lock body scroll while open.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose, goNext, goPrev]);

  if (count === 0) return null;

  const story = stories[index];
  const author = story?.user || {};
  const timeLabel = story?.createdAt
    ? formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Story by ${author.name || 'unknown user'}`}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center select-none"
    >
      <div className="relative w-full max-w-md h-full sm:h-[92vh] flex flex-col justify-center">
        {/* Progress segments */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1" aria-hidden>
          {stories.map((s, i) => (
            <div key={s.id ?? i} className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
              {i < index && <div className="h-full w-full bg-white" />}
              {i === index && (
                <div
                  key={index} // remount to restart the fill for each story
                  className="h-full bg-white"
                  style={{
                    animation: `story-progress ${STORY_DURATION_MS}ms linear forwards`,
                    animationPlayState: paused ? 'paused' : 'running',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Header: author + close */}
        <div className="absolute top-6 left-3 right-3 z-20 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            {author.avatar ? (
              <img
                src={author.avatar}
                alt={author.name || 'Story author'}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-white/70 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white/70 shrink-0">
                {(author.name || 'U').charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate drop-shadow">
                {author.name || 'Hyper user'}
              </p>
              {timeLabel && <p className="text-white/70 text-[11px]">{timeLabel}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/90 hover:bg-white/15 rounded-full transition-colors"
            title="Close (Esc)"
            aria-label="Close story viewer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Story image (press-and-hold pauses) */}
        <div
          className="relative w-full h-full flex items-center justify-center overflow-hidden sm:rounded-2xl [touch-action:manipulation]"
          onPointerDown={handlePressStart}
          onPointerUp={handlePressEnd}
          onPointerLeave={handlePressEnd}
          onPointerCancel={handlePressEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <img
            key={story.id ?? index}
            src={story.imageUrl}
            alt={author.name ? `${author.name}'s story` : 'Story'}
            className="max-h-full max-w-full object-contain sm:rounded-2xl shadow-2xl pointer-events-none"
            draggable={false}
          />

          {/* Tap zones: left third = previous, rest = next. They also carry
              the hold-to-pause handlers — being absolutely positioned over
              the image, they receive every pointer event first. */}
          <button
            type="button"
            aria-label="Previous story"
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerCancel={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onClick={() => handleTap(goPrev)}
            className="absolute inset-y-0 left-0 w-1/3 cursor-pointer"
          />
          <button
            type="button"
            aria-label="Next story"
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerCancel={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onClick={() => handleTap(goNext)}
            className="absolute inset-y-0 right-0 w-2/3 cursor-pointer"
          />
        </div>

        {/* Desktop chevrons */}
        {index > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="hidden sm:flex absolute -left-14 top-1/2 -translate-y-1/2 p-2.5 text-white bg-white/10 hover:bg-white/25 rounded-full transition-colors"
            aria-label="Previous story"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="hidden sm:flex absolute -right-14 top-1/2 -translate-y-1/2 p-2.5 text-white bg-white/10 hover:bg-white/25 rounded-full transition-colors"
          aria-label="Next story"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
