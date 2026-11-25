"use client";

import { useCallback, useMemo, useState } from "react";
import type { OddsBoard, OddsMatch } from "@/lib/espn-odds";
import type { Tip, ApiStatus, LiveOddsData, OddsComparison } from "@/types/goaledge";
import { TipsSection } from "./TipsSection";
import { TipDetailPanel } from "./TipDetailPanel";
import { TipResults } from "./TipResults";
import { OddsCompareModal } from "./OddsCompareModal";
import { ShareModal } from "./ShareModal";
import { toast } from "@/lib/toast";

const SPORT_FLAG: Record<string, string> = {
  football: "⚽",
  soccer: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  hockey: "🏒",
  nfl: "🏈",
  rugby: "🏉",
  cricket: "🏏",
  tennis: "🎾",
  mma: "🥊",
  golf: "⛳",
};

function flagForSport(sport: string): string {
  return SPORT_FLAG[sport.toLowerCase()] ?? "🏟️";
}

function impliedProbs(match: OddsMatch): { home: number; draw: number; away: number } {
  const h = typeof match.odds.home === "number" && match.odds.home > 1 ? 1 / match.odds.home : 0;
  const d = typeof match.odds.draw === "number" && match.odds.draw > 1 ? 1 / match.odds.draw : 0;
  const a = typeof match.odds.away === "number" && match.odds.away > 1 ? 1 / match.odds.away : 0;
  const sum = h + d + a;
  if (sum <= 0) return { home: 0, draw: 0, away: 0 };
  return { home: h / sum, draw: d / sum, away: a / sum };
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 70) return "High";
  if (confidence >= 55) return "Medium";
  return "Low";
}

function pickPrediction(match: OddsMatch): { prediction: string; predictionType: string; confidence: number } {
  const probs = impliedProbs(match);
  const candidates: Array<{ key: "home" | "draw" | "away"; label: string; prob: number }> = [
    { key: "home", label: `${match.home_team} to win`, prob: probs.home },
    { key: "draw", label: "Draw", prob: probs.draw },
    { key: "away", label: `${match.away_team} to win`, prob: probs.away },
  ];
  candidates.sort((a, b) => b.prob - a.prob);
  const best = candidates[0];
  const confidence = Math.max(1, Math.min(99, Math.round(best.prob * 100)));
  return { prediction: best.label, predictionType: "1X2", confidence };
}

function formatMatchTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month}, ${hh}:${mm} UTC`;
}

function matchToTip(match: OddsMatch): Tip {
  const { prediction, predictionType, confidence } = pickPrediction(match);
  const bestOdds = [match.odds.home, match.odds.draw, match.odds.away]
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 1)
    .sort((a, b) => a - b)[0];
  const oddsStr = typeof bestOdds === "number" ? bestOdds.toFixed(2) : "—";

  return {
    id: match.id,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    league: match.league,
    country: match.sport.toUpperCase(),
    flag: flagForSport(match.sport),
    matchTime: formatMatchTime(match.kickoff),
    kickoffAt: match.kickoff,
    odds: oddsStr,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    prediction,
    predictionType,
    status: "upcoming",
    isPremium: Boolean(match.is_premium),
    tipster: match.odds.provider ? `${match.odds.provider} odds` : "ESPN odds",
    homeTeamCrest: match.home_logo ?? null,
    awayTeamCrest: match.away_logo ?? null,
    homeForm: [],
    awayForm: [],
    analysis: `Odds reported by ESPN${match.odds.provider ? ` via ${match.odds.provider}` : ""}. Prices are bookmaker odds, not a model prediction, and may change.`,
    espnRef: match.details
      ? { sport: match.sport, league: match.details.league, eventId: String(match.details.eventId) }
      : null,
    // The feed bookmaker's full quote (e.g. DraftKings): money line, spread
    // with per-side prices and total (O/U). Passed through untouched so the
    // Markets tab can show every market the book actually priced.
    bookmakerOdds: {
      provider: match.odds.provider ?? null,
      home: match.odds.home ?? null,
      draw: match.odds.draw ?? null,
      away: match.odds.away ?? null,
      spread: match.odds.spread ?? null,
      spreadHomeOdds: match.odds.spread_home_odds ?? null,
      spreadAwayOdds: match.odds.spread_away_odds ?? null,
      overUnder: match.odds.over_under ?? null,
      overOdds: match.odds.over_odds ?? null,
      underOdds: match.odds.under_odds ?? null,
    },
  };
}

export default function SportsPredictionsTips({
  initial,
}: {
  initial: OddsBoard;
}) {
  const tips = useMemo(() => initial.matches.map(matchToTip), [initial.matches]);
  const leagues = useMemo(() => {
    const names = Array.from(new Set(tips.map((t) => t.league)));
    return ["All", ...names];
  }, [tips]);

  const [selectedDate, setSelectedDate] = useState(0);
  const [activeFilter, setActiveFilter] = useState("All");
  const [bookmarkedTips, setBookmarkedTips] = useState<Set<string>>(new Set());
  const [betSlipIds, setBetSlipIds] = useState<string[]>([]);
  const [tipVotes, setTipVotes] = useState<Record<string, "up" | "down">>({});
  const [liveOdds] = useState<Record<string, LiveOddsData>>({});
  const [stakeCalcOpen, setStakeCalcOpen] = useState<string | null>(null);
  const [calcStake, setCalcStake] = useState("100");
  const [selectedTip, setSelectedTip] = useState<Tip | null>(null);
  const [compareTip, setCompareTip] = useState<Tip | null>(null);
  const [shareTip, setShareTip] = useState<Tip | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "won" | "lost" | "void">("all");
  const [historyPeriod, setHistoryPeriod] = useState<"week" | "month" | "all">("all");

  const apiStatus: ApiStatus =
    initial.status === "ready" || initial.status === "partial" ? "live" : "offline";

  const filteredTips = useMemo(() => {
    let list = tips;
    if (activeFilter === "Saved") {
      list = list.filter((t) => bookmarkedTips.has(t.id));
    } else if (activeFilter !== "All") {
      list = list.filter((t) => t.league === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.homeTeam.toLowerCase().includes(q) ||
          t.awayTeam.toLowerCase().includes(q) ||
          t.league.toLowerCase().includes(q) ||
          t.prediction.toLowerCase().includes(q),
      );
    }
    return list;
  }, [tips, activeFilter, bookmarkedTips, searchQuery]);

  const onAddToSlip = useCallback((tip: Tip) => {
    setBetSlipIds((prev) =>
      prev.includes(tip.id) ? prev.filter((id) => id !== tip.id) : [...prev, tip.id],
    );
  }, []);

  const onCopyTip = useCallback(async (tip: Tip) => {
    const text = `${tip.homeTeam} vs ${tip.awayTeam} — ${tip.prediction} @ ${tip.odds} (${tip.confidence}% confidence)`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Tip copied");
    } catch {
      toast.error("Could not copy tip");
    }
  }, []);

  const oddsComparisons = useMemo<Record<string, OddsComparison>>(() => ({}), []);

  return (
    <div className="min-w-0">
      <TipsSection
        loading={false}
        apiStatus={apiStatus}
        apiNote={initial.status === "partial" ? "Some ESPN feeds were unavailable." : null}
        tipsCount={tips.length}
        selectedDate={selectedDate}
        leagues={leagues}
        activeFilter={activeFilter}
        bookmarkedTips={bookmarkedTips}
        filteredTips={filteredTips}
        betSlipIds={betSlipIds}
        tipVotes={tipVotes}
        liveOdds={liveOdds}
        stakeCalcOpen={stakeCalcOpen}
        calcStake={calcStake}
        onSetSelectedDate={setSelectedDate}
        onSetActiveFilter={setActiveFilter}
        onSetSelectedTip={setSelectedTip}
        onAddToSlip={onAddToSlip}
        onCopyTip={onCopyTip}
        onSetTipVotes={setTipVotes}
        onSetStakeCalcOpen={setStakeCalcOpen}
        onSetCalcStake={setCalcStake}
        onSetBookmarkedTips={setBookmarkedTips}
        onFetchTips={() => window.location.reload()}
        onSetSearchOpen={setSearchOpen}
        onSeeAll={() => setActiveFilter("All")}
        onSetCompareTip={setCompareTip}
        oddsComparisons={oddsComparisons}
      />

      <TipResults
        historyFilter={historyFilter}
        historyPeriod={historyPeriod}
        onSetHistoryFilter={setHistoryFilter}
        onSetHistoryPeriod={setHistoryPeriod}
        tips={[]}
        performance={null}
        loading={false}
        sourceNote="Settled results appear here when available."
      />

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-24" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search teams, leagues, predictions..."
              className="w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm outline-none focus:border-emerald-400 dark:border-slate-700 dark:text-white"
            />
            <p className="mt-2 text-xs text-slate-400">Filtering {tips.length} tips</p>
          </div>
        </div>
      )}

      {selectedTip && (
        <TipDetailPanel
          tip={selectedTip}
          betSlipIds={new Set(betSlipIds)}
          isPremium={false}
          onClose={() => setSelectedTip(null)}
          onAddToSlip={() => onAddToSlip(selectedTip)}
          onCopy={() => void onCopyTip(selectedTip)}
          onShare={() => setShareTip(selectedTip)}
          isBookmarked={bookmarkedTips.has(selectedTip.id)}
          onToggleBookmark={() =>
            setBookmarkedTips((prev) => {
              const next = new Set(prev);
              if (next.has(selectedTip.id)) next.delete(selectedTip.id);
              else next.add(selectedTip.id);
              return next;
            })
          }
          onUpgrade={() => toast.info("Premium is not available in this build.")}
          allTips={tips}
        />
      )}

      <OddsCompareModal
        tip={compareTip}
        onClose={() => setCompareTip(null)}
        comparison={compareTip ? oddsComparisons[compareTip.id] ?? null : null}
      />

      <ShareModal
        open={shareTip !== null}
        tip={shareTip}
        onClose={() => setShareTip(null)}
      />
    </div>
  );
}
