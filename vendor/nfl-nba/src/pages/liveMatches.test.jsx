import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BasketballPage from "./BasketballPage";
import NFLPage from "./NFLPage";
import { normalizeScoreboard } from "../api/espn";

afterEach(cleanup);

const event = ({
  id,
  home,
  away,
  homeScore,
  awayScore,
  state = "in",
  period = 3,
  clock = "4:32",
  date = "2026-11-04T00:30:00Z",
  venue = "TD Garden",
}) => ({
  id,
  date,
  competitions: [
    {
      competitors: [
        {
          homeAway: "home",
          score: homeScore,
          team: { displayName: home.name, abbreviation: home.code },
        },
        {
          homeAway: "away",
          score: awayScore,
          team: { displayName: away.name, abbreviation: away.code },
        },
      ],
      venue: { fullName: venue },
      status: { period, displayClock: clock, type: { state, completed: state === "post" } },
    },
  ],
});

const basketballPayload = {
  events: [
    event({
      id: "401",
      home: { name: "Boston Celtics", code: "BOS" },
      away: { name: "New York Knicks", code: "NYK" },
      homeScore: "84",
      awayScore: "79",
    }),
    event({
      id: "402",
      home: { name: "Denver Nuggets", code: "DEN" },
      away: { name: "Minnesota Timberwolves", code: "MIN" },
      state: "pre",
      period: 0,
      clock: "0:00",
    }),
    event({
      id: "403",
      home: { name: "Miami Heat", code: "MIA" },
      away: { name: "Orlando Magic", code: "ORL" },
      homeScore: "101",
      awayScore: "98",
      state: "post",
      period: 4,
      clock: "0:00",
    }),
  ],
};

const halftimePayload = {
  events: [
    {
      ...event({
        id: "404",
        home: { name: "Duke Blue Devils", code: "DUKE" },
        away: { name: "North Carolina Tar Heels", code: "UNC" },
        homeScore: "38",
        awayScore: "35",
        period: 2,
        clock: "0:00",
      }),
    },
  ],
};
halftimePayload.events[0].competitions[0].status.type.description = "Halftime";

const footballPayload = {
  events: [
    event({
      id: "501",
      home: { name: "Kansas City Chiefs", code: "KC" },
      away: { name: "Buffalo Bills", code: "BUF" },
      homeScore: "24",
      awayScore: "20",
      clock: "8:41",
      venue: "Arrowhead Stadium",
    }),
  ],
};

describe("live matches rendered from the ESPN shape", () => {
  it("keeps the live status, clock and score through normalisation", () => {
    const games = normalizeScoreboard(basketballPayload, { league: "nba" });
    expect(games.map((game) => game.status)).toEqual(["LIVE", "UPCOMING", "FINAL"]);
    expect(games[0]).toMatchObject({ clock: "Q3 · 4:32", homeScore: 84, awayScore: 79 });
  });

  it("shows the live card with its clock and both scores", () => {
    const games = normalizeScoreboard(basketballPayload, { league: "nba" });
    const { container, getByRole } = render(<BasketballPage games={games} />);

    expect(container.querySelectorAll(".sh-game")).toHaveLength(3);

    const liveCard = container.querySelector(".sh-match");
    expect(liveCard.textContent).toContain("Boston Celtics");
    expect(liveCard.querySelector(".sh-clock").className).toContain("is-live");
    expect(liveCard.querySelector(".sh-clock").textContent).toBe("Q3 · 4:32");

    const scores = [...liveCard.querySelectorAll(".sh-match-score")].map((node) => node.textContent);
    expect(scores).toEqual(["84", "79"]);

    fireEvent.click(getByRole("tab", { name: "LIVE" }));
    expect(container.querySelectorAll(".sh-game")).toHaveLength(1);
  });

  it("features the live game in the hero", () => {
    const games = normalizeScoreboard(basketballPayload, { league: "nba" });
    const { container } = render(<BasketballPage games={games} />);

    const hero = container.querySelector(".sh-feature");
    expect(hero.querySelector(".sh-live-pill").textContent).toBe("Live");
    expect(hero.querySelector(".sh-live-pill").className).not.toContain("is-idle");
    expect(hero.querySelector(".sh-feature-clock").textContent).toBe("Q3 · 4:32");
    expect(hero.querySelector(".sh-feature-clock").className).toContain("is-live");
    const scores = [...hero.querySelectorAll(".sh-feature-score")].map((node) => node.textContent);
    expect(scores).toEqual(["84", "79"]);
    expect(hero.textContent).toContain("in progress");
  });

  it("labels a halftime game instead of showing a bare period", () => {
    const games = normalizeScoreboard(halftimePayload, { league: "mens-college-basketball" });
    expect(games[0].status).toBe("LIVE");
    expect(games[0].clock).toBe("Halftime");
  });

  it("renders a live NFL game with the football clock", () => {
    const games = normalizeScoreboard(footballPayload, { league: "nfl" });
    expect(games[0].clock).toBe("3rd · 8:41");

    const { container } = render(
      <MemoryRouter>
        <NFLPage games={games} />
      </MemoryRouter>
    );

    const card = container.querySelector(".sh-match");
    expect(card.querySelector(".sh-clock").textContent).toBe("3rd · 8:41");
    expect(card.querySelector(".sh-clock").className).toContain("is-live");
    const scores = [...card.querySelectorAll(".sh-match-score")].map((node) => node.textContent);
    expect(scores).toEqual(["24", "20"]);
  });

  it("lists live games first, then upcoming, then finals", () => {
    const games = normalizeScoreboard(basketballPayload, { league: "nba" });
    const reversed = [...games].reverse(); // final, upcoming, live
    const { container } = render(<BasketballPage games={reversed} />);

    const cards = [...container.querySelectorAll(".sh-match")];
    expect(cards[0].textContent).toContain("Boston Celtics");
    expect(cards[0].querySelector(".sh-clock").className).toContain("is-live");
    expect(cards[2].textContent).toContain("Miami Heat");
  });

  it("keeps the final and upcoming cards out of the live styling", () => {
    const games = normalizeScoreboard(basketballPayload, { league: "nba" });
    const { container } = render(<BasketballPage games={games} />);

    const clocks = [...container.querySelectorAll(".sh-match .sh-clock")];
    expect(clocks.map((node) => node.textContent)).toEqual(["Q3 · 4:32", clocks[1].textContent, "Final"]);
    expect(clocks[1].className).toContain("is-soon");
    expect(clocks[2].className).toContain("is-final");
  });
});
