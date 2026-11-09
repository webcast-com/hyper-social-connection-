import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MatchPage from "./MatchPage";
import { loadMatchSummary } from "../api/espn";

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
