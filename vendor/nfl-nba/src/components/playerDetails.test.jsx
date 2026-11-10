import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlayerDetails } from "./PlayerDetails";
import { portraitFor } from "../data/scorersData";

afterEach(cleanup);

const leaders = [
  { name: "Luka Dončić", team: "Dallas Mavericks", teamAbbr: "DAL", position: "PG", initials: "LD", value: "33.9", metric: "Points per game" },
  { name: "Lamar Jackson", team: "Baltimore Ravens", teamAbbr: "BAL", position: "QB", initials: "LJ", value: "3,678", metric: "Passing yards" },
];

describe("player card images", () => {
  it("shows a player image even without an ESPN headshot", () => {
    const { container } = render(<PlayerDetails leaders={leaders} sport="basketball" />);
    const photos = [...container.querySelectorAll("img.sh-player-photo")];
    expect(photos).toHaveLength(2);
    for (const photo of photos) expect(photo.getAttribute("src")).toBeTruthy();
    expect(photos[0].getAttribute("src")).toBe(portraitFor("basketball", "Luka Dončić"));
    expect(screen.queryByText("LD")).toBeNull();
  });

  it("uses the sport's own portrait artwork so NFL cards do not show basketball art", () => {
    const { container } = render(<PlayerDetails leaders={leaders} sport="football" />);
    const [photo] = container.querySelectorAll("img.sh-player-photo");
    expect(photo.getAttribute("src")).toBe(portraitFor("football", "Luka Dončić"));
    expect(photo.getAttribute("src")).not.toBe(portraitFor("basketball", "Luka Dončić"));
  });

  it("prefers the ESPN headshot when the leaders feed answers", () => {
    const { container } = render(
      <PlayerDetails
        sport="basketball"
        leaders={[{ ...leaders[0], headshot: "https://a.espncdn.com/i/headshots/nba/players/full/3945274.png" }]}
      />,
    );
    expect(container.querySelector("img.sh-player-photo").getAttribute("src")).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/3945274.png",
    );
  });

  it("falls back to initials only for the card whose image failed", () => {
    const { container } = render(<PlayerDetails leaders={leaders} sport="basketball" />);
    const [first, second] = [...container.querySelectorAll("article.sh-player")];
    fireEvent.error(first.querySelector("img.sh-player-photo"));
    expect(first.querySelector("img.sh-player-photo")).toBeNull();
    expect(first.textContent).toContain("LD");
    // The other cards keep their images.
    expect(second.querySelector("img.sh-player-photo")).toBeTruthy();
    expect(second.textContent).not.toContain("LJ");
  });

  it("keeps the team crest beside the player image", () => {
    const { container } = render(
      <PlayerDetails
        sport="basketball"
        leaders={[{ ...leaders[0], teamLogo: "https://a.espncdn.com/i/teamlogos/nba/500/dal.png" }]}
      />,
    );
    expect(container.querySelector("img.sh-player-team").getAttribute("src")).toBe(
      "https://a.espncdn.com/i/teamlogos/nba/500/dal.png",
    );
    expect(container.querySelector("img.sh-player-photo")).toBeTruthy();
  });

  it("retries the image when the leaders feed supplies a headshot after a failure", () => {
    const { container, rerender } = render(<PlayerDetails leaders={leaders} sport="basketball" />);
    const card = container.querySelector("article.sh-player");
    fireEvent.error(card.querySelector("img.sh-player-photo"));
    expect(card.querySelector("img.sh-player-photo")).toBeNull();
    rerender(
      <PlayerDetails
        sport="basketball"
        leaders={[{ ...leaders[0], headshot: "https://a.espncdn.com/i/headshots/nba/players/full/3945274.png" }]}
      />,
    );
    expect(card.querySelector("img.sh-player-photo").getAttribute("src")).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/3945274.png",
    );
  });
});
