"use client";

import { useEffect, useState } from "react";
import { isTeamNewsBoard, type TeamNewsBoard } from "@/lib/espn-team-news";
import type { EspnRef } from "@/types/goaledge";

export type TipTeamNewsStatus = "idle" | "loading" | "ready" | "unavailable";

export interface TipTeamNews {
  status: TipTeamNewsStatus;
  injuries: TeamNewsBoard["injuries"];
  articles: TeamNewsBoard["articles"];
  message: string | null;
}

const EMPTY: TipTeamNews = { status: "idle", injuries: [], articles: [], message: null };

/**
 * ESPN-reported injuries and team-related articles for a tip, read from this
 * app's own team-news API via the tip's ESPN reference. Competitions whose
 * summaries carry no injury section honestly report none. Without a reference
 * it reports `unavailable`; nothing is invented.
 */
export function useTipTeamNews(
  reference: EspnRef | null | undefined,
  enabled = true,
): TipTeamNews {
  const league = typeof reference?.league === "string" ? reference.league : null;
  const eventId = typeof reference?.eventId === "string" ? reference.eventId : null;
  const key = `${league}/${eventId}`;
  // Loading/unavailable are derived from the request key rather than set
  // synchronously inside the effect, so the effect only records results.
  const [settled, setSettled] = useState<{ key: string; news: TipTeamNews } | null>(null);

  useEffect(() => {
    if (!enabled || !league || !eventId) return;
    const controller = new AbortController();
    let active = true;
    (async () => {
      try {
        const response = await fetch(
          `/api/sports/matches/${encodeURIComponent(league)}/${encodeURIComponent(eventId)}/news`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Team news HTTP ${response.status}`);
        const board: unknown = await response.json();
        if (!isTeamNewsBoard(board)) throw new Error("Invalid team news response");
        if (!active) return;
        setSettled({
          key,
          news: {
            status: board.status === "unavailable" ? "unavailable" : "ready",
            injuries: board.injuries,
            articles: board.articles,
            message: board.message,
          },
        });
      } catch {
        if (active && !controller.signal.aborted) {
          setSettled({ key, news: { ...EMPTY, status: "unavailable" } });
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, league, eventId, key]);

  if (!league || !eventId) return { ...EMPTY, status: "unavailable" };
  if (settled && settled.key === key) return settled.news;
  return { ...EMPTY, status: enabled ? "loading" : "idle" };
}
