'use client';

import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

/** Scrolled this far, the top of the board is more than a screen away. */
const SHOW_AFTER_PX = 600;

/**
 * A way back to the filters from deep in a long board. Not rendered until the
 * reader has scrolled, and it sits above the mobile tab bar rather than on it.
 */
export default function SportsBackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      className="fixed right-3 bottom-[calc(var(--mobile-nav-space,0px)+0.75rem)] z-40 grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:right-6 md:bottom-6"
    >
      <ChevronUp aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
