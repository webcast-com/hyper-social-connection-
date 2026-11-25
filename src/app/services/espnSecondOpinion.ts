export type PickOutcome = "home" | "away" | "draw" | "over" | "under" | "unknown";

/**
 * Resolve a human-readable tip prediction into a normalized outcome key
 * used by odds comparison/market views.
 */
export function resolvePickOutcome(
  predictionType: string,
  prediction: string,
  homeTeam: string,
  awayTeam: string,
): PickOutcome {
  const p = prediction.toLowerCase();
  const type = predictionType.toLowerCase();

  if (type.includes("over") || p.startsWith("over")) return "over";
  if (type.includes("under") || p.startsWith("under")) return "under";
  if (p.includes("draw") || p === "x") return "draw";

  const home = homeTeam.toLowerCase();
  const away = awayTeam.toLowerCase();
  if (home && p.includes(home)) return "home";
  if (away && p.includes(away)) return "away";
  if (p.includes("home") || p === "1") return "home";
  if (p.includes("away") || p === "2") return "away";
  return "unknown";
}
