import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MatchPage from "./MatchPage";
import { loadMatchSummary, normalizeSummary } from "../api/espn";

vi.mock("../api/espn", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isEspnDisabled: () => false,
    loadMatchSummary: vi.fn(),
  };
});

beforeEach(() => {
  loadMatchSummary.mockReset();
  loadMatchSummary.mockResolvedValue({ plays: [], teams: [], venue: null, state: null });
});

afterEach(cleanup);

const renderAt = (path, sport = "basketball") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/basketball/match/:matchId" element={<MatchPage sport={sport} />} />
        <Route path="/nfl/match/:matchId" element={<MatchPage sport={sport} />} />
      </Routes>
    </MemoryRouter>
  );

const heroText = (container) => container.querySelector(".sh-match-hero")?.textContent ?? "";

describe("commentary page", () => {
  it("renders a demo game from bundled data while ESPN loads behind it", () => {
    const { container } = renderAt("/basketball/match/1");
    expect(heroText(container)).toContain("Boston Celtics");
    expect(heroText(container)).toContain("84");
    expect(container.querySelector(".sh-commentary li")).toBeTruthy();
    expect(loadMatchSummary).toHaveBeenCalledWith("nba", "1");
  });

  it("styles a finished demo game as final, not upcoming", () => {
    const { container } = renderAt("/basketball/match/4");
    const chip = container.querySelector(".sh-detail-chip");
    expect(chip.textContent).toBe("Final");
    expect(chip.className).toContain("is-final");
  });

  it("keeps a scheduled game's commentary panel instead of an error", () => {
    const { container } = renderAt("/basketball/match/8");
    expect(heroText(container)).toContain("UConn Huskies");
    expect(container.textContent).toContain("Commentary starts at");
    expect(container.textContent).not.toContain("We couldn't find that match");
  });

  it("asks the competition's feed for a college game", () => {
    renderAt("/basketball/match/7?competition=ncaam");
    expect(loadMatchSummary).toHaveBeenCalledWith(
      "mens-college-basketball",
      "7"
    );
  });

  it("shows the hero from ESPN even when the summary has no plays", async () => {
    loadMatchSummary.mockResolvedValue({
      plays: [],
      state: "in",
      statusText: "2nd · 4:11",
      venue: "Cameron Indoor Stadium",
      teams: [
        { name: "Duke Blue Devils", abbreviation: "DUKE", homeAway: "home", score: "68", logo: null },
        {
          name: "North Carolina Tar Heels",
          abbreviation: "UNC",
          homeAway: "away",
          score: "65",
          logo: null,
        },
      ],
    });

    const { container } = renderAt("/basketball/match/401777999");

    await waitFor(() => expect(heroText(container)).toContain("Duke Blue Devils"));
    expect(heroText(container)).toContain("North Carolina Tar Heels");
    expect(container.textContent).toContain("Cameron Indoor Stadium");
    expect(container.querySelector(".sh-detail-chip").className).toContain("is-live");
    expect(container.textContent).toContain("has not published play-by-play");
    expect(container.textContent).not.toContain("We couldn't find that match");
  });

  it("renders ESPN plays with their clock, team and score", async () => {
    loadMatchSummary.mockResolvedValue({
      plays: [
        { clock: "Q1 08:12", team: "BOS", text: "Jayson Tatum hits a three.", score: "83-79" },
        { clock: "Q1 07:40", team: "NYK", text: "Jalen Brunson answers.", score: "83-81" },
      ],
      state: "post",
      statusText: "Final",
      venue: "TD Garden",
      teams: [
        { name: "Boston Celtics", abbreviation: "BOS", homeAway: "home", score: "84" },
        { name: "New York Knicks", abbreviation: "NYK", homeAway: "away", score: "81" },
      ],
    });

    const { container } = renderAt("/basketball/match/401888888");

    await waitFor(() => expect(container.querySelectorAll(".sh-commentary li")).toHaveLength(2));
    const first = container.querySelector(".sh-commentary li");
    expect(first.textContent).toContain("Q1 08:12");
    expect(first.textContent).toContain("Jayson Tatum hits a three.");
    expect(first.textContent).toContain("83-79");
    expect(container.querySelector(".sh-detail-chip").className).toContain("is-final");
    expect(container.textContent).toContain("ESPN play-by-play");
  });

  it("does not flash the missing-match state while the feed is in flight", () => {
    let resolve;
    loadMatchSummary.mockReturnValue(new Promise((done) => (resolve = done)));

    const { container } = renderAt("/nfl/match/401999999", "football");

    expect(container.textContent).toContain("Loading the play-by-play");
    expect(container.textContent).not.toContain("We couldn't find that match");
    resolve({ plays: [], teams: [], venue: null, state: null });
  });

  it("still reports a genuinely unknown match once ESPN has answered", async () => {
    renderAt("/basketball/match/999999");
    await screen.findByText("We couldn't find that match");
  });
});

describe("commentary team crests", () => {
  it("uses the large sized team image for both ESPN teams", async () => {
    loadMatchSummary.mockResolvedValue({
      plays: [], state: "in", statusText: "Live", venue: null,
      teams: [
        { name: "Home Team", code: "HOME", homeAway: "home", score: "5", logo: "https://a.espncdn.com/home.png" },
        { name: "Away Team", code: "AWAY", homeAway: "away", score: "3", logo: "https://a.espncdn.com/away.png" },
      ],
    });
    const { container } = renderAt("/basketball/match/401888888");
    await waitFor(() => expect(container.querySelectorAll(".sh-match-team img")).toHaveLength(2));
    const images = container.querySelectorAll(".sh-match-team img");
    expect(images[0].getAttribute("src")).toBe("https://a.espncdn.com/home.png");
    expect(images[1].getAttribute("src")).toBe("https://a.espncdn.com/away.png");
    expect([...images].every((img) => img.classList.contains("sh-team-logo-lg"))).toBe(true);
  });

  it("uses the correctly sized abbreviation fallback when a logo fails or is absent", async () => {
    loadMatchSummary.mockResolvedValue({
      plays: [], state: "in", teams: [
        { name: "Home Team", code: "HOME", homeAway: "home", logo: "https://a.espncdn.com/home.png" },
        { name: "Away Team", code: null, homeAway: "away", logo: null },
      ],
    });
    const { container } = renderAt("/nfl/match/401888888", "football");
    await waitFor(() => expect(container.querySelector(".sh-match-team img")).toBeTruthy());
    container.querySelector(".sh-match-team img").dispatchEvent(new Event("error"));
    await waitFor(() => expect(container.querySelectorAll(".sh-match-team .sh-crest-lg")).toHaveLength(2));
    expect([...container.querySelectorAll(".sh-match-team .sh-crest-lg")].map((el) => el.textContent)).toEqual(["HOME", "—"]);
  });
});

describe("sport-specific ESPN match details", () => {
  const header = { competitions: [{ status: { type: { state: "post", shortDetail: "Final" } }, venue: { fullName: "Test Stadium" },
    competitors: [
      { homeAway: "home", score: "24", team: { id: "1", displayName: "Home Team", abbreviation: "HME" }, linescores: [{ value: 7 }, { value: 17 }] },
      { homeAway: "away", score: "20", team: { id: "2", displayName: "Away Team", abbreviation: "AWY" }, linescores: [{ value: 10 }, { value: 10 }] },
    ] }] };

  it("shows basketball period filters, play score order, player stats and score breakdown", async () => {
    loadMatchSummary.mockResolvedValue(normalizeSummary({ header, plays: [
      { id: "1", text: "Home player makes a three", period: { displayValue: "1st Quarter" }, team: { id: "1" }, clock: { displayValue: "9:10" }, homeScore: 3, awayScore: 0 },
      { id: "2", text: "Away player rebounds", period: { displayValue: "2nd Quarter" }, team: { id: "2" }, clock: { displayValue: "8:00" }, homeScore: 3, awayScore: 0 },
    ], boxscore: { players: [{ team: { id: "1", displayName: "Home Team" }, statistics: [{ displayName: "Starters", labels: ["MIN", "PTS"], athletes: [{ athlete: { id: "a", displayName: "Home Player" }, stats: ["25", "18"] }] }] }] } }));
    const { container } = renderAt("/basketball/match/401123456");
    await screen.findByText("Home player makes a three");
    expect(container.textContent).toContain("Score by period");
    expect(container.textContent).toContain("Player box score");
    expect(container.textContent).toContain("Home Player");
    expect(container.textContent).toContain("home – away");
    expect(container.querySelector(".sh-commentary-score").getAttribute("aria-label")).toBe("Home 3, away 0");
    fireEvent.click(screen.getByRole("button", { name: "2nd Quarter" }));
    expect(container.textContent).not.toContain("Home player makes a three");
    expect(container.textContent).toContain("Away player rebounds");
    expect(screen.getByRole("button", { name: "2nd Quarter" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "All periods" }));
    expect(container.querySelectorAll(".sh-commentary li")).toHaveLength(2);
  });

  it("shows NFL drive, play type, down and distance, and football team statistics", async () => {
    loadMatchSummary.mockResolvedValue(normalizeSummary({ header, drives: { previous: [{ id: "d1", team: { id: "2" }, description: "6 plays, 40 yards, 3:10", displayResult: "Touchdown", plays: [
      { id: "p1", text: "A pass for ten yards.", clock: { displayValue: "3:14" }, period: { number: 2 }, start: { downDistanceText: "2nd & 8 at AWY 35", team: { id: "2" } }, type: { text: "Pass Reception" }, homeScore: 7, awayScore: 0 },
    ] }] }, boxscore: { teams: [
      { team: { id: "1" }, statistics: [{ name: "yards", label: "Total yards", displayValue: "230" }] },
      { team: { id: "2" }, statistics: [{ name: "yards", label: "Total yards", displayValue: "300" }] },
    ] } }));
    const { container } = renderAt("/nfl/match/401123456", "football");
    await screen.findByText("A pass for ten yards.");
    expect(container.textContent).toContain("Drive summary");
    expect(container.textContent).toContain("6 plays, 40 yards, 3:10");
    expect(container.textContent).toContain("Pass Reception");
    expect(container.textContent).toContain("2nd & 8 at AWY 35");
    expect(container.textContent).toContain("Total yards");
    expect(container.textContent).toContain("230");
    expect(container.textContent).toContain("300");
    expect(container.textContent).toContain("ESPN has not provided a player box score");
    expect(container.textContent).toContain("Test Stadium");
  });

  it("refreshes a live real game using the same summary loader and keeps data if refresh fails", async () => {
    const result = normalizeSummary({ header: { competitions: [{ ...header.competitions[0], status: { type: { state: "in", shortDetail: "Live" } } }] }, plays: [{ text: "Existing play" }] });
    loadMatchSummary.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("Offline"));
    vi.useFakeTimers();
    try {
      const { container } = renderAt("/basketball/match/401123456");
      await act(async () => {});
      expect(container.textContent).toContain("Existing play");
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(loadMatchSummary).toHaveBeenLastCalledWith("nba", "401123456", { force: true });
      expect(container.textContent).toContain("Existing play");
    } finally { vi.useRealTimers(); }
  });
});
