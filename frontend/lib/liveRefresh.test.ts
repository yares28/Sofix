import { expect, it } from "vitest";
import { isPlaying } from "../components/LiveRefresh";

it("reads the page again only while the week is played: from its lock to three hours after its end", () => {
  const lock = "2026-10-30T18:00:00Z", end = "2026-11-03T22:00:00Z";
  expect(isPlaying(lock, end, Date.parse("2026-10-30T17:59:00Z"))).toBe(false);
  expect(isPlaying(lock, end, Date.parse("2026-11-02T15:00:00Z"))).toBe(true);
  expect(isPlaying(lock, end, Date.parse("2026-11-04T00:30:00Z"))).toBe(true);
  expect(isPlaying(lock, end, Date.parse("2026-11-04T01:30:00Z"))).toBe(false);
  expect(isPlaying(null, end, Date.parse("2026-11-02T15:00:00Z"))).toBe(false);
});
