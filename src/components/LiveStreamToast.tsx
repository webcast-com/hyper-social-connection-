'use client';

/**
 * The homepage's floating live-stream card.
 *
 * A small card in the corner of the screen — above the tab bar on a phone —
 * that names one match that can be watched now, stays a few seconds, and goes
 * away. When it comes back it names a different match (see `stream-toast.ts`).
 * The whole card is a link to the live-stream screen, opened on that match.
 *
 * It is deliberately quiet:
 *
 *   - nothing is shown when there is nothing to watch, or when the stream
 *     provider is not connected. No placeholder, no sample match;
 *   - it never moves the page: it floats, and it is `inert` while hidden so it
 *     cannot be tabbed into or read out;
 *   - it is not a live region. A card that returns every half minute would
 *     interrupt a screen-reader user every half minute;
 *   - it waits while the pointer or the keyboard is on it, so it cannot vanish
 *     from under a click;
 *   - the close button ends it for the rest of the visit;
 *   - a hidden browser tab asks for nothing and shows nothing.
 *
 * The match list is read from this site's own `/api/sports/streams`, which is
 * cached, so the card adds no request to the stream provider's daily allowance
 * beyond the ones the live-stream screen already causes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Play, X } from 'lucide-react';
import { streamClock, streamScore, type StreamBoard, type StreamMatch, type StreamTeam } from '@/lib/sportsrc';
import { pickToastMatch, toastCandidates, toastHref } from '@/lib/stream-toast';

export type ToastTiming = {
  /** Before the first appearance, so the page has settled. */
  firstMs: number;
  /** How long the card stays. */
  showMs: number;
  /** How long it stays away. */
  gapMs: number;
  /** How old the match list may be before it is read again. */
  refreshMs: number;
};

export const TOAST_TIMING: ToastTiming = { firstMs: 3_000, showMs: 8_000, gapMs: 22_000, refreshMs: 60_000 };
export const TOAST_DISMISSED_KEY = 'hyper:streams:toast-dismissed';

function Crest({ team }: { team: StreamTeam }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!team.badge || team.badge === failed) {
    return (
      <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#333] bg-[#232323] text-[8px] font-bold text-[#c9c9c9]">
        {team.code.slice(0, 3)}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-[#232323]">
      <img src={team.badge} alt="" decoding="async" onError={() => setFailed(team.badge)} className="h-full w-full object-contain p-0.5" />
    </span>
  );
}

function kickoffTime(iso: string | null): string {
  if (!iso) return 'Soon';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Soon';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export default function LiveStreamToast({ timing }: { timing?: Partial<ToastTiming> }) {
  const [match, setMatch] = useState<StreamMatch | null>(null);
  const [visible, setVisible] = useState(false);
  const holding = useRef(false);
  const dismiss = useRef<() => void>(() => {});
  const { firstMs, showMs, gapMs, refreshMs } = { ...TOAST_TIMING, ...timing };

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(TOAST_DISMISSED_KEY)) return;
    } catch {
      // Storage refused: the card simply cannot remember being closed.
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let matches: StreamMatch[] = [];
    let history: string[] = [];
    let readAt = 0;
    const later = (fn: () => void, ms: number) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

    /** False when the provider is not connected: there is nothing to wait for. */
    const read = async (): Promise<boolean> => {
      try {
        const response = await fetch('/api/sports/streams?sport=football');
        const board = (await response.json()) as StreamBoard;
        if (board.state === 'missing-key' || board.state === 'unauthorized') return false;
        if (board.state === 'ok' && Array.isArray(board.matches)) matches = board.matches;
        readAt = Date.now();
      } catch {
        // Keep the list already held; the next round reads again.
      }
      return true;
    };

    const hide = () => {
      if (stopped) return;
      // Not from under a pointer or a focused link.
      if (holding.current) { later(hide, 1_500); return; }
      setVisible(false);
      later(() => void appear(), gapMs);
    };

    const appear = async () => {
      if (stopped) return;
      if (document.visibilityState === 'hidden') { later(() => void appear(), gapMs); return; }
      if (Date.now() - readAt >= refreshMs && !(await read())) return;
      if (stopped) return;
      const picked = pickToastMatch(toastCandidates(matches), history);
      history = picked.history;
      if (!picked.match) { later(() => void appear(), Math.max(gapMs, refreshMs)); return; }
      setMatch(picked.match);
      setVisible(true);
      later(hide, showMs);
    };

    dismiss.current = () => {
      stopped = true;
      clearTimeout(timer);
      setVisible(false);
      try { window.sessionStorage.setItem(TOAST_DISMISSED_KEY, '1'); } catch { /* not remembered */ }
    };

    later(() => void appear(), firstMs);
    return () => { stopped = true; clearTimeout(timer); };
  }, [firstMs, showMs, gapMs, refreshMs]);

  const hold = useCallback((on: boolean) => () => { holding.current = on; }, []);

  if (!match) return null;

  const live = match.status === 'live';
  const clock = live ? streamClock(match) ?? 'Live' : kickoffTime(match.startAt);
  const scored = match.score.home !== null && match.score.away !== null;

  return (
    <aside
      aria-label="Live stream"
      data-live-toast={match.id}
      data-visible={visible ? 'true' : 'false'}
      inert={!visible}
      onMouseEnter={hold(true)}
      onMouseLeave={hold(false)}
      onFocus={hold(true)}
      onBlur={hold(false)}
      className={`fixed right-3 bottom-[calc(var(--mobile-nav-space,0px)+0.75rem)] z-40 w-[min(19rem,calc(100vw-1.5rem))] transition-all duration-300 ease-out motion-reduce:transition-none md:right-5 md:bottom-5 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <Link
        href={toastHref(match)}
        prefetch={false}
        aria-label={`${live ? 'Live now' : 'Starting soon'}: ${match.home.name} ${scored ? streamScore(match) : 'vs'} ${match.away.name}, ${match.league}. Watch the stream`}
        className="block rounded-2xl border border-[#2a2a2a] bg-[#161616] p-3 pr-3 text-[#f3f3f3] shadow-[0_18px_48px_rgba(0,0,0,0.55)] ring-1 ring-black/40 transition-colors hover:border-[#f26a1b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26a1b]"
      >
        <span className="flex items-center gap-2 pr-8 text-[11px]">
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-bold uppercase tracking-wide ${live ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-[#c9c9c9]'}`}>
            <i aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-red-500 motion-reduce:animate-none' : 'bg-[#8a8a8a]'}`} />
            {live ? 'Live' : 'Soon'}
          </span>
          <span className="min-w-0 truncate text-[#8a8a8a]">{match.league}</span>
          <span data-toast-clock className="ml-auto shrink-0 font-semibold tabular-nums text-[#f26a1b]">{clock}</span>
        </span>

        <span className="mt-2.5 flex items-center gap-3">
          <span className="grid min-w-0 flex-1 gap-1.5">
            {[match.home, match.away].map((team, index) => (
              <span key={index} className="flex items-center gap-2">
                <Crest team={team} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{team.name}</span>
                {scored && <b className="shrink-0 text-sm font-bold tabular-nums">{index === 0 ? match.score.home : match.score.away}</b>}
              </span>
            ))}
          </span>
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#f26a1b] px-3 text-xs font-bold text-white">
            <Play aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
            Watch
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => dismiss.current()}
        aria-label="Close and stop showing live matches"
        title="Close"
        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full text-[#8a8a8a] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#f26a1b]"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </aside>
  );
}
