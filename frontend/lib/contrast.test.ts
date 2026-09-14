import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { badgeText } from "../components/Crest";
import recorded from "../e2e/fixtures/grid-response.json";
import { blend, contrastRatio, rootTokens } from "./contrast";

const recordedTeams = recorded.data.teams;

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
const t = rootTokens(css);
const token = (name: string) => {
  const value = t[name];
  if (!value) throw new Error(`--${name} is not defined in globals.css`);
  return value;
};

const AA_TEXT = 4.5;
const AA_LARGE_OR_DIMMED = 3;

describe("contrast helpers", () => {
  it("matches known WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(blend("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("colour tokens meet WCAG AA", () => {
  it.each([1, 2, 3, 4, 5])("difficulty tile %i: main and secondary text", (bucket) => {
    const bg = token(`fdr${bucket}-bg`);
    expect(contrastRatio(token(`fdr${bucket}-fg`), bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(token(`fdr${bucket}-sub`), bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("secondary text on every light surface it sits on", () => {
    // page, card, muted tile, search field, tile in Fixtures view
    for (const surface of [token("bg"), token("surface"), "#f7f7f9", "#f2f2f5", "#f5f5f7"]) {
      expect(contrastRatio(token("ink-2"), surface), `ink-2 on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
    expect(contrastRatio(token("ink-seg"), "#ececf0")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("result scores", () => {
    expect(contrastRatio(token("win"), token("surface"))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(token("loss"), token("surface"))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("club badges pick readable text for every club colour in the recorded grid", () => {
    for (const { color } of recordedTeams) {
      const text = badgeText(color);
      expect(contrastRatio(text, color), `${text} on ${color}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("dimmed rows keep their text readable", () => {
    const opacity = Number(css.match(/tbody tr\.dim\s*\{\s*opacity:\s*([\d.]+)/)?.[1]);
    expect(opacity).toBeGreaterThan(0);
    const surface = token("surface");
    expect(contrastRatio(blend(token("ink"), surface, opacity), surface)).toBeGreaterThanOrEqual(AA_LARGE_OR_DIMMED);
  });
});
