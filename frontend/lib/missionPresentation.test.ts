import { describe, expect, it } from "vitest";
import { cardCopyLabel, manualMissionPick, missionWindow, sampleLabel } from "./missionPresentation";

describe("mission presentation", () => {
  it("names the fallback window consistently before reset and across the Madrid clock change", () => {
    expect(missionWindow(new Date("2026-10-09T07:30:00Z"))).toEqual({ day: "2026-10-08", start: "2026-10-08T08:00:00.000Z", end: "2026-10-09T08:00:00.000Z" });
    expect(missionWindow(new Date("2026-10-25T08:00:00Z")).day).toBe("2026-10-25");
  });
  it("shows the actual number of starts instead of claiming five when there is one", () => {
    expect(sampleLabel(1, 5)).toBe("Only 1 scored start available");
    expect(sampleLabel(5, 5)).toBe("Last 5 scored starts");
    expect(sampleLabel(0, 8)).toBe("No scored starts");
  });
  it("labels separate card copies and accepts Sorare links without trusting arbitrary URLs", () => {
    expect(cardCopyLabel("jan-oblak-2026-limited-42")).toBe("2026 · Copy #42");
    expect(manualMissionPick("https://sorare.com/football/cards/jan-oblak-2026-limited-42", "limited")).toEqual({ player: "jan-oblak", card: "jan-oblak-2026-limited-42", game: null });
    expect(manualMissionPick("https://sorare.com/football/players/jan-oblak", "limited")?.player).toBe("jan-oblak");
    expect(manualMissionPick("https://evil.example/football/players/jan-oblak", "limited")).toBeNull();
    expect(manualMissionPick("https://sorare.com/football/cards/jan-oblak-2026-rare-42", "limited")).toBeNull();
  });
});
