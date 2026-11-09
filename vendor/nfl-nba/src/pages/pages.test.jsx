import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BasketballPage from "./BasketballPage";
import NFLPage from "./NFLPage";
import { seasonStartForDate, toDateKey } from "../utils/dates";

afterEach(cleanup);

const gameCards = (container) => container.querySelectorAll(".sh-game");

describe("BasketballPage", () => {
  it("renders the full demo scoreboard", () => {
    const { container, getByText } = render(<BasketballPage />);
    expect(getByText("Basketball Center")).toBeTruthy();
    expect(gameCards(container)).toHaveLength(8); // NBA, EuroLeague, BAL, WNBA, ACB, NBL + NCAA men/women
    expect(container.querySelectorAll(".sh-date")).toHaveLength(10);
    expect(container.querySelectorAll(".sh-player")).toHaveLength(4);
    expect(container.querySelector(".sh-feature")).toBeTruthy();
  });

  it("offers phone section tabs for the desktop-only columns", () => {
    const { getByRole } = render(<BasketballPage />);
    const nav = getByRole("navigation", { name: "Page sections" });
    const labels = [...nav.querySelectorAll("button")].map((node) => node.textContent.trim());
    expect(labels).toEqual(["Live", "Standings", "Filters", "Players"]);
    expect(document.getElementById("section-live")).toBeTruthy();
    expect(document.getElementById("section-standings")).toBeTruthy();
    expect(document.getElementById("section-filters")).toBeTruthy();
    expect(document.getElementById("section-players")).toBeTruthy();

    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const filters = getByRole("button", { name: "Filters" });
    fireEvent.click(filters);
    expect(filters.getAttribute("aria-current")).toBe("true");
    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it("shows kickoff times in the viewer's time zone", () => {
    const { container, getByLabelText } = render(<BasketballPage />);
    expect(getByLabelText(/Kickoff times in your time zone/i).textContent).toMatch(/\w/);

    const upcoming = [...container.querySelectorAll(".sh-clock.is-soon")].map((node) => node.textContent);
    expect(upcoming.length).toBeGreaterThan(0);
    for (const label of upcoming) {
      expect(label).toMatch(/^(Today|Tomorrow|Yesterday|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}) · \d{2}:\d{2}$/);
    }
  });

  it("narrows the fixtures when the LIVE filter is selected", () => {
    const { container, getByRole } = render(<BasketballPage />);
    fireEvent.click(getByRole("tab", { name: "LIVE" }));
    expect(gameCards(container)).toHaveLength(3); // NBA, EuroLeague + NCAA men
  });

  it("filters by competition from the league sidebar", () => {
    const { container, getByRole } = render(<BasketballPage />);
    fireEvent.click(getByRole("button", { name: "Competition: WNBA" }));
    expect(gameCards(container)).toHaveLength(1);
  });

  it("filters by continent", () => {
    const { container, getByRole } = render(<BasketballPage />);
    fireEvent.click(getByRole("button", { name: "Continent: Europe" }));
    expect(gameCards(container)).toHaveLength(2); // EuroLeague + Liga ACB
  });

  it("filters by gender and narrows the competition list", () => {
    const { container, getByRole, queryByRole, getByText } = render(<BasketballPage />);
    fireEvent.click(getByRole("button", { name: "Gender: Women" }));
    expect(gameCards(container)).toHaveLength(2); // WNBA + NCAA women
    expect(getByRole("button", { name: "Competition: WNBA" })).toBeTruthy();
    expect(queryByRole("button", { name: "Competition: NBA" })).toBeNull();
    expect(getByText("Popular Leagues")).toBeTruthy();
  });

  it("filters by country and keeps the Kenya leagues visible", () => {
    const { container, getByRole, queryByRole } = render(<BasketballPage />);
    fireEvent.click(getByRole("button", { name: "Country: Kenya" }));
    expect(getByRole("button", { name: "Competition: Kenya National Basketball League" })).toBeTruthy();
    expect(getByRole("button", { name: "Competition: Kenya Women's Basketball League" })).toBeTruthy();
    expect(queryByRole("button", { name: "Competition: NBA" })).toBeNull();
    expect(gameCards(container)).toHaveLength(0);
    expect(container.querySelector(".sh-empty")).toBeTruthy();
  });

  it("switches season and moves the scoreboard date into that season", () => {
    const { container, getByLabelText, getAllByText } = render(<BasketballPage />);
    const currentSeason = seasonStartForDate(toDateKey());
    const select = getByLabelText("Season");
    expect(select.value).toBe(String(currentSeason));

    fireEvent.change(select, { target: { value: String(currentSeason - 2) } });

    expect(select.value).toBe(String(currentSeason - 2));
    expect(container.querySelector(".sh-date.is-active").textContent).toContain("01");
    expect(getAllByText(new RegExp(`${currentSeason - 2}-${currentSeason - 1}`)).length).toBeGreaterThan(0);
  });
});

describe("NFLPage", () => {
  it("offers the same phone section tabs", () => {
    const { getByRole } = render(<NFLPage />);
    const nav = getByRole("navigation", { name: "Page sections" });
    expect(nav.querySelectorAll("button")).toHaveLength(4);
    expect(document.getElementById("section-players")).toBeTruthy();
    expect(document.getElementById("section-filters")).toBeTruthy();
  });

  it("renders fixtures and division standings", () => {
    const { container, getByText, getAllByRole } = render(
      <MemoryRouter>
        <NFLPage />
      </MemoryRouter>
    );
    expect(getByText("NFL Center")).toBeTruthy();
    expect(gameCards(container)).toHaveLength(5); // NFL + College Football
    expect(container.querySelectorAll(".sh-table")).toHaveLength(4);
    expect(getAllByRole("tab", { name: "LIVE" }).length).toBe(1);
  });

  it("filters by conference from the sidebar", () => {
    const { container, getByRole } = render(
      <MemoryRouter>
        <NFLPage />
      </MemoryRouter>
    );
    fireEvent.click(getByRole("button", { name: "Conference: NFC" }));
    expect(gameCards(container)).toHaveLength(2);
  });
});

describe("NCAA coverage", () => {
  it("lists the college competitions in the basketball sidebar", () => {
    const { getByRole } = render(<BasketballPage />);
    expect(getByRole("button", { name: "Competition: NCAA Men's Division I" })).toBeTruthy();
    expect(getByRole("button", { name: "Competition: NCAA Women's Division I" })).toBeTruthy();
  });

  it("narrows the basketball board to a college competition", () => {
    const { container, getByRole } = render(<BasketballPage />);
    fireEvent.click(getByRole("button", { name: "Competition: NCAA Men's Division I" }));
    expect(gameCards(container)).toHaveLength(1);
    expect(container.textContent).toContain("Duke Blue Devils");
    expect(container.textContent).toContain("North Carolina Tar Heels");
    expect(container.textContent).not.toContain("Boston Celtics");
  });

  it("keeps the women's college board separate", () => {
    const { container, getByRole } = render(<BasketballPage />);
    fireEvent.click(getByRole("button", { name: "Competition: NCAA Women's Division I" }));
    expect(gameCards(container)).toHaveLength(1);
    expect(container.textContent).toContain("UConn Huskies");
    expect(container.textContent).toContain("South Carolina Gamecocks");
  });

  it("swaps the standings panel for the college conferences", () => {
    const { container, getByRole } = render(<BasketballPage />);
    fireEvent.click(getByRole("button", { name: "Competition: NCAA Women's Division I" }));
    expect(container.textContent).toContain("Big East");
    expect(container.textContent).toContain("UConn Huskies");
  });

  it("offers College Football on the football board", () => {
    const { container, getByRole } = render(
      <MemoryRouter>
        <NFLPage />
      </MemoryRouter>
    );
    fireEvent.click(getByRole("button", { name: "Competition: College Football" }));
    expect(gameCards(container)).toHaveLength(1);
    expect(container.textContent).toContain("Alabama Crimson Tide");
    expect(container.textContent).toContain("Georgia Bulldogs");
    expect(container.textContent).toContain("Big Ten");
    expect(container.textContent).toContain("Ohio State Buckeyes");
  });
});
