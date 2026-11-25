"use client";

import { useState } from "react";
import { Tip } from "@/types/goaledge";
import {
  Crown,
  Clock,
  Flame,
  Star,
  Copy,
  Share2,
  X,
  BarChart3,
  Users,
  Sparkles,
  Target,
  Medal,
  ChartColumn,
  Lock,
  Radio,
  AlertTriangle,
  TrendingUp,
  Ticket,
} from "lucide-react";
import { MatchCountdown } from "@/components/goaledge/MatchCountdown";
import { useTipLeagueTable } from "@/app/services/espnTipTable";
import { BookmakerCompare } from "@/app/components/predictions/BookmakerCompare";
import { resolvePickOutcome } from "@/app/services/espnSecondOpinion";

export function TipDetailPanel({
  tip,
  betSlipIds,
  isPremium,
  onClose,
  onAddToSlip,
  onCopy,
  onShare,
  isBookmarked,
  onToggleBookmark,
  onUpgrade,
  allTips,
}: {
  tip: Tip;
  betSlipIds: Set<string>;
  isPremium: boolean;
  onClose: () => void;
  onAddToSlip: () => void;
  onCopy: () => void;
  onShare: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onUpgrade: () => void;
  allTips: Tip[];
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "stats" | "analysis" | "markets">("overview");
  const [stakeInput, setStakeInput] = useState("100");
  const oddsNum = parseFloat(tip.odds) || 0;
  const potentialReturn = (oddsNum * (parseFloat(stakeInput) || 0)).toFixed(0);
  const inSlip = betSlipIds.has(tip.id);
  const locked = tip.isPremium && !isPremium;

  // Real recent-record numbers from ESPN (see `attachTipForm`). The panel used
  // to invent these with `Math.random()` and label them "Expected Goals (xG)",
  // possession, shots and corners. ESPN's schedule endpoint carries only
  // results and goals, so those are the only figures shown; anything it cannot
  // supply is omitted rather than fabricated.
  const homeStats = tip.homeFormStats ?? null;
  const awayStats = tip.awayFormStats ?? null;
  const perGame = (total: number | undefined, played: number | undefined) =>
    played && played > 0 ? ((total ?? 0) / played).toFixed(2) : null;
  const homeGoalsPerGame = perGame(homeStats?.goalsFor, homeStats?.played);
  const awayGoalsPerGame = perGame(awayStats?.goalsFor, awayStats?.played);
  const homeConcededPerGame = perGame(homeStats?.goalsAgainst, homeStats?.played);
  const awayConcededPerGame = perGame(awayStats?.goalsAgainst, awayStats?.played);
  const hasRecord = Boolean(homeStats || awayStats);
  // Real standings, fetched only when the Stats tab is opened.
  const tableRows = useTipLeagueTable(tip.league, tip.homeTeam, tip.awayTeam, activeTab === "stats");

  // Related tips
  const relatedTips = allTips.filter(t => t.id !== tip.id && t.league === tip.league).slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel - slides from bottom on mobile, from right on desktop */}
      <div className="tip-detail-panel relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white dark:bg-slate-900 sm:mx-auto sm:h-auto sm:max-h-full sm:max-w-2xl sm:rounded-l-2xl sm:shadow-2xl lg:max-w-3xl">
        {/* Drag handle for mobile */}
        <div className="flex shrink-0 items-center justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        {/* Sticky Header */}
        <div className="relative z-10 shrink-0 border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">{tip.flag}</span>
                <p className="text-xs font-medium text-emerald-200 truncate">{tip.league} · {tip.country}</p>
                {tip.isPremium && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-400/30">
                    <Crown className="h-2.5 w-2.5" /> PRO
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 text-lg font-bold sm:text-xl truncate">
                {tip.homeTeam} <span className="font-normal text-emerald-200">vs</span> {tip.awayTeam}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-200">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{tip.matchTime}</span>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-50">
                  {tip.status === "upcoming" ? "Upcoming" : tip.status.charAt(0).toUpperCase() + tip.status.slice(1)}
                </span>
                <span className="flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-orange-300" />{tip.tipster}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button onClick={onToggleBookmark} className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${isBookmarked ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                <Star className={`h-4 w-4 ${isBookmarked ? "fill-amber-300" : ""}`} />
              </button>
              <button onClick={onCopy} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/20">
                <Copy className="h-4 w-4" />
              </button>
              <button onClick={onShare} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/20">
                <Share2 className="h-4 w-4" />
              </button>
              <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/20">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick stats bar */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <p className="text-[10px] font-medium text-emerald-200">Prediction</p>
              <p className="mt-0.5 text-xs font-bold truncate">{tip.predictionType}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <p className="text-[10px] font-medium text-emerald-200">Odds</p>
              <p className="mt-0.5 text-lg font-extrabold tabular-nums">{tip.odds}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <p className="text-[10px] font-medium text-emerald-200">Confidence</p>
              <p className="mt-0.5 text-sm font-bold">{tip.confidence}%</p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Premium Lock Overlay */}
          {locked && (
            <div className="relative">
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-slate-900/80" />
            </div>
          )}

          {/* Tabs */}
          <div className="sticky top-0 z-[5] border-b border-slate-100 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
            <div className="-mb-px flex gap-1 overflow-x-auto no-scrollbar">
              {(["overview", "stats", "analysis", "markets"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative shrink-0 px-4 py-3 text-xs font-semibold capitalize transition-colors ${
                    activeTab === tab
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Prediction Card */}
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 dark:border-slate-700 dark:from-slate-800/50 dark:to-slate-900">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{tip.predictionType}</p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">{tip.prediction}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl bg-emerald-100 px-4 py-2 text-xl font-black text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">{tip.odds}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-medium text-slate-400 uppercase">Potential Return</p>
                      <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">Ksh {Number(potentialReturn).toLocaleString()}</p>
                    </div>
                  </div>
                  {/* Quick stake input */}
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-400">Stake:</label>
                    <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                      <span className="text-xs text-slate-400">Ksh</span>
                      <input type="number" value={stakeInput} onChange={e => setStakeInput(e.target.value)} className="w-full bg-transparent text-sm font-bold tabular-nums text-slate-900 outline-none dark:text-white" min="0" />
                    </div>
                    {[50, 100, 200, 500].map(a => (
                      <button key={a} onClick={() => setStakeInput(String(a))} className="rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-emerald-100 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-400">{a}</button>
                    ))}
                  </div>
                </div>

                {/* Confidence */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Confidence Rating</span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">{tip.confidence}% · {tip.confidenceLabel}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="confidence-bar h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500" style={{ width: `${tip.confidence}%` }} />
                  </div>
                </div>

                {/* Form Guide */}
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    Recent Form
                  </h4>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {[{ name: tip.homeTeam, form: tip.homeForm, isHome: true }, { name: tip.awayTeam, form: tip.awayForm, isHome: false }].map((team) => (
                      <div key={team.name} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white ${team.isHome ? "bg-emerald-500" : "bg-sky-500"}`}>{team.isHome ? "H" : "A"}</span>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{team.name}</p>
                        </div>
                        <div className="mt-3 flex gap-1.5">
                          {(team.form ?? []).map((r, i) => (
                            <div key={i} className={`flex h-8 w-8 flex-col items-center justify-center rounded-lg text-[11px] font-bold text-white ${r === "W" ? "bg-emerald-500" : r === "L" ? "bg-red-500" : "bg-amber-500"}`}>
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-[10px] text-slate-400">{(team.form ?? []).filter(r => r === "W").length}/{(team.form ?? []).length} wins</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Head to Head */}
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <Users className="h-4 w-4 text-emerald-500" />
                    Head to Head
                  </h4>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {tip.headToHead ?? "These sides have no completed meeting in ESPN's records."}
                    </p>
                    {/* Tally from the mutual games, not the fixed 3/2/1 this
                        panel shipped with. */}
                    {tip.headToHeadRecord && tip.headToHeadRecord.games > 0 ? (
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-white p-3 dark:bg-slate-800">
                        <div className="text-center">
                          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{tip.headToHeadRecord.homeWins}</p>
                          <p className="text-[10px] text-slate-400">Home Wins</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-black text-slate-400">{tip.headToHeadRecord.draws}</p>
                          <p className="text-[10px] text-slate-400">Draws</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-black text-sky-500">{tip.headToHeadRecord.awayWins}</p>
                          <p className="text-[10px] text-slate-400">Away Wins</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Related Tips */}
                {relatedTips.length > 0 && (
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      More from {tip.league}
                    </h4>
                    <div className="mt-3 space-y-2">
                      {relatedTips.map(rt => (
                        <div key={rt.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/30">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{rt.homeTeam} vs {rt.awayTeam}</p>
                            <p className="text-xs text-slate-400">{rt.prediction} · {rt.odds}</p>
                          </div>
                          <span className={`ml-2 rounded-lg px-2 py-1 text-xs font-bold ${rt.status === "won" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>
                            {rt.status.charAt(0).toUpperCase() + rt.status.slice(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STATS TAB */}
            {activeTab === "stats" && (
              <div className="space-y-6">
                {/* Recent record — the figures ESPN actually supplies */}
                {hasRecord ? (
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Target className="h-4 w-4 text-emerald-500" />
                      Recent Record
                    </h4>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {[
                        { label: tip.homeTeam, stats: homeStats, tone: "text-emerald-600 dark:text-emerald-400" },
                        { label: tip.awayTeam, stats: awayStats, tone: "text-sky-500" },
                      ].map((side) => (
                        <div key={side.label} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                          <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{side.label}</p>
                          {side.stats ? (
                            <dl className="mt-3 space-y-1.5 text-[11px]">
                              <div className="flex items-center justify-between">
                                <dt className="text-slate-400">Last {side.stats.played}</dt>
                                <dd className={`font-bold tabular-nums ${side.tone}`}>{side.stats.won}W {side.stats.drawn}D {side.stats.lost}L</dd>
                              </div>
                              <div className="flex items-center justify-between">
                                <dt className="text-slate-400">Goals for</dt>
                                <dd className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{side.stats.goalsFor}</dd>
                              </div>
                              <div className="flex items-center justify-between">
                                <dt className="text-slate-400">Goals against</dt>
                                <dd className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{side.stats.goalsAgainst}</dd>
                              </div>
                              <div className="flex items-center justify-between">
                                <dt className="text-slate-400">Clean sheets</dt>
                                <dd className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{side.stats.cleanSheets}</dd>
                              </div>
                            </dl>
                          ) : (
                            <p className="mt-3 text-[11px] text-slate-400">No completed games in ESPN&apos;s records.</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <p className="text-xs font-medium text-slate-400">Goals / game</p>
                        <div className="mt-2 flex items-center justify-between text-sm font-bold">
                          <span className="text-emerald-600 dark:text-emerald-400">{homeGoalsPerGame ?? "—"}</span>
                          <span className="text-sky-500">{awayGoalsPerGame ?? "—"}</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <p className="text-xs font-medium text-slate-400">Conceded / game</p>
                        <div className="mt-2 flex items-center justify-between text-sm font-bold">
                          <span className="text-emerald-600 dark:text-emerald-400">{homeConcededPerGame ?? "—"}</span>
                          <span className="text-sky-500">{awayConcededPerGame ?? "—"}</span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">
                      From ESPN team schedules. Possession, shots and corners are per-match data this board does not load, so they are not shown.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-400 dark:border-slate-700">
                    ESPN has no completed games for these teams, so there is no recent record to show.
                  </p>
                )}

                {/* League Table Position */}
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <Medal className="h-4 w-4 text-emerald-500" />
                    League Position
                  </h4>
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                          <th className="px-4 py-2.5 text-left font-semibold text-slate-400">#</th>
                          <th className="px-4 py-2.5 text-left font-semibold text-slate-400">Team</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-400">P</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-400">W</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-400">D</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-400">L</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-slate-400">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Rows come from ESPN's standings for this league, with
                            the two sides in the tip highlighted. The panel used to
                            print fixed positions for the real teams plus invented
                            "Team Alpha/Beta/Gamma" filler. */}
                        {tableRows.map((row) => (
                          <tr key={`${row.pos}-${row.name}`} className={`border-b border-slate-50 last:border-0 ${row.highlight ? "bg-emerald-50/50 dark:bg-emerald-950/10" : ""}`}>
                            <td className={`px-4 py-2.5 font-bold tabular-nums ${row.pos <= 3 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}>{row.pos}</td>
                            <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{row.name}</td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-slate-400">{row.p}</td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">{row.w}</td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-slate-400">{row.d}</td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-red-500">{row.l}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-700 dark:text-slate-200">{row.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ANALYSIS TAB */}
            {activeTab === "analysis" && (
              <div className="space-y-6">
                {/* Match Analysis */}
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <ChartColumn className="h-4 w-4 text-emerald-500" />
                    Expert Analysis
                  </h4>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/50">
                    {locked ? (
                      <div className="flex flex-col items-center py-8 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
                          <Lock className="h-7 w-7 text-amber-500" />
                        </div>
                        <p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">Premium Content</p>
                        <p className="mt-1 max-w-xs text-xs text-slate-400">Unlock in-depth analysis, xG breakdowns, and expert reasoning for this prediction.</p>
                        <button onClick={onUpgrade} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm shadow-amber-500/20 transition hover:from-amber-600 hover:to-amber-700">
                          <Crown className="h-4 w-4" /> Unlock for Ksh 100
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{tip.analysis}</p>
                    )}
                  </div>
                </div>

                {/* Key Factors */}
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <Radio className="h-4 w-4 text-emerald-500" />
                    Key Factors
                  </h4>
                  <div className="mt-3 space-y-2">
                    {/* Every row below is a figure ESPN supplied. The panel used
                        to pair real labels with fixed strengths and xG values
                        drawn from `Math.random()`. */}
                    {[
                      homeStats
                        ? {
                            label: "Recent Form",
                            value: `${homeStats.won}W ${homeStats.drawn}D ${homeStats.lost}L in last ${homeStats.played}`,
                            strength: Math.round((homeStats.won / homeStats.played) * 100),
                            positive: homeStats.won >= homeStats.lost,
                          }
                        : null,
                      homeGoalsPerGame
                        ? {
                            label: "Goal Scoring",
                            value: `${homeGoalsPerGame} goals per game`,
                            strength: Math.min(100, Math.round((Number(homeGoalsPerGame) / 3) * 100)),
                            positive: true,
                          }
                        : null,
                      awayConcededPerGame
                        ? {
                            label: "Opponent Defence",
                            value: `${tip.awayTeam} concedes ${awayConcededPerGame} per game`,
                            strength: Math.min(100, Math.round((Number(awayConcededPerGame) / 3) * 100)),
                            positive: Number(awayConcededPerGame) >= 1,
                          }
                        : null,
                    ].filter((f): f is { label: string; value: string; strength: number; positive: boolean } => f !== null).map((f) => (
                      <div key={f.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{f.label}</p>
                            <p className="text-[10px] text-slate-400">{f.value}</p>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                            <div className={`h-full rounded-full ${f.positive ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${f.strength}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Team News */}
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Team News
                  </h4>
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-400 dark:border-slate-700">
                    No team news available for this fixture.
                  </div>
                </div>
              </div>
            )}

            {/* MARKETS TAB */}
            {activeTab === "markets" && (
              <div className="space-y-6">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    Betting Markets
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">Prices ESPN publishes for this fixture, across markets and books</p>
                </div>

                {/* Both blocks below are read from one source — ESPN's per-book
                    quotes — so they cannot disagree with each other. What this
                    replaced: a 1X2 / Over-Under / BTTS table whose prices were
                    multiplied out of our own (`oddsNum * 2.5`, `* 0.8`, `* 1.1`)
                    and a bookmaker table whose five brands were invented around
                    the same number. Neither is derived any more: a market
                    appears only when a book priced it, and BTTS is absent
                    because no feed here publishes it. */}
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mt-2">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    Best Odds Across Bookmakers
                  </h4>
                  <BookmakerCompare
                    homeTeam={tip.homeTeam}
                    awayTeam={tip.awayTeam}
                    league={tip.league}
                    kickoffAt={tip.kickoffAt ?? null}
                    reference={tip.espnRef ?? null}
                    publishedOdds={tip.odds}
                    bookmakerOdds={tip.bookmakerOdds ?? null}
                    selection={resolvePickOutcome(
                      tip.predictionType,
                      tip.prediction,
                      tip.homeTeam,
                      tip.awayTeam,
                    )}
                    stake={parseFloat(stakeInput) || 0}
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Sticky Bottom Bar */}
        <div className="relative z-10 shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 sm:px-6">
          {locked ? (
            <button onClick={onUpgrade} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm shadow-amber-500/20 transition hover:from-amber-600 hover:to-amber-700">
              <Crown className="h-4 w-4" />
              Unlock Premium — Ksh 100/day
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={onCopy}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={onAddToSlip}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition ${
                  inSlip
                    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    : "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:from-emerald-500 hover:to-emerald-700"
                }`}
              >
                <Ticket className="h-4 w-4" />
                {inSlip ? "Already in slip" : `Add to slip — ${tip.odds}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}