import { describe, expect, it } from "vitest";
import { enterable, paysNote, proStep, proVerdict, type Lineup } from "./play";

const pro = { level: 1, target: 360, boost: 1.25, ladder: [{ level: 1, target: 360, cash: 5, essence: 0, p: 0.31 }, { level: 2, target: 380, cash: 10, essence: 0, p: 0.18 }] };
const lineup = (extra: Partial<Lineup>) => ({ comp: "LaLiga Pro", pReturn: 0.31, ...extra }) as Lineup;

describe("Pro lineups", () => {
  it("name the step, its target and the prize with the Rare boost", () => {
    expect(proStep(pro)).toBe("Step 1 · needs 360 · $6.25");
  });
  it("say where the same cards are worth more, cash counted in essence", () => {
    const versus = { comp: "LaLiga Arena", pReturn: 0.12, eEss: 30, eCash: 0, worth: 30 };
    expect(proVerdict(lineup({ worth: 580, versus }))).toEqual({ here: true, line: "Worth more here than in LaLiga Arena" });
    expect(proVerdict(lineup({ worth: 10, versus: { ...versus, comp: "LaLiga Pro", worth: 465 } }))?.line).toBe("Worth more in LaLiga Pro");
    expect(proVerdict(lineup({ worth: 10 }))).toBeNull();
  });
  it("are never handed to Apply", () => {
    expect(enterable([lineup({ pro }), lineup({})]).map((l) => Boolean(l.pro))).toEqual([false]);
  });
});
