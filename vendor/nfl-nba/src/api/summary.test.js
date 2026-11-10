import { describe, expect, it } from "vitest";
import { normalizeSummary } from "./espn";

const competitors = [
  { homeAway: "home", score: "24", team: { id: "12", displayName: "Home Team", abbreviation: "HME" }, linescores: [{ displayValue: "7" }, { displayValue: "17" }] },
  { homeAway: "away", score: "20", team: { id: "21", displayName: "Away Team", abbreviation: "AWY" }, linescores: [{ displayValue: "10" }, { displayValue: "10" }] },
];
const header = { competitions: [{ competitors, status: { type: { state: "in", shortDetail: "2nd" } }, venue: { fullName: "Test Arena" } }] };

describe("ESPN match summaries", () => {
  it("keeps the full NBA play-by-play, period, clock, team ID, type and home-away score", () => {
    const plays = Array.from({ length: 100 }, (_, i) => ({
      id: String(i + 1), period: { number: i < 50 ? 1 : 2, displayValue: i < 50 ? "1st Quarter" : "2nd Quarter" },
      clock: { displayValue: "1:23" }, team: { id: "12" }, text: `Play ${i}`, type: { text: "Jump Shot" }, homeScore: i, awayScore: 0,
    }));
    const summary = normalizeSummary({ header, plays, scoringPlays: [plays[0]] });
    expect(summary.plays).toHaveLength(100);
    expect(summary.plays[0]).toMatchObject({ period: "1st Quarter", clock: "1:23", team: "HME", score: "0-0", type: "Jump Shot" });
    expect(summary.plays[99].text).toBe("Play 99");
    expect(summary.playsKind).toBe("full");
    expect(summary.teams[0].linescores).toEqual(["7", "17"]);
  });

  it("reads NFL previous and current drives, resolves teams, preserves context, and deduplicates IDs", () => {
    const play = { id: "1", text: "A pass for 10 yards.", period: { number: 2 }, clock: { displayValue: "3:14" }, start: { downDistanceText: "2nd & 8 at AWY 35", team: { id: "21" } }, type: { text: "Pass Reception" }, homeScore: 7, awayScore: 0 };
    const summary = normalizeSummary({ header, drives: { previous: [{ id: "d1", team: { id: "21" }, description: "6 plays, 40 yards, 3:10", displayResult: "Touchdown", plays: [play] }], current: { id: "d2", team: { id: "12" }, description: "1 play", plays: [play, { id: "2", text: "Run for no gain.", team: { id: "12" } }] } }, scoringPlays: [play] });
    expect(summary.plays).toHaveLength(2);
    expect(summary.plays[0]).toMatchObject({ period: "Period 2", team: "AWY", downDistance: "2nd & 8 at AWY 35", score: "7-0", type: "Pass Reception" });
    expect(summary.drives).toMatchObject([{ team: "AWY", description: "6 plays, 40 yards, 3:10", result: "Touchdown" }, { team: "HME" }]);
  });

  it("falls back honestly to scoring plays only and tolerates missing values", () => {
    const summary = normalizeSummary({ scoringPlays: [{ id: "1", text: "Touchdown" }] });
    expect(summary.playsKind).toBe("scoring");
    expect(summary.plays[0]).toMatchObject({ text: "Touchdown", score: null, team: null, period: null });
    expect(summary.teamStats).toEqual([]);
    expect(summary.playerTables).toEqual([]);
    expect(summary.teams).toEqual([]);
  });

  it("maps supplied team and player box scores to the proper home and away sides", () => {
    const summary = normalizeSummary({ header, gameInfo: { attendance: 0, officials: [{ fullName: "Referee One" }] },
      boxscore: { teams: [
        { team: { id: "21" }, statistics: [{ name: "yards", label: "Total yards", displayValue: "300" }] },
        { team: { id: "12" }, statistics: [{ name: "yards", label: "Total yards", displayValue: "0" }] },
      ], players: [{ team: { id: "12", displayName: "Home Team" }, statistics: [{ displayName: "Passing", labels: ["C/ATT", "YDS", "TD"], athletes: [{ athlete: { id: "44", displayName: "Quarterback" }, stats: ["20/30", "230", "2"] }] }] }] } });
    expect(summary.teamStats).toEqual([{ label: "Total yards", home: "0", away: "300" }]);
    expect(summary.playerTables[0]).toMatchObject({ team: "Home Team", label: "Passing", labels: ["C/ATT", "YDS", "TD"], athletes: [{ name: "Quarterback", stats: ["20/30", "230", "2"] }] });
    expect(summary.gameInfo).toMatchObject({ attendance: "0", officials: ["Referee One"] });
  });
});
