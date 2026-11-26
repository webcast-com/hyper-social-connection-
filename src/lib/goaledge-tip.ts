import type { OddsMatch } from "@/lib/espn-odds";
import type { SportsPrediction } from "@/lib/sports";
import type { Tip } from "@/types/goaledge";

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

export function flagForSport(sport: string): string {
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

export function matchToTip(match: OddsMatch): Tip {
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

export function predictionToTip(prediction: SportsPrediction): Tip {
  if (prediction.tip) return prediction.tip;

  const numericOdds = prediction.winOdds ? Number(prediction.winOdds) : NaN;
  const confidence =
    Number.isFinite(numericOdds) && numericOdds > 1
      ? Math.max(1, Math.min(99, Math.round((1 / numericOdds) * 100)))
      : 50;

  return {
    id: prediction.id,
    homeTeam: prediction.homeTeam,
    awayTeam: prediction.awayTeam,
    league: prediction.competition || prediction.federation,
    country: prediction.federation.toUpperCase(),
    flag: flagForSport(prediction.federation),
    matchTime: formatMatchTime(prediction.startAt),
    kickoffAt: prediction.startAt,
    odds: prediction.winOdds ?? "—",
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    prediction: prediction.prediction,
    predictionType: prediction.market || "1X2",
    status: "upcoming",
    isPremium: false,
    tipster: prediction.source === "espn" ? "ESPN odds" : "Hyper Predictions",
    homeTeamCrest: null,
    awayTeamCrest: null,
    homeForm: [],
    awayForm: [],
    analysis: "Match prediction from Hyper Predictions.",
    espnRef: null,
    bookmakerOdds: null,
  };
}
