/**
 * A stand-in for IntersectionObserver, which jsdom does not have.
 *
 * jsdom lays nothing out, so "the end of the list is near the window" cannot
 * happen on its own here; a test says when it does. Like the real thing, an
 * observer reports its target's position once when it starts observing, and
 * after that only when told the position changed.
 *
 * `next/link` also observes every link it renders (to prefetch it), so the
 * helpers below act only on the end-of-list markers, never on those.
 */
const isEnd = (target: any) => typeof target?.hasAttribute === 'function' && target.hasAttribute('data-infinite-sentinel');

type Report = (entries: { isIntersecting: boolean; target: unknown }[]) => void;
type Live = { report: Report; targets: Set<unknown> };

const observers = new Set<Live>();
let inRange = false;

class FakeIntersectionObserver {
  private readonly live: Live;
  constructor(report: Report) { this.live = { report, targets: new Set() }; }
  observe(target: unknown) {
    this.live.targets.add(target);
    observers.add(this.live);
    // The initial report: where the target is now.
    const { live } = this;
    if (inRange && isEnd(target)) queueMicrotask(() => { if (observers.has(live)) live.report([{ isIntersecting: true, target }]); });
  }
  unobserve(target: unknown) { this.live.targets.delete(target); }
  disconnect() { this.live.targets.clear(); observers.delete(this.live); }
  takeRecords() { return []; }
}

export function installIntersectionObserver() {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;
}

/** Whether the end of the list stays within range of the window from now on. */
export function keepEndInRange(value: boolean) { inRange = value; }

/** The reader scrolls: every watched end-of-list comes into range once. Returns how many were told. */
export function scrollToEnd(): number {
  let told = 0;
  for (const live of [...observers]) {
    const ends = [...live.targets].filter(isEnd);
    if (!ends.length) continue;
    told += 1;
    live.report(ends.map((target) => ({ isIntersecting: true, target })));
  }
  return told;
}

/** How many end-of-list markers inside `within` are being watched right now. */
export const watchedEnds = (within: { contains: (node: any) => boolean }) =>
  [...observers].reduce((count, live) => count + [...live.targets].filter((target) => isEnd(target) && within.contains(target)).length, 0);
