'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { LayoutGrid, X } from 'lucide-react';

export interface HomeLeagueItem {
  id: string;
  name: string;
  count: number;
  logo: string | null;
}

interface HomeLeagueFilterContextValue {
  selectedLeague: string | null;
  setSelectedLeague: (league: string | null) => void;
}

const HomeLeagueFilterContext = createContext<HomeLeagueFilterContextValue>({
  selectedLeague: null,
  setSelectedLeague: () => {},
});

export function useHomeLeagueFilter() {
  return useContext(HomeLeagueFilterContext);
}

export function HomeLeagueFilterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  return (
    <HomeLeagueFilterContext.Provider value={{ selectedLeague, setSelectedLeague }}>
      {children}
    </HomeLeagueFilterContext.Provider>
  );
}

export function HomeLeagueFilterBar({
  leagues,
  totalCount,
}: {
  leagues: HomeLeagueItem[];
  totalCount: number;
}) {
  const { selectedLeague, setSelectedLeague } = useHomeLeagueFilter();
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof document === 'undefined') return;
    const sync = () => {
      document.documentElement.style.setProperty('--home-league-bar-h', `${el.offsetHeight}px`);
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--home-league-bar-h');
    };
  }, [leagues.length, selectedLeague]);

  if (leagues.length === 0) return null;

  return (
    <section
      ref={barRef}
      aria-label="Filter homepage by sport or league"
      className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0b101b]/95"
    >
      <div className="mx-auto max-w-7xl px-2 py-1.5 sm:px-4 sm:py-2.5">
        <div className="flex items-stretch gap-1.5 sm:gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {/* All Sports reset card */}
          <button
            type="button"
            onClick={() => setSelectedLeague(null)}
            aria-pressed={selectedLeague === null}
            className={`group flex shrink-0 min-w-[74px] sm:min-w-[116px] flex-col items-center justify-center rounded-xl border px-2 py-1.5 sm:px-3 sm:py-2 text-center transition-all ${
              selectedLeague === null
                ? 'border-violet-500 bg-violet-500/15 text-slate-900 shadow-sm dark:border-violet-400/70 dark:bg-[#1a2236] dark:text-white'
                : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-white/[0.08] dark:bg-[#121826] dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-[#171f31]'
            }`}
          >
            <span className="mb-1 sm:mb-1.5 flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-black/5">
              <LayoutGrid className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className="max-w-[68px] sm:max-w-[104px] truncate text-[10px] sm:text-xs font-bold leading-tight">
              All Sports
            </span>
            <span className="mt-0.5 text-[9px] sm:text-[10px] font-medium leading-tight text-slate-500 dark:text-slate-400">
              {totalCount} <span className="hidden sm:inline">on the </span>board
            </span>
          </button>

          {leagues.map((league) => {
            const active = selectedLeague === league.id;
            const showLogo = Boolean(league.logo && !failedLogos[league.id]);
            return (
              <button
                key={league.id}
                type="button"
                onClick={() => setSelectedLeague(active ? null : league.id)}
                aria-pressed={active}
                className={`group flex shrink-0 min-w-[76px] sm:min-w-[120px] flex-col items-center justify-center rounded-xl border px-2 py-1.5 sm:px-3 sm:py-2 text-center transition-all ${
                  active
                    ? 'border-violet-500 bg-violet-500/15 text-slate-900 shadow-sm dark:border-violet-400/70 dark:bg-[#1a2236] dark:text-white'
                    : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-white/[0.08] dark:bg-[#121826] dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-[#171f31]'
                }`}
              >
                <span className="mb-1 sm:mb-1.5 flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center overflow-hidden rounded-lg sm:rounded-xl bg-white p-1 sm:p-1.5 shadow-sm ring-1 ring-black/5">
                  {showLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={league.logo!}
                      alt=""
                      className="h-full w-full object-contain"
                      loading="lazy"
                      onError={() =>
                        setFailedLogos((prev) => ({ ...prev, [league.id]: true }))
                      }
                    />
                  ) : (
                    <span className="text-[9px] sm:text-[11px] font-black tracking-tight text-slate-800">
                      {league.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 3)
                        .toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="max-w-[70px] sm:max-w-[110px] truncate text-[10px] sm:text-xs font-bold leading-tight">
                  {league.name}
                </span>
                <span className="mt-0.5 text-[9px] sm:text-[10px] font-medium leading-tight text-slate-500 dark:text-slate-400">
                  {league.count} <span className="hidden sm:inline">on the </span>board
                </span>
              </button>
            );
          })}
        </div>

        {selectedLeague && (
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Filtering homepage by{' '}
              <strong className="font-semibold text-slate-900 dark:text-white">
                {leagues.find((l) => l.id === selectedLeague)?.name ?? selectedLeague}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setSelectedLeague(null)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
