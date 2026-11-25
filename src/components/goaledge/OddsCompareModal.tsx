"use client";

import { X, TrendingUp, ExternalLink, Crown, BarChart3, ShieldCheck } from "lucide-react";
import type { Tip, OddsComparison } from "@/types/goaledge";

export function OddsCompareModal({
  tip,
  onClose,
  comparison: comparisonProp = null,
}: {
  tip: Tip | null;
  onClose: () => void;
  /**
   * Prices for this tip, supplied by the page.
   *
   * The ported version fetched `/api/odds?tipId=…` from goaledge's backend. That
   * route does not exist in this deployment — `api/` is excluded from the SPA
   * catch-all, so the request always 404'd and the modal could only ever show
   * its error state. When the page has no per-bookmaker prices the modal now
   * says so plainly instead.
   */
  comparison?: OddsComparison | null;
}) {
  const comparison = comparisonProp;
  const loading = false;
  const error = comparison ? "" : "No per-bookmaker prices are available for this tip yet.";

  if (!tip) return null;

  const sorted = comparison
    ? [...comparison.bookmakers].sort((a, b) => b.odds - a.odds)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 text-white">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white transition hover:bg-white/30"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <h3 className="text-xl font-bold">Odds comparison</h3>
          </div>
          <p className="mt-1 text-sm text-emerald-100">
            {tip.homeTeam} vs {tip.awayTeam} · {tip.prediction}
          </p>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          )}

          {error && !loading && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          {comparison && !loading && (
            <>
              {/* Best odds banner */}
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <Crown className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Best price on the board
                  </p>
                  <p className="truncate text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
                    {comparison.best.bookmaker} — {comparison.best.odds.toFixed(2)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  +{(comparison.best.odds - comparison.baseOdds).toFixed(2)} vs base
                </span>
              </div>

              {/* Bookmaker table */}
              <div className="space-y-2">
                {sorted.map((entry) => (
                  <div
                    key={entry.bookmaker}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      entry.isBest
                        ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                        {entry.bookmaker}
                        {entry.isBest && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                            <TrendingUp className="h-2.5 w-2.5" /> Best
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {entry.isBest ? "Highest odds — recommended" : "Market price"}
                      </p>
                    </div>
                    <span className={`shrink-0 text-base font-extrabold tabular-nums ${
                      entry.isBest
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {entry.odds.toFixed(2)}
                    </span>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      onClick={(e) => e.stopPropagation()}
                      className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        entry.isBest
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                      }`}
                    >
                      Bet now <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>

              <p className="mt-4 flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                Odds are indicative market prices. GoalEdge may earn a commission on bets placed
                through these links — it never changes the price you see. 18+ only. Play responsibly.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
