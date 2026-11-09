/** Smooth, cancellable scrolling used by the mobile section tabs. */

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/** Offset that keeps a section clear of the sticky header. */
export function stickyHeaderOffset(extra = 18) {
  if (typeof document === "undefined") return 0;
  const header = document.querySelector(".sh-topbar");
  return header ? header.getBoundingClientRect().height + extra : 0;
}

/**
 * Scroll a section into view with an eased animation. The CSS `scroll-behavior:
 * smooth` is paused for the duration so each frame lands exactly, the animation
 * cancels as soon as the visitor scrolls themselves, and reduced-motion
 * visitors get an instant jump.
 */
export function smoothScrollTo(target, { offset } = {}) {
  if (typeof window === "undefined") return;
  const element = typeof target === "string" ? document.getElementById(target) : target;
  if (!element) return;

  const root = document.documentElement;
  const previousBehavior = root?.style.scrollBehavior ?? "";
  const restore = () => {
    if (root) root.style.scrollBehavior = previousBehavior;
  };

  const gap = offset ?? stickyHeaderOffset();
  const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - gap);
  const start = window.scrollY;
  const distance = top - start;

  if (prefersReducedMotion() || Math.abs(distance) < 2) {
    if (root) root.style.scrollBehavior = "auto";
    window.scrollTo(0, top);
    restore();
    return;
  }

  if (root) root.style.scrollBehavior = "auto";

  const duration = Math.min(760, Math.max(320, Math.abs(distance) * 0.4));
  const startedAt = performance.now();
  let frame = 0;

  const stopListening = () => {
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("touchstart", cancel);
  };
  const cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    stopListening();
    restore();
  };
  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    window.scrollTo(0, start + distance * easeInOutCubic(progress));
    if (progress < 1) {
      frame = requestAnimationFrame(step);
    } else {
      cancel();
    }
  };

  window.addEventListener("wheel", cancel, { passive: true, once: true });
  window.addEventListener("touchstart", cancel, { passive: true, once: true });
  frame = requestAnimationFrame(step);
}
