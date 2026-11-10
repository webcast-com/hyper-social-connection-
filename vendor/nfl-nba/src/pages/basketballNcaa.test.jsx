import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { clearEspnCache } from "../api/espn";

const fetchMock = vi.fn();

// The page decides which boards to fetch, so the real snapshot loader runs
// against a mocked fetch instead of the demo data.
vi.mock("../api/espn", async () => {
  const actual = await vi.importActual("../api/espn");
  return { ...actual, isEspnDisabled: () => false };
});

const BasketballPage = (await import("./BasketballPage")).default;

const BOARD_GAMES = {
  nba: 1,
  wnba: 1,
  nbl: 1,
  euroleague: 1,
  "mens-college-basketball": 3,
  "womens-college-basketball": 2,
};

const espnGame = (id) => ({
  id,
  date: "2026-11-04T00:30:00Z",
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: "84", team: { displayName: `Home ${id}`, abbreviation: "HOM" } },
        { homeAway: "away", score: "79", team: { displayName: `Away ${id}`, abbreviation: "AWY" } },
      ],
      venue: { fullName: "Arena", address: { country: "USA" } },
      status: { period: 3, displayClock: "4:32", type: { state: "in", completed: false } },
    },
  ],
});

const gameCards = (container) => container.querySelectorAll(".sh-game");
const requestedUrls = () => fetchMock.mock.calls.map((call) => String(call[0]));

describe("BasketballPage live NCAA boards", () => {
  beforeEach(() => {
    clearEspnCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation((url) => {
      const target = String(url);
      const events = [];
      Object.entries(BOARD_GAMES).forEach(([league, count]) => {
        if (!target.includes(league)) return;
        for (let index = 0; index < count; index += 1) {
          events.push(espnGame(`${league}-${index}`));
        }
      });
      return Promise.resolve({ ok: true, json: async () => ({ events }) });
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("asks ESPN for both college boards on the default view", async () => {
    const { container } = render(
      <MemoryRouter>
        <BasketballPage />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(requestedUrls().some((url) => url.includes("mens-college-basketball"))).toBe(true)
    );
    const urls = requestedUrls();
    expect(urls.some((url) => url.includes("womens-college-basketball"))).toBe(true);
    expect(
      urls.filter((url) => url.includes("mens-college-basketball"))[0]
    ).toMatch(/scoreboard\?limit=500&dates=\d{8}&groups=50/);
    // 4 flagship + 3 men's + 2 women's live games
    await waitFor(() => expect(gameCards(container)).toHaveLength(9));
  });

  it("narrows to the college games when an NCAA competition is selected", async () => {
    const { container, getByRole } = render(
      <MemoryRouter>
        <BasketballPage />
      </MemoryRouter>
    );

    fireEvent.click(getByRole("button", { name: "Competition: NCAA Women's Division I" }));
    await waitFor(() => expect(gameCards(container)).toHaveLength(2));
  });
});
