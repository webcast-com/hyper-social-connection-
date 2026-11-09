import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("App shell", () => {
  it("renders the sport tabs and redirects to the basketball dashboard", () => {
    const { getByRole, getByText } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    ["Basketball", "Football", "Cricket", "Badminton", "Hockey"].forEach((label) => {
      expect(getByRole("link", { name: label })).toBeTruthy();
    });
    expect(getByText("Basketball Center")).toBeTruthy();
  });

  it("routes under the integrated dashboard prefix", () => {
    const { getByRole, getByText } = render(
      <MemoryRouter basename="/nfl-basketball/" initialEntries={["/nfl-basketball/nfl"]}>
        <App />
      </MemoryRouter>
    );
    expect(getByRole("link", { name: "Basketball" }).getAttribute("href")).toBe("/nfl-basketball/basketball");
    expect(getByRole("link", { name: "Football" }).getAttribute("href")).toBe("/nfl-basketball/nfl");
    expect(getByText("NFL Center")).toBeTruthy();
  });

  it("switches the color theme", () => {
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/basketball"]}>
        <App />
      </MemoryRouter>
    );
    fireEvent.click(getByRole("button", { name: "Light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("renders a placeholder for sports without a feed yet", () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={["/cricket"]}>
        <App />
      </MemoryRouter>
    );
    expect(getByText("Cricket coverage is coming soon")).toBeTruthy();
  });
});
