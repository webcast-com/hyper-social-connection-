"use client";

import { ShieldCheck } from "lucide-react";
import type { EspnRef } from "@/types/goaledge";
import type { PickOutcome } from "@/app/services/espnSecondOpinion";

type Props = {
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffAt?: string | null;
  reference?: EspnRef | null;
  publishedOdds: string;
  selection: PickOutcome;
  stake: number;
};

export function BookmakerCompare({
  homeTeam,
  awayTeam,
  publishedOdds,
  selection,
  stake,
}: Props) {
  const oddsNum = Number.parseFloat(publishedOdds);
  const validOdds = Number.isFinite(oddsNum) && oddsNum > 1;
  const potential = validOdds && stake > 0 ? (oddsNum * stake).toFixed(2) : null;

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-400">Published price</p>
            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {homeTeam} vs {awayTeam}
            </p>
            {selection !== "unknown" && (
              <p className="mt-0.5 text-[11px] text-slate-400">Selection: {selection}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
              {validOdds ? oddsNum.toFixed(2) : "—"}
            </p>
            {potential && (
              <p className="text-[11px] text-slate-400">
                Ksh {stake.toLocaleString()} → Ksh {Number(potential).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Per-bookmaker prices are shown only when available from the data source. No bookmaker odds are fabricated.
      </p>
    </div>
  );
}
