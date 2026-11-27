"use client";

import { BarChart3, ShieldCheck } from "lucide-react";
import type { EspnRef, TipBookmakerOdds } from "@/types/goaledge";
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
  /** The feed bookmaker's full quote (e.g. DraftKings); omitted markets are not shown. */
  bookmakerOdds?: TipBookmakerOdds | null;
};

const price = (value: number | null | undefined): string | null =>
  typeof value === "number" && Number.isFinite(value) && value > 1 ? value.toFixed(2) : null;

/** A handicap line keeps its sign so "-3.5 (home)" and "+3.5 (away)" read as quoted. */
const line = (value: number | null | undefined): string | null =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value}`
    : null;

function MarketRow({ market, cells }: { market: string; cells: Array<{ label: string; value: string }> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2.5 first:border-t-0 first:pt-0 last:pb-0 dark:border-slate-700/60">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{market}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {cells.map((cell) => (
          <span
            key={`${market}-${cell.label}`}
            className="inline-flex items-baseline gap-1 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200 dark:bg-slate-900/50 dark:ring-slate-700"
          >
            <span className="text-[10px] font-medium text-slate-400">{cell.label}</span>
            <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{cell.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The bookmaker's quoted markets, rendered only from published figures. */
function BookmakerMarkets({
  quote,
  homeTeam,
  awayTeam,
}: {
  quote: TipBookmakerOdds;
  homeTeam: string;
  awayTeam: string;
}) {
  const rows: Array<{ market: string; cells: Array<{ label: string; value: string }> }> = [];

  const moneyline = [
    { label: homeTeam, value: price(quote.home) },
    { label: "Draw", value: price(quote.draw) },
    { label: awayTeam, value: price(quote.away) },
  ].filter((cell): cell is { label: string; value: string } => cell.value !== null);
  if (moneyline.length) rows.push({ market: "Money line", cells: moneyline });

  const homeLine = line(quote.spread);
  const awayLine = typeof quote.spread === "number" && Number.isFinite(quote.spread) ? line(-quote.spread) : null;
  const spreadCells = [
    homeLine !== null
      ? {
          label: `${homeTeam} ${homeLine}`,
          value: price(quote.spreadHomeOdds) ?? "line only",
        }
      : null,
    awayLine !== null
      ? {
          label: `${awayTeam} ${awayLine}`,
          value: price(quote.spreadAwayOdds) ?? "line only",
        }
      : null,
  ].filter((cell): cell is { label: string; value: string } => cell !== null);
  if (spreadCells.length) rows.push({ market: "Spread", cells: spreadCells });

  const total =
    typeof quote.overUnder === "number" && Number.isFinite(quote.overUnder) && quote.overUnder > 0
      ? quote.overUnder
      : null;
  if (total !== null) {
    rows.push({
      market: `Total (O/U ${total})`,
      cells: [
        { label: `Over ${total}`, value: price(quote.overOdds) ?? "line only" },
        { label: `Under ${total}`, value: price(quote.underOdds) ?? "line only" },
      ],
    });
  }

  if (!rows.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-500" />
          {quote.provider ?? "Bookmaker"} markets
        </p>
        <p className="text-[10px] font-medium text-slate-400">Decimal odds</p>
      </div>
      <div className="mt-3">
        {rows.map((row) => (
          <MarketRow key={row.market} market={row.market} cells={row.cells} />
        ))}
      </div>
    </div>
  );
}

export function BookmakerCompare({
  homeTeam,
  awayTeam,
  publishedOdds,
  selection,
  stake,
  bookmakerOdds,
}: Props) {
  const oddsNum = Number.parseFloat(publishedOdds);
  const validOdds = Number.isFinite(oddsNum) && oddsNum > 1;
  const potential = validOdds && stake > 0 ? oddsNum * stake : null;

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
            {potential !== null && (
              <p className="text-[11px] text-slate-400">
                ${stake.toLocaleString("en-US")} → ${potential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
        </div>
      </div>

      {bookmakerOdds && (
        <BookmakerMarkets quote={bookmakerOdds} homeTeam={homeTeam} awayTeam={awayTeam} />
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Per-bookmaker prices are shown only when available from the data source. No bookmaker odds are fabricated.
      </p>
    </div>
  );
}
