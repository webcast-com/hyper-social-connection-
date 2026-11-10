import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TeamLogo } from "./ui";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

afterEach(cleanup);

describe("team crest display", () => {
  it("provides matching bounded dimensions for the commentary logo and fallback", () => {
    expect(css).toMatch(/\.sh-team-logo-lg\s*\{[^}]*width:\s*clamp\([^}]*height:\s*clamp\(/);
    expect(css).toMatch(/\.sh-crest-lg\s*\{[^}]*width:\s*clamp\([^}]*height:\s*clamp\(/);
  });
  it("tries a new logo after an earlier image fails", () => {
    const { container, rerender } = render(<TeamLogo size="lg" code="AAA" src="https://a.espncdn.com/a.png" />);
    fireEvent.error(container.querySelector("img"));
    expect(screen.getByText("AAA").className).toContain("sh-crest-lg");
    rerender(<TeamLogo size="lg" code="BBB" src="https://a.espncdn.com/b.png" />);
    expect(container.querySelector("img").getAttribute("src")).toBe("https://a.espncdn.com/b.png");
  });
});
