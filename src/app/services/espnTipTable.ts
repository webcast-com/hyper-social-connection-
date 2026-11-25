"use client";

import { useEffect, useState } from "react";
import { isStandingsBoard, type StandingsBoard, type StandingGroup } from "@/lib/espn-standings";

export interface LeagueTableRow {
  pos: number;
  name: string;
  p: number | null;
  w: number | null;
  d: number | null;
  l: number | null;
  pts: number | null;
  highlight: boolean;
}

export type TipTableStatus = "idle" | "loading" | "ready" | "empty" | "unavailable";

const norm = (value: string) => value.trim().toLowerCase();
const num = (value: string | null | undefined): number | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Prefer the group listing both tip teams (conference/divisional tables), then either, then the first. */
function pickGroup(groups: StandingGroup[], homeTeam: string, awayTeam: string): StandingGroup | null {
  const contains = (group: StandingGroup, team: string) =>
    group.rows.some((row) => norm(row.team) === norm(team));
  return (
    groups.find((group) => contains(group, homeTeam) && contains(group, awayTeam)) ??
    groups.find((group) => contains(group, homeTeam) || contains(group, awayTeam)) ??
    groups[0] ??
    null
  );
}

/**
 * Map ESPN standings rows to the tip panel's table. Values are read from the
 * provider's own stat names (soccer: gamesPlayed/wins/ties/losses/points;
 * US sports report wins/losses without draws or points) — a missing figure
 * stays null and renders as a dash, never a made-up number.
 */
export function mapStandingsRows(board: StandingsBoard, homeTeam: string, awayTeam: string): LeagueTableRow[] {
  const group = pickGroup(board.groups, homeTeam, awayTeam);
  if (!group) return [];
  return group.rows.slice(0, 40).map((row, index) => {
    const value = (...keys: string[]): number | null => {
      for (const key of keys) {
        const parsed = num(row.values[key]);
        if (parsed !== null) return parsed;
      }
      return null;
    };
    const w = value("wins");
    const l = value("losses");
    const d = value("ties", "draws");
    return {
      pos: num(row.rank) ?? index + 1,
      name: row.team,
      p: value("gamesPlayed") ?? (w !== null && l !== null ? w + l + (d ?? 0) : null),
      w,
      d,
      l,
      pts: value("points"),
      highlight: norm(row.team) === norm(homeTeam) || norm(row.team) === norm(awayTeam),
    };
  });
}

/**
 * Returns league standings rows for the two teams in a tip, read from this
 * app's own standings API (ESPN-backed). When the competition slug is missing
 * or standings cannot be resolved it reports an explicit status and an empty
 * array so the UI can render its empty state honestly.
 */
export function useTipLeagueTable(
  _league: string,
  homeTeam: string,
  awayTeam: string,
  enabled: boolean,
  leagueSlug?: string | null,
): { rows: LeagueTableRow[]; status: TipTableStatus } {
  const key = `${leagueSlug}/${homeTeam}/${awayTeam}`;
  // Loading/unavailable are derived from the request key rather than set
  // synchronously inside the effect, so the effect only records results.
  const [settled, setSettled] = useState<{ key: string; rows: LeagueTableRow[]; status: TipTableStatus } | null>(null);

  useEffect(() => {
    if (!enabled || !leagueSlug) return;
    const controller = new AbortController();
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/sports/standings/${encodeURIComponent(leagueSlug)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Standings HTTP ${response.status}`);
        const board: unknown = await response.json();
        if (!isStandingsBoard(board, leagueSlug, null)) throw new Error("Invalid standings response");
        if (!active) return;
        const rows = board.status === "ready" ? mapStandingsRows(board, homeTeam, awayTeam) : [];
        setSettled({ key, rows, status: rows.length ? "ready" : board.status === "ready" ? "empty" : board.status });
      } catch {
        if (active && !controller.signal.aborted) setSettled({ key, rows: [], status: "unavailable" });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, leagueSlug, homeTeam, awayTeam, key]);

  if (!leagueSlug) return { rows: [], status: "unavailable" };
  if (settled && settled.key === key) return { rows: settled.rows, status: settled.status };
  return { rows: [], status: enabled ? "loading" : "idle" };
}
