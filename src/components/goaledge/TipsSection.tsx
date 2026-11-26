"use client";

import { useState } from "react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/goaledge/animations";
import { RefreshCw, Search, ChevronRight, Star } from "lucide-react";
import { toast } from "@/lib/toast";
import type { Tip, LiveOddsData, ApiStatus, OddsComparison } from "@/types/goaledge";
import { TipCard } from "./TipCard";
import { TipCardSkeleton } from "./TipCardSkeleton";

export function TipsSection({
  loading,
  apiStatus,
  apiNote,
  tipsCount,
  selectedDate,
  leagues,
  activeFilter,
  bookmarkedTips,
  filteredTips,
  betSlipIds,
  tipVotes,
  liveOdds,
  stakeCalcOpen,
  calcStake,
  onSetSelectedDate,
  onSetActiveFilter,
  onSetSelectedTip,
  onAddToSlip,
  onCopyTip,
  onSetTipVotes,
  onSetStakeCalcOpen,
  onSetCalcStake,
  onSetBookmarkedTips,
  onFetchTips,
  onSetSearchOpen,
  onSeeAll,
  onSetCompareTip,
  oddsComparisons: oddsComparisonsProp,
}: {
  loading: boolean;
  apiStatus: ApiStatus;
  apiNote?: string | null;
  tipsCount: number;
  selectedDate: number;
  leagues: string[];
  activeFilter: string;
  bookmarkedTips: Set<string>;
  filteredTips: Tip[];
  betSlipIds: string[];
  tipVotes: Record<string, "up" | "down">;
  liveOdds: Record<string, LiveOddsData>;
  stakeCalcOpen: string | null;
  calcStake: string;
  onSetSelectedDate: (v: number) => void;
  onSetActiveFilter: (v: string) => void;
  onSetSelectedTip: (tip: Tip | null) => void;
  onAddToSlip: (tip: Tip) => void;
  onCopyTip: (tip: Tip) => void;
  onSetTipVotes: (updater: (prev: Record<string, "up" | "down">) => Record<string, "up" | "down">) => void;
  onSetStakeCalcOpen: (updater: (prev: string | null) => string | null) => void;
  onSetCalcStake: (v: string) => void;
  onSetBookmarkedTips: (updater: (prev: Set<string>) => Set<string>) => void;
  onFetchTips: () => void;
  onSetSearchOpen: (v: boolean) => void;
  onSeeAll: () => void;
  onSetCompareTip: (tip: Tip) => void;
  /** Optional per-bookmaker prices, keyed by tip id. */
  oddsComparisons?: Record<string, OddsComparison>;
}) {
  /**
   * Per-bookmaker odds comparisons.
   *
   * The ported version fetched these from `/api/odds`, which goaledge's backend
   * served and this deployment does not — `api/` is excluded from the SPA
   * catch-all, so the call 404'd on every load. They now arrive from the page,
   * and when it has none the cards fall back to the tip's own price, which is
   * the behaviour the empty state already had.
   */
  const oddsComparisons = oddsComparisonsProp ?? {};
  const selectedDayDate = new Date(Date.now() + selectedDate * 86_400_000);
  const headingText =
    selectedDate === 0
      ? "Today's featured tips"
      : selectedDate === 1
        ? "Tomorrow's featured tips"
        : `Featured tips · ${selectedDayDate.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${selectedDayDate.getUTCDate()} ${selectedDayDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}`;
  return (
    <section id="tips" className="scroll-mt-16 relative overflow-hidden mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="section-heading text-2xl font-bold tracking-tight sm:text-3xl" suppressHydrationWarning>
              {headingText}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              A taste of what&apos;s inside. Sign up to unlock the full
              board.
              {apiStatus === "live" && (
                <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Live Data · {tipsCount} matches from ESPN
                </span>
              )}
              {apiStatus !== "live" && apiStatus !== "loading" && (
                <span
                  className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  title={apiNote ?? "Live fixtures unavailable — showing sample tips"}
                >
                  Demo Data{apiNote ? " ⓘ" : ""}

                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onFetchTips}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Refresh tips"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={() => {
                onSetSearchOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Search className="h-3.5 w-3.5" />
              Search
            </button>
            <button
              onClick={onSeeAll}
              className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              See all <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </FadeIn>

      {/* Match Day Selector */}
      <FadeIn delay={0.05}>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(Date.now() + i * 86_400_000);
            const dayName = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
            const dateNum = d.getUTCDate();
            const monthShort = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
            return (
              <button
                key={i}
                onClick={() => { onSetSelectedDate(i); toast.info(i === 0 ? "Showing today's tips" : `Showing tips for ${dayName} ${dateNum} ${monthShort}`); }}
                className={`shrink-0 flex flex-col items-center rounded-xl px-4 py-2.5 transition-all duration-200 ${
                  selectedDate === i
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25 dark:bg-emerald-500"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-600 dark:hover:bg-slate-700"
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider ${selectedDate === i ? "text-emerald-100" : "text-slate-400 dark:text-slate-500"}`} suppressHydrationWarning>{dayName}</span>
                <span className="text-lg font-extrabold leading-tight" suppressHydrationWarning>{dateNum}</span>
                <span className={`text-[10px] font-medium ${selectedDate === i ? "text-emerald-200" : "text-slate-400 dark:text-slate-500"}`} suppressHydrationWarning>{monthShort}</span>
              </button>
            );
          })}
        </div>
      </FadeIn>

      {/* League filter tabs */}
      <FadeIn delay={0.1}>
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {leagues.map((league) => (
            <button
              key={league}
              onClick={() => onSetActiveFilter(league)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                activeFilter === league
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 dark:bg-emerald-500"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {league}
            </button>
          ))}
          <button
            onClick={() => onSetActiveFilter("Saved")}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeFilter === "Saved"
                ? "bg-amber-500 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
          >
            <span className="flex items-center gap-1"><Star className="h-3 w-3" /> Saved {bookmarkedTips.size > 0 && `(${bookmarkedTips.size})`}</span>
          </button>
        </div>
      </FadeIn>

      {/* Phones show two cards per row (tighter gap); from `sm` up the layout
          is unchanged: two columns, gap-4, three from `lg`. */}
      <StaggerContainer className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" staggerDelay={0.08}>
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <StaggerItem key={i}>
                <TipCardSkeleton />
              </StaggerItem>
            ))}
          </>
        ) : filteredTips.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-slate-400">
            No tips available for this league yet.
          </div>
        ) : (
          filteredTips.map((tip) => (
            <StaggerItem key={tip.id}>
              <TipCard
                tip={tip}
                onView={() => onSetSelectedTip(tip)}
                onAddToSlip={() => onAddToSlip(tip)}
                inSlip={betSlipIds.includes(tip.id)}
                onCopy={() => onCopyTip(tip)}
                tipVote={tipVotes[tip.id]}
                onVote={(dir) => {
                  onSetTipVotes(prev => {
                    if (prev[tip.id] === dir) {
                      const next = { ...prev };
                      delete next[tip.id];
                      return next;
                    }
                    return { ...prev, [tip.id]: dir };
                  });
                }}
                liveOddsData={liveOdds[tip.id]}
                stakeCalcOpen={stakeCalcOpen === tip.id}
                onToggleCalc={() => onSetStakeCalcOpen(prev => prev === tip.id ? null : tip.id)}
                calcStake={calcStake}
                onCalcStakeChange={onSetCalcStake}
                isBookmarked={bookmarkedTips.has(tip.id)}
                onToggleBookmark={() => {
                  onSetBookmarkedTips(prev => {
                    const next = new Set(prev);
                    if (next.has(tip.id)) { next.delete(tip.id); toast.info("Removed from favorites"); }
                    else { next.add(tip.id); toast.success("Saved to favorites ⭐"); }
                    return next;
                  });
                }}
                oddsComparison={oddsComparisons[tip.id] ?? null}
                onCompare={() => onSetCompareTip(tip)}
              />
            </StaggerItem>
          ))
        )}
      </StaggerContainer>
    </section>
  );
}