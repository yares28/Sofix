import { describe, expect, it } from "vitest";
import { nextLock, shouldRefreshNearLock } from "./nearLock";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const at = (hours: number) => NOW + hours * 3_600_000;

describe("near-lock refresh", () => {
  it("picks the nearest cut-off still ahead", () => {
    expect(nextLock(["2026-10-16T10:00:00Z", "2026-10-17T14:00:00Z", "2026-10-16T14:00:00Z", "junk"], NOW)).toBe(at(2));
    expect(nextLock([], NOW)).toBeNull();
  });

  it("starts only inside the last three hours, and not twice in 25 minutes", () => {
    expect(shouldRefreshNearLock(at(2), NOW, null)).toBe(true);
    expect(shouldRefreshNearLock(at(3.5), NOW, null)).toBe(false);
    expect(shouldRefreshNearLock(null, NOW, null)).toBe(false);
    expect(shouldRefreshNearLock(at(2), NOW, NOW - 24 * 60_000)).toBe(false);
    expect(shouldRefreshNearLock(at(2), NOW, NOW - 26 * 60_000)).toBe(true);
  });
});
