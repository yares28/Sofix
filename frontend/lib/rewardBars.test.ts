import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, lanes, placeLabel, prizeLabel, readPrefs, readable, scaleOf, toggle } from "./rewardBars";

const laliga = {
  key: "LALIGA EA SPORTS | Limited", name: "LaLiga", rarity: "limited", group: "In-season", kind: "rank", size: null, paidTo: 1500,
  bar: 317.26, low: 305.74, high: 332.3, latest: 332.3, samples: 5, byWeek: [{ week: "23–27 Oct", score: 332.3 }],
  reward: { cash: 0, essence: 10, card: false }, ladder: [{ lo: 1, hi: 1, cash: 2000, essence: 0, card: false, bar: 548.2 }],
};

describe("reward bars", () => {
  it("reads the block the job writes and refuses anything else", () => {
    const block = { version: 1, latest: "23–27 Oct", weeks: ["23–27 Oct"], competitions: [laliga], unread: [] };
    expect(readable(block)?.competitions[0]?.bar).toBe(317.26);
    expect(readable({ ...block, version: 2 })).toBeNull();
    expect(readable({ ...block, competitions: [{ ...laliga, kind: "guess" }] })).toBeNull();
  });

  it("says where each bar sits and what it pays", () => {
    expect(placeLabel(laliga as never)).toBe("Top 1,500");
    expect(placeLabel({ kind: "room", paidTo: 3, size: 10, ladder: [] })).toBe("Top 3 of 10");
    expect(placeLabel({ kind: "rank", paidTo: null, size: null, ladder: [] })).toBeNull();
    expect(prizeLabel({ cash: 10, essence: 50, card: false })).toBe("$10 + 50 essence");
    expect(prizeLabel({ cash: 0, essence: 0, card: true })).toBe("a card");
  });

  it("puts every bar on one scale and keeps flags that would overlap on separate rows", () => {
    expect(scaleOf([286, 495])).toEqual({ lo: 250, hi: 550, ticks: [300, 400, 500] });
    const rows = lanes([{ key: "a", at: 10 }, { key: "b", at: 14 }, { key: "c", at: 40 }, { key: "d", at: 16 }], 12);
    expect([rows.get("a"), rows.get("b"), rows.get("d"), rows.get("c")]).toEqual([0, 1, 2, 0]);
  });

  it("pinning unhides and hiding unpins; a broken saved choice falls back to the default", () => {
    const hidden = toggle(DEFAULT_PREFS, "x", "hide");
    expect(toggle(hidden, "x", "pin")).toEqual({ pinned: [...DEFAULT_PREFS.pinned, "x"], hidden: [] });
    expect(toggle(DEFAULT_PREFS, DEFAULT_PREFS.pinned[0]!, "hide").pinned).toEqual([]);
    expect(readPrefs("{oops")).toEqual(DEFAULT_PREFS);
  });
});
