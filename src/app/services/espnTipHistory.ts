"use client";

import { useEffect, useState } from "react";
import { historyOutcome, type HistoryGame } from "@/lib/espn-match-history";
import type { EspnRef, FormStats, HeadToHeadRecord } from "@/types/goaledge";
import type { FormResult } from "./espnTipForm";

export type TipHistoryStatus = "idle" | "loading" | "ready" | "unavailable";

export interface TipMatchHistory {
  status: TipHistoryStatus;
  homeForm: FormResult[];
  awayForm: FormResult[];
  homeStats: FormStats | null;
  awayStats: FormStats | null;
  headToHead: string | null;
  headToHeadRecord: HeadToHeadRecord | null;
  /** Completed meetings between the two sides, most recent first (max 5). */
  meetings: HistoryGame[];
}

const EMPTY: TipMatchHistory = {
  status: "idle",
  homeForm: [],
  awayForm: [],
  homeStats: null,
  awayStats: null,
  headToHead: null,
  headToHeadRecord: null,
  meetings: [],
};

const norm = (value: string) => value.trim().toLowerCase();
const numericScore = (value: string) => /^\d{1,5}$/.test(value);

/** Minimal structural check on one API game; anything malformed is dropped, not repaired. */
function validGame(raw: unknown): raw is HistoryGame {
  if (raw === null || typeof raw !== "object") return false;
  const game = raw as Record<string, unknown>;
  return (
    typeof game.id === "string" &&
    typeof game.kickoff === "string" &&
    Number.isFinite(Date.parse(game.kickoff)) &&
    (game.status === null || typeof game.status === "string") &&
    Array.isArray(game.teams) &&
    game.teams.length === 2 &&
    game.teams.every((entry) => {
      const team = (entry ?? {}) as Record<string, unknown>;
      return (
        typeof team.id === "string" &&
        typeof team.name === "string" &&
        typeof team.score === "string" &&
        (team.side === null || typeof team.side === "string") &&
        (team.winner === null || typeof team.winner === "boolean") &&
        (team.shootout === null || typeof team.shootout === "string")
      );
    })
  );
}

/** W/D/L chips and totals from ESPN-reported completed games only. */
export function buildFormStats(games: HistoryGame[], teamId: string): { form: FormResult[]; stats: FormStats | null } {
  const form: FormResult[] = [];
  let played = 0, won = 0, drawn = 0, lost = 0, goalsFor = 0, goalsAgainst = 0, cleanSheets = 0;
  for (const game of games) {
    const outcome = historyOutcome(game, teamId);
    const team = game.teams.find((entry) => entry.id === teamId);
    const opponent = game.teams.find((entry) => entry.id !== teamId);
    if (!outcome || !team || !opponent || !numericScore(team.score) || !numericScore(opponent.score)) continue;
    form.push(outcome);
    played += 1;
    if (outcome === "W") won += 1;
    else if (outcome === "D") drawn += 1;
    else lost += 1;
    goalsFor += Number(team.score);
    goalsAgainst += Number(opponent.score);
    if (Number(opponent.score) === 0) cleanSheets += 1;
  }
  return {
    form,
    stats: played > 0 ? { played, won, drawn, lost, goalsFor, goalsAgainst, cleanSheets } : null,
  };
}

/** Tally mutual meetings from the home side's perspective; undecidable games are listed but not tallied. */
export function buildHeadToHead(
  meetings: HistoryGame[],
  homeTeamId: string,
  homeTeam: string,
  awayTeam: string,
): { text: string | null; record: HeadToHeadRecord | null } {
  let homeWins = 0, awayWins = 0, draws = 0;
  for (const game of meetings) {
    const outcome = historyOutcome(game, homeTeamId);
    if (outcome === "W") homeWins += 1;
    else if (outcome === "L") awayWins += 1;
    else if (outcome === "D") draws += 1;
  }
  const games = homeWins + awayWins + draws;
  if (!games) return { text: null, record: null };
  return {
    text: `Last ${games} ESPN-recorded meeting${games === 1 ? "" : "s"}: ${homeTeam} won ${homeWins}, ${draws} drawn, ${awayTeam} won ${awayWins}.`,
    record: { games, homeWins, awayWins, draws },
  };
}

/**
 * Recent results and head-to-head for a tip, read from this app's own match
 * history API (ESPN team schedules, completed fixtures before kickoff only).
 * Without an ESPN reference it stays idle; failures report `unavailable` so
 * the panel can keep its honest empty states. Nothing is invented.
 */
export function useTipMatchHistory(
  reference: EspnRef | null | undefined,
  homeTeam: string,
  awayTeam: string,
  enabled = true,
): TipMatchHistory {
  const league = typeof reference?.league === "string" ? reference.league : null;
  const eventId = typeof reference?.eventId === "string" ? reference.eventId : null;
  const key = `${league}/${eventId}/${homeTeam}/${awayTeam}`;
  // Loading/unavailable are derived from the request key rather than set
  // synchronously inside the effect, so the effect only records results.
  const [settled, setSettled] = useState<{ key: string; board: TipMatchHistory } | null>(null);

  useEffect(() => {
    if (!enabled || !league || !eventId) return;
    const controller = new AbortController();
    let active = true;
    (async () => {
      try {
        const response = await fetch(
          `/api/sports/matches/${encodeURIComponent(league)}/${encodeURIComponent(eventId)}/history`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`History HTTP ${response.status}`);
        const payload: unknown = await response.json();
        const board = (payload ?? {}) as Record<string, unknown>;
        if (!["ready", "partial", "unavailable"].includes(String(board.status)) || !Array.isArray(board.teams)) {
          throw new Error("Invalid history response");
        }
        const teams = board.teams.flatMap((entry) => {
          const team = (entry ?? {}) as Record<string, unknown>;
          return typeof team.teamId === "string" && typeof team.name === "string" && Array.isArray(team.games)
            ? [{ teamId: team.teamId, name: team.name, games: team.games.filter(validGame).slice(0, 5) }]
            : [];
        });
        const meetings = (Array.isArray(board.headToHead) ? board.headToHead : []).filter(validGame).slice(0, 5);
        // Match board teams to the tip's sides by ESPN display name; with one
        // exact match the remaining team takes the other side. No guessing.
        let home = teams.find((team) => norm(team.name) === norm(homeTeam)) ?? null;
        let away = teams.find((team) => norm(team.name) === norm(awayTeam)) ?? null;
        if (teams.length === 2) {
          if (home && !away) away = teams.find((team) => team.teamId !== home!.teamId) ?? null;
          if (away && !home) home = teams.find((team) => team.teamId !== away!.teamId) ?? null;
        }
        const homeSide = home ? buildFormStats(home.games, home.teamId) : { form: [], stats: null };
        const awaySide = away ? buildFormStats(away.games, away.teamId) : { form: [], stats: null };
        const h2h = home
          ? buildHeadToHead(meetings, home.teamId, homeTeam, awayTeam)
          : { text: null, record: null };
        if (!active) return;
        setSettled({
          key,
          board: {
            status: "ready",
            homeForm: homeSide.form,
            awayForm: awaySide.form,
            homeStats: homeSide.stats,
            awayStats: awaySide.stats,
            headToHead: h2h.text,
            headToHeadRecord: h2h.record,
            meetings,
          },
        });
      } catch {
        if (active && !controller.signal.aborted) setSettled({ key, board: { ...EMPTY, status: "unavailable" } });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, league, eventId, homeTeam, awayTeam, key]);

  if (!league || !eventId) return { ...EMPTY, status: "unavailable" };
  if (settled && settled.key === key) return settled.board;
  return { ...EMPTY, status: enabled ? "loading" : "idle" };
}
