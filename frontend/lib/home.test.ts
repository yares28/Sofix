import { describe, expect, it } from "vitest";
import recorded from "../e2e/fixtures/grid-response.json";
import { boardHref, dateRange } from "./home";
import type { ApiResponse, FixtureGrid } from "./types";

// The recorded grid the browser tests use: GW1–GW6 played, GW7 under way, a break, then GW8 on 9 Oct.
const grid = (recorded as ApiResponse<FixtureGrid>).data!;
const col = (number: number) => grid.matchdays.findIndex((md) => md.number === number);

describe("date ranges", () => {
  it("writes them the board's way", () => {
    expect(dateRange("2026-10-09T19:00:00Z", "2026-10-12T19:00:00Z")).toBe("9–12 Oct");
    expect(dateRange("2026-09-30T19:00:00Z", "2026-10-02T19:00:00Z")).toBe("30 Sep – 2 Oct");
    expect(dateRange("2026-10-25T00:00:00Z", "2026-10-25T00:00:00Z")).toBe("25 Oct");
  });
});

describe("links", () => {
  it("keeps the gameweek in a tile's link unless it's the default one", () => {
    expect(boardHref("/fixtures", grid, col(7), col(7))).toBe("/fixtures");
    expect(boardHref("/table", grid, col(8), col(7))).toBe("/table?gw=8");
  });
});
