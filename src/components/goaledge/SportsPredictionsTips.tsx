"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { OddsBoard } from "@/lib/espn-odds";
import type { Tip, ApiStatus, LiveOddsData, OddsComparison } from "@/types/goaledge";
import { matchToTip } from "@/lib/goaledge-tip";
import { TipsSection } from "./TipsSection";
import { TipDetailPanel } from "./TipDetailPanel";
import { TipResults } from "./TipResults";
import { OddsCompareModal } from "./OddsCompareModal";
import { ShareModal } from "./ShareModal";
import { toast } from "@/lib/toast";

export default function SportsPredictionsTips({
  initial,
}: {
  initial: OddsBoard;
}) {
  const [selectedDate, setSelectedDate] = useState(0);
  const [boardsByDay, setBoardsByDay] = useState<Record<number, OddsBoard>>(() => ({ 0: initial }));
  const [loading, setLoading] = useState(false);
  const fetchSeq = useRef(0);

  const activeBoard = boardsByDay[selectedDate] ?? initial;
  const tips = useMemo(() => activeBoard.matches.map(matchToTip), [activeBoard.matches]);
  const leagues = useMemo(() => {
    const names = Array.from(new Set(tips.map((t) => t.league)));
    return ["All", ...names];
  }, [tips]);

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

  const fetchDay = useCallback(async (day: number, refresh = false) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const url = refresh ? "/api/sports/predictions?refresh=1" : "/api/sports/predictions";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(day > 0 ? { dayOffset: day } : {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const board = (await res.json()) as OddsBoard;
      if (seq !== fetchSeq.current) return;
      setBoardsByDay((prev) => ({ ...prev, [day]: board }));
    } catch {
      if (seq !== fetchSeq.current) return;
      toast.error("Could not load tips for this date");
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  const handleSelectDate = useCallback(
    (day: number) => {
      setSelectedDate(day);
      setActiveFilter("All");
      if (!boardsByDay[day]) {
        void fetchDay(day);
      }
    },
    [boardsByDay, fetchDay],
  );

  const apiStatus: ApiStatus = loading
    ? "loading"
    : activeBoard.status === "ready" || activeBoard.status === "partial" || activeBoard.status === "empty"
      ? "live"
      : "offline";

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
        loading={loading}
        apiStatus={apiStatus}
        apiNote={activeBoard.status === "partial" ? "Some ESPN feeds were unavailable." : null}
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
        onSetSelectedDate={handleSelectDate}
        onSetActiveFilter={setActiveFilter}
        onSetSelectedTip={setSelectedTip}
        onAddToSlip={onAddToSlip}
        onCopyTip={onCopyTip}
        onSetTipVotes={setTipVotes}
        onSetStakeCalcOpen={setStakeCalcOpen}
        onSetCalcStake={setCalcStake}
        onSetBookmarkedTips={setBookmarkedTips}
        onFetchTips={() => void fetchDay(selectedDate, true)}
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
