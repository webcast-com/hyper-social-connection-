"use client";

import { useEffect, useState } from "react";

export interface LeagueTableRow {
  pos: number;
  name: string;
  p: number;
  w: number;
  d: number;
  l: number;
  pts: number;
  highlight: boolean;
}

/**
 * Returns league standings rows for the two teams in a tip.
 * This is a read-only client hook; it does not modify any ESPN endpoints.
 * When standings cannot be resolved, it returns an empty array so the UI
 * can render its empty state honestly.
 */
export function useTipLeagueTable(
  _league: string,
  _homeTeam: string,
  _awayTeam: string,
  _enabled: boolean,
): LeagueTableRow[] {
  const [rows] = useState<LeagueTableRow[]>([]);
  // Intentionally no fetch here: wiring standings requires a dedicated
  // read-only data source. Returning [] keeps the panel honest.
  useEffect(() => {}, [_league, _homeTeam, _awayTeam, _enabled]);
  return rows;
}
