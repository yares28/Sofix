import { describe, expect, it } from "vitest";
import { freshLabel } from "./fresh";

const NOW = new Date("2026-10-01T13:00:00Z"); // 15:00 in Madrid

describe("how fresh a reading is", () => {
  it("says how long ago and the Madrid time it was made", () => {
    expect(freshLabel("2026-10-01T01:33:00Z", NOW)).toBe("11 h ago (03:33)");
    expect(freshLabel("2026-10-01T12:48:00Z", NOW)).toBe("12 min ago (14:48)");
    expect(freshLabel("2026-10-01T13:00:00Z", NOW)).toBe("just now (15:00)");
  });

  it("names the day once it is over a day old", () => {
    expect(freshLabel("2026-09-29T01:33:00Z", NOW)).toBe("2 days ago (Tue 03:33)");
    expect(freshLabel("2026-09-30T08:00:00Z", NOW)).toBe("29 h ago (Wed 10:00)");
  });
});
