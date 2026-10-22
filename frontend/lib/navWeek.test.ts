import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { weekSuffix } from "./navWeek";

it("converts legacy per-page GW bookmarks into the server-resolved shared date", () => {
  expect(weekSuffix(new URLSearchParams("gw=6&league=FL1"), "2026-10-13")).toBe("?w=2026-10-13&league=FL1");
});
it("preserves explicit dates and windows, and leaves an unselected default alone", () => {
  expect(weekSuffix(new URLSearchParams("w=2026-10-23&gw=6&end=2026-10-27&league=FL1"), "2026-10-13")).toBe("?w=2026-10-23&end=2026-10-27&league=FL1");
  expect(weekSuffix(new URLSearchParams(), "2026-10-13")).toBe("");
});
