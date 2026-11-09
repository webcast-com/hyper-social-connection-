import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BasketballPage from "./BasketballPage";
import TeamPage from "./TeamPage";
import PlayerPage from "./PlayerPage";

afterEach(cleanup);

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/basketball" element={<BasketballPage />} />
        <Route path="/basketball/team/:teamKey" element={<TeamPage sport="basketball" />} />
        <Route path="/basketball/player/:playerKey" element={<PlayerPage sport="basketball" />} />
        <Route path="/nfl/team/:teamKey" element={<TeamPage sport="football" />} />
        <Route path="/nfl/player/:playerKey" element={<PlayerPage sport="football" />} />
      </Routes>
    </MemoryRouter>
  );

describe("team page", () => {
  it("renders a team from the demo standings with its record and schedule", () => {
    const { container, getByRole } = renderAt("/basketball/team/boston-celtics");
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Boston Celtics");
    expect(container.textContent).toContain("61–21");
    expect(container.textContent).toContain(".744");
    expect(container.querySelectorAll(".sh-detail-match")).toHaveLength(1);
    expect(container.textContent).toContain("New York Knicks");
  });

  it("links the standings table on the hub to each team page", () => {
    const { container } = renderAt("/basketball");
    const link = container.querySelector('a[href="/basketball/team/boston-celtics"]');
    expect(link).toBeTruthy();
    expect(link.textContent).toBe("Boston Celtics");
  });

  it("falls back to an empty state for an unknown team", () => {
    const { container } = renderAt("/basketball/team/not-a-team");
    expect(container.textContent).toContain("We couldn't find that team");
    expect(container.querySelector(".sh-detail-hero")).toBeNull();
  });

  it("opens a college team from the NCAA conference table", () => {
    const { getByRole, container } = renderAt("/basketball/team/duke-blue-devils");
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Duke Blue Devils");
    expect(container.textContent).toContain("24–7");
    expect(container.textContent).toContain("ACC");
  });

  it("renders NFL teams with the football data", () => {
    const { getByRole, container } = renderAt("/nfl/team/kansas-city-chiefs");
    expect(getByRole("heading", { level: 1 }).textContent).toContain("Kansas City");
    expect(container.textContent).toContain("Conference & division standings");
  });
});

describe("player page", () => {
  it("renders a leader profile with a link back to the team", () => {
    const { getByRole, container } = renderAt("/basketball/player/luka-doncic");
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Luka Dončić");
    expect(container.textContent).toContain("Points per game");
    expect(container.textContent).toContain("33.9");
  });

  it("links the player rail on the hub to player pages", () => {
    const { container } = renderAt("/basketball");
    const link = container.querySelector('a[href="/basketball/player/luka-doncic"]');
    expect(link).toBeTruthy();
    expect(link.getAttribute("aria-label")).toBe("Player profile: Luka Dončić");
  });

  it("shows the leaders board when the player has no team mates", () => {
    const { container } = renderAt("/basketball/player/nikola-jokic");
    expect(container.textContent).toContain("Leaders board");
    expect(container.querySelectorAll(".sh-detail-squad li").length).toBeGreaterThan(0);
  });

  it("always shows a portrait, even without an ESPN headshot", () => {
    const { container } = renderAt("/basketball/player/luka-doncic");
    const image = container.querySelector("img.sh-detail-portrait");
    expect(image).toBeTruthy();
    expect(image.getAttribute("src")).toBeTruthy();
    expect(image.getAttribute("alt")).toBe("Luka Dončić");
    expect(container.querySelector(".sh-detail-portrait.is-mono")).toBeNull();
  });

  it("keeps a different portrait per player and one per name", () => {
    const luka = renderAt("/basketball/player/luka-doncic").container.querySelector(
      "img.sh-detail-portrait"
    );
    const lukaSrc = luka.getAttribute("src");
    cleanup();

    const again = renderAt("/basketball/player/luka-doncic").container.querySelector(
      "img.sh-detail-portrait"
    );
    expect(again.getAttribute("src")).toBe(lukaSrc);
    cleanup();

    const jokic = renderAt("/basketball/player/nikola-jokic").container.querySelector(
      "img.sh-detail-portrait"
    );
    expect(jokic.getAttribute("src")).toBeTruthy();
  });

  it("falls back to initials only when the portrait art itself fails", () => {
    const { container } = renderAt("/nfl/player/lamar-jackson");
    const image = container.querySelector("img.sh-detail-portrait");
    expect(image).toBeTruthy();

    fireEvent.error(image);

    expect(container.querySelector("img.sh-detail-portrait")).toBeNull();
    expect(container.querySelector(".sh-detail-portrait.is-mono")).toBeTruthy();
    expect(container.textContent).toContain("Lamar Jackson");
  });

  it("falls back to an empty state for an unknown player", () => {
    const { container } = renderAt("/basketball/player/nobody-here");
    expect(container.textContent).toContain("We couldn't find that player");
  });
});
