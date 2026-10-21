import { describe, expect, it } from "vitest";
import { competitionOf, competitionHref, leagueColumn } from "./competitions";

describe("football league navigation", () => {
  it("allowlists leagues without falling back to another source", () => {
    expect(competitionOf("PL")).toBe("PL");
    expect(competitionOf("BL1")).toBe("BL1");
    expect(competitionOf("bad")).toBe("PD");
  });
  it("carries the date and lens, drops a different league's round and pins", () => {
    const url = competitionHref("/difficulty", "league=PD&w=2026-10-23&gw=10&lens=attack&pins=ATL", "BL1");
    expect(url).toContain("w=2026-10-23");
    expect(url).toContain("lens=attack");
    expect(url).toContain("league=BL1");
    expect(url).not.toMatch(/gw=|pins=/);
  });
  it("uses overlapping dates, not the same numeric round; blank weeks stay blank", () => {
    const rounds = [{ number: 8, date_from: "2026-10-23T18:00:00Z", date_to: "2026-10-25T18:00:00Z", finished: false }];
    expect(leagueColumn(rounds, "2026-10-24")).toBe(0);
    expect(leagueColumn(rounds, "2026-11-01")).toBeNull();
    expect(leagueColumn(rounds, "invalid")).toBeNull();
    expect(leagueColumn(rounds, "2026-02-30")).toBeNull();
  });
});
