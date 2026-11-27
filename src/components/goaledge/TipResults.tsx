"use client";

import { useMemo } from "react";
import { FadeIn } from "@/components/goaledge/animations";
import {
  Award,
  CheckCircle2,
  X,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { HistoryFilter, TipStatus } from "@/types/goaledge";

export interface HistoryTip {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  prediction: string;
  predictionType: string;
  odds: string;
  /** Settled verdict — the type the filter buttons and the stat helpers share. */
  status: TipStatus;
  analysis?: string | null;
  matchTime: string;
  createdAt: string;
}

export interface PerformanceData {
  performance?: {
    totalStaked: number;
    totalReturns: number;
    netPL: number;
    roi: number;
    won: number;
    lost: number;
    void: number;
    totalTips: number;
    pending: number;
  };
}

function daysAgoLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function isInPeriod(iso: string, period: "week" | "month" | "all"): boolean {
  if (period === "all") return true;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return true;
  const days = (Date.now() - then) / 86400000;
  return period === "week" ? days <= 7 : days <= 30;
}

export function TipResults({
  historyFilter,
  historyPeriod,
  onSetHistoryFilter,
  onSetHistoryPeriod,
  tips = [],
  performance = null,
  loading = false,
  sourceNote,
}: {
  historyFilter: HistoryFilter;
  historyPeriod: "week" | "month" | "all";
  onSetHistoryFilter: (v: HistoryFilter) => void;
  onSetHistoryPeriod: (v: "week" | "month" | "all") => void;
  /**
   * Settled picks, supplied by the page from this app's own prediction feed.
   *
   * The ported version fetched `/api/admin/tips?history=true` and
   * `/api/performance` from goaledge's backend. Neither route exists in this
   * deployment — `vercel.json` excludes `api/` from the SPA catch-all, so both
   * calls answered 404 and the table was permanently empty.
   */
  tips?: HistoryTip[];
  performance?: PerformanceData["performance"] | null;
  loading?: boolean;
  /**
   * Optional one-line disclosure about where these rows came from.
   *
   * Omitted by default, so any other caller renders exactly as before.
   */
  sourceNote?: string;
}) {

  const settled = useMemo(
    () =>
      tips.filter((t) => ["won", "lost", "void"].includes(t.status)),
    [tips]
  );

  const filtered = useMemo(
    () =>
      settled
        .filter((t) => historyFilter === "all" || t.status === historyFilter)
        .filter((t) => isInPeriod(t.createdAt, historyPeriod)),
    [settled, historyFilter, historyPeriod]
  );

  const periodSettled = useMemo(
    () => settled.filter((t) => isInPeriod(t.createdAt, historyPeriod)),
    [settled, historyPeriod]
  );

  const stats = useMemo(() => {
    const won = periodSettled.filter((t) => t.status === "won").length;
    const lost = periodSettled.filter((t) => t.status === "lost").length;
    const voided = periodSettled.filter((t) => t.status === "void").length;
    const decided = won + lost;
    const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;
    const wonPct = periodSettled.length > 0 ? (won / periodSettled.length) * 100 : 0;
    const lostPct = periodSettled.length > 0 ? (lost / periodSettled.length) * 100 : 0;
    const voidPct = periodSettled.length > 0 ? (voided / periodSettled.length) * 100 : 0;
    return { won, lost, voided, winRate, wonPct, lostPct, voidPct };
  }, [periodSettled]);

  // Rolling accuracy trend: last 7 windows of 4 settled tips each.
  const trend = useMemo(() => {
    const ordered = [...settled].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const bars: number[] = [];
    for (let i = 0; i < ordered.length && bars.length < 7; i += 4) {
      const window = ordered.slice(i, i + 4);
      const decided = window.filter((t) => t.status !== "void").length;
      const won = window.filter((t) => t.status === "won").length;
      bars.push(decided > 0 ? Math.round((won / decided) * 100) : 0);
    }
    return bars.reverse();
  }, [settled]);

  const avgAccuracy = useMemo(() => {
    if (trend.length === 0) return 0;
    return Math.round(trend.reduce((a, b) => a + b, 0) / trend.length);
  }, [trend]);

  const periodLabel = historyPeriod === "week" ? "Last 7 days" : historyPeriod === "month" ? "Last 30 days" : "All time";
  const totalStaked = performance?.totalStaked ?? 0;
  const totalReturns = performance?.totalReturns ?? 0;
  const netPL = performance?.netPL ?? 0;
  const roi = performance?.roi ?? 0;

  return (
    <section id="tip-results" className="scroll-mt-16 border-y border-slate-200 bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-900/30">
      <div className="mx-auto max-w-7xl">
        <FadeIn>
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Award className="h-3.5 w-3.5" /> Track record
              </span>
              <h2 className="section-heading mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Recent tip results
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Transparency in every prediction — see our recent performance.
              </p>
              {sourceNote && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sourceNote}</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {loading ? "—" : `${stats.winRate}%`}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{periodLabel}</p>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Filter + Period selectors */}
        <FadeIn delay={0.05}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {(["all", "won", "lost", "void"] as const).map((f) => (
                <button key={f} onClick={() => onSetHistoryFilter(f)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all ${historyFilter === f ? "bg-emerald-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"}`}>
                  {f}
                  {f !== "all" && (
                    <span className="ml-1 opacity-85">({loading ? "…" : f === "void" ? stats.voided : stats[f]})</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-white border border-slate-200 p-1 dark:bg-slate-800 dark:border-slate-700">
              {(["week", "month", "all"] as const).map((p) => (
                <button key={p} onClick={() => onSetHistoryPeriod(p)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${historyPeriod === p ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"}`}>
                  {p === "all" ? "All Time" : p === "week" ? "This Week" : "This Month"}
                </button>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* P&L Summary Row */}
        <FadeIn delay={0.08}>
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Staked</p>
              <p className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
                {loading ? "—" : `$${totalStaked.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Returns</p>
              <p className="mt-1 text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                {loading ? "—" : `$${totalReturns.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Net P&L</p>
              <p className={`mt-1 text-base font-extrabold ${netPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                {loading ? "—" : `${netPL >= 0 ? "+" : "-"}$${Math.abs(netPL).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">ROI</p>
              <p className={`mt-1 text-base font-extrabold ${roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                {loading ? "—" : `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`}
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Accuracy Trend Sparkline */}
        <FadeIn delay={0.1}>
          <div className="mb-4 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">Accuracy trend</span>
            <div className="flex flex-1 items-end gap-1.5 h-8">
              {trend.length === 0 ? (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                  {loading ? "Loading…" : "No settled tips yet"}
                </div>
              ) : (
                trend.map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className={`w-full rounded-sm transition-all ${v >= 70 ? "bg-emerald-500" : v >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ height: `${(v / 100) * 32}px` }} />
                    <span className="text-[8px] text-slate-400">{v}%</span>
                  </div>
                ))
              )}
            </div>
            <span className="shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400">Avg {avgAccuracy}%</span>
          </div>
        </FadeIn>

        {/* Results summary bar */}
        <FadeIn delay={0.12}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="h-3 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="result-bar-fill flex h-full">
                <div className="bg-emerald-500" style={{ width: `${stats.wonPct}%` }} />
                <div className="bg-amber-400" style={{ width: `${stats.voidPct}%` }} />
                <div className="bg-red-400" style={{ width: `${stats.lostPct}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Won ({stats.won})</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Void ({stats.voided})</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Lost ({stats.lost})</span>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-white dark:bg-slate-800" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400 dark:border-slate-700">
                No {historyFilter === "all" ? "" : historyFilter + " "}tips in this period yet.
              </div>
            ) : (
              filtered.map((r) => (
                <div key={r.id} className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 cursor-pointer" title={r.analysis || ""}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    r.status === "won" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                    r.status === "lost" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}>
                    {r.status === "won" ? <CheckCircle2 className="h-4 w-4" /> : r.status === "lost" ? <X className="h-4 w-4" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{r.homeTeam} vs {r.awayTeam}</p>
                    <p className="truncate text-xs text-slate-400">{r.league} · {r.prediction}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{r.odds}</span>
                    <p className="mt-0.5 text-[10px] text-slate-400">{daysAgoLabel(r.createdAt) || r.matchTime}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </FadeIn>

        {/* Transparency note */}
        <FadeIn delay={0.18}>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-400">
            {settled.length > 0 ? (
              <>
                <TrendingUp className="h-3 w-3" />
                {stats.won}W · {stats.lost}L · {stats.voided}V in {periodLabel.toLowerCase()}
              </>
            ) : (
              <>
                <TrendingDown className="h-3 w-3" />
                Results appear here once tips are settled by our tipsters.
              </>
            )}
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
