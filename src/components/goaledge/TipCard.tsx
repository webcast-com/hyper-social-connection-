"use client";

import {
  TrendingUp,
  Lock,
  Clock,
  Target,
  TrendingDown,
  ThumbsUp,
  ThumbsDown,
  Star,
  Percent,
  Copy,
  Ticket,
  Plus,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type { Tip, LiveOddsData, OddsComparison } from "@/types/goaledge";
import { MatchCountdown } from "@/components/goaledge/MatchCountdown";
import { streakLabel } from "@/app/services/espnTipForm";

export function TipCard({
  tip,
  onView,
  onAddToSlip,
  inSlip,
  onCopy,
  tipVote,
  onVote,
  liveOddsData,
  stakeCalcOpen,
  onToggleCalc,
  calcStake,
  onCalcStakeChange,
  isBookmarked,
  onToggleBookmark,
  oddsComparison,
  onCompare,
}: {
  tip: Tip;
  onView: () => void;
  onAddToSlip: () => void;
  inSlip: boolean;
  onCopy: () => void;
  tipVote?: "up" | "down";
  onVote?: (dir: "up" | "down") => void;
  liveOddsData?: LiveOddsData;
  stakeCalcOpen?: boolean;
  onToggleCalc?: () => void;
  calcStake?: string;
  onCalcStakeChange?: (v: string) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  oddsComparison?: OddsComparison | null;
  onCompare?: () => void;
}) {
  const currentOdds = liveOddsData?.odds ?? tip.odds;
  const potentialReturn = (Number(currentOdds) * (Number(calcStake ?? "100") || 0)).toFixed(0);

  return (
    <div
      className="tip-card tip-card-glass group relative flex h-full w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5 shadow-slate-900/[0.03] transition-all duration-200 hover:-translate-y-1 hover:scale-[1.01] hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/[0.06] dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-500"
      onClick={onView}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg leading-none">{tip.flag}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
              {tip.league}
            </p>
            <p className="truncate text-xs text-slate-400 dark:text-slate-500">
              {tip.country}
            </p>
            {/* ESPN form run. Hidden when ESPN has no completed games for this
                team — the card used to print a literal "3-win streak" here on
                every tip, which was true for none of them. */}
            {streakLabel(tip.homeForm) && (
              <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-3 w-3" />
                {streakLabel(tip.homeForm)}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {tip.isPremium && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:ring-amber-800">
              <Lock className="h-2.5 w-2.5" /> PRO
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-800">
            <span className="relative flex h-1.5 w-1.5">
              <span className="live-pulse absolute inline-flex h-full w-full rounded-full bg-sky-500" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
            </span>
            Upcoming
          </span>
        </div>
      </div>

      {/* Match */}
      <div className="mt-4">
        <div className="flex items-center gap-2.5">
          {tip.homeTeamCrest ? (
            <img src={tip.homeTeamCrest} alt="" className="h-6 w-6 shrink-0 object-contain sm:h-7 sm:w-7" />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm dark:bg-slate-800 sm:h-7 sm:w-7">{tip.flag}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words text-sm font-bold leading-snug sm:text-base text-slate-900 dark:text-slate-50">
              {tip.homeTeam}{" "}
              <span className="mx-1 text-sm font-medium text-slate-300 dark:text-slate-600">
                vs
              </span>{" "}
              {tip.awayTeam}
            </p>
          </div>
          {tip.awayTeamCrest ? (
            <img src={tip.awayTeamCrest} alt="" className="h-6 w-6 shrink-0 object-contain sm:h-7 sm:w-7" />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm dark:bg-slate-800 sm:h-7 sm:w-7">{tip.flag}</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {tip.matchTime}
          </span>
          <MatchCountdown matchTime={tip.matchTime} />
        </div>
      </div>

      {/* Prediction */}
      <div className="relative mt-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-2.5 transition sm:p-3.5 hover:border-emerald-200 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-emerald-800">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
          <Target className="h-3.5 w-3.5" />
          {tip.predictionType}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 break-words text-sm font-bold text-slate-900 dark:text-slate-100">
            {tip.prediction}
          </p>
          <span className={`shrink-0 rounded-lg bg-white px-2 py-1 text-sm font-bold ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600 ${liveOddsData?.direction === "up" ? "text-emerald-600 odds-flash-up dark:text-emerald-400" : liveOddsData?.direction === "down" ? "text-red-500 odds-flash-down dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {currentOdds}
            {liveOddsData ? (
              <TrendingUp className={`ml-0.5 inline h-3 w-3 ${liveOddsData.direction === "down" ? "rotate-180 text-red-400" : "text-emerald-500"}`} />
            ) : (
              <TrendingDown className="ml-0.5 inline h-3 w-3 text-red-400 odds-trend-falling" />
            )}
          </span>
        </div>
      </div>

              {/* Odds Comparison */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] font-medium text-slate-400">Best odds:</span>
                {oddsComparison ? (
                  <>
                    {[...oddsComparison.bookmakers]
                      .sort((a, b) => b.odds - a.odds)
                      .slice(0, 3)
                      .map((b) => (
                        <span
                          key={b.bookmaker}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            b.isBest
                              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:ring-emerald-800"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {b.odds.toFixed(2)}
                        </span>
                      ))}
                    <button
                      onClick={onCompare}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      title="Compare odds across all bookmakers"
                    >
                      Compare all
                    </button>
                  </>
                ) : (
                  <>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {tip.odds}
                    </span>
                    <button
                      onClick={onCompare}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      title="Compare odds across all bookmakers"
                    >
                      Compare
                    </button>
                  </>
                )}
              </div>

      {/* Confidence */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500 dark:text-slate-400">
            Confidence
          </span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {tip.confidence}% · {tip.confidenceLabel}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="confidence-bar h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
            style={{ width: `${tip.confidence}%` }}
          />
        </div>
      </div>

      {/* Form Sparkline */}
      {tip.homeForm && tip.homeForm.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Form</span>
          <div className="flex items-center gap-1">
            {tip.homeForm.map((r, i) => (
              <div
                key={i}
                className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${
                  r === "W"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : r === "L"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
                title={r === "W" ? "Win" : r === "L" ? "Loss" : "Draw"}
              >
                {r}
              </div>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
            {tip.homeForm.filter(r => r === "W").length}/{tip.homeForm.length} W
          </span>
        </div>
      )}

      {/* Stake Calculator */}
      {stakeCalcOpen && (
        <div className="stake-calc-popover mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-900/30 dark:bg-emerald-950/20" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Quick Calculator</span>
            <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
              {currentOdds}x
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-medium text-slate-400">Stake (Ksh)</label>
              <input
                type="number"
                value={calcStake ?? "100"}
                onChange={(e) => onCalcStakeChange?.(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-bold tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                min="0"
              />
            </div>
            <div className="flex-1 text-right">
              <p className="text-[10px] font-medium text-slate-400">Return</p>
              <p className="mt-0.5 text-lg font-extrabold text-emerald-600 tabular-nums dark:text-emerald-400">Ksh {Number(potentialReturn).toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            {[50, 100, 200, 500].map((amt) => (
              <button
                key={amt}
                onClick={(e) => { e.stopPropagation(); onCalcStakeChange?.(String(amt)); }}
                className="flex-1 rounded-md bg-white px-1 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
              >
                {amt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Spacer pins the footer to the bottom when a grid row stretch makes
          this card taller than its content (0-height when heights are even,
          so even rows render exactly as before) */}
      <div className="flex-1" aria-hidden="true" />

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-xs font-medium text-slate-400 dark:text-slate-500">
            by {tip.tipster}
          </span>
          {/* Tip voting */}
          <span className="flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onVote?.("up");
                toast.success(tipVote === "up" ? "Vote removed" : "Tip rated helpful!");
              }}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition ${tipVote === "up" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" : "text-slate-300 hover:bg-slate-100 hover:text-emerald-500 dark:text-slate-600 dark:hover:bg-slate-800"}`}
              title="Helpful"
            >
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onVote?.("down");
                toast.success(tipVote === "down" ? "Vote removed" : "Feedback recorded!");
              }}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition ${tipVote === "down" ? "bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400" : "text-slate-300 hover:bg-slate-100 hover:text-red-400 dark:text-slate-600 dark:hover:bg-slate-800"}`}
              title="Not helpful"
            >
              <ThumbsDown className="h-3 w-3" />
            </button>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleBookmark?.(); }}
            className={`touch-target flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
              isBookmarked
                ? "text-amber-500 bg-amber-50 dark:bg-amber-950/30"
                : "text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20"
            }`}
            title={isBookmarked ? "Remove from favorites" : "Save to favorites"}
          >
            <Star className={`h-3.5 w-3.5 ${isBookmarked ? "fill-amber-500" : ""}`} />
            <span className="hidden sm:inline">{isBookmarked ? "Saved" : "Save"}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCalc?.();
            }}
            className={`touch-target inline-flex items-center justify-center rounded-lg p-1.5 transition ${stakeCalcOpen ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"}`}
            title="Stake calculator"
          >
            <Percent className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="touch-target inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
            title="Copy tip"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToSlip();
            }}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
              inSlip
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
            title="Add to bet slip"
          >
            <Ticket className="h-3.5 w-3.5" />
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
