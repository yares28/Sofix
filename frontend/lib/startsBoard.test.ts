import React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import StartsAudit from "../components/audit/StartsAudit";
import { COMPETITIONS, emptyScope, selection, type StartsBoard } from "./startsBoard";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

it("accepts bookmarked choices and resets invalid values", () => {
  expect(selection({ competition: "serie-a-it", chart: "D", source: "fake" })).toMatchObject({ competition: "all", chart: "A", source: "futbolfantasy" });
  expect(selection({ competition: COMPETITIONS[4][0], chart: "C", source: "sorare" })).toMatchObject({ competition: COMPETITIONS[4][0], chart: "C", source: "sorare" });
});

it.each(["A", "B", "C"])("renders chart %s with first-case evidence, including zero, and no minimum", chart => {
  const all = emptyScope();
  all.sources.futbolfantasy = { ...all.sources.futbolfantasy, state: "enough", recorded: 1, settled: 1, right: 0, brier: 0.81 };
  all.bands.futbolfantasy = [{ from: 0.9, to: 0.9, said: 0.9, was: 0, n: 1, used: true }];
  const board: StartsBoard = { version: 1, all, competitions: {} };
  const html = renderToStaticMarkup(React.createElement(StartsAudit, { board, updated: "Updated now", initial: selection({ chart }) }));
  expect(html).toContain("Who starts");
  expect(html).toContain("90% predicted");
  expect(html).toContain("0% started");
  expect(html).toContain("1 game");
  expect(html).not.toContain("Not yet");
  expect(html).not.toContain("to go");
  expect(html).not.toContain("Serie A");
  expect(html).not.toContain("Too few");
});

it("keeps an unpublished comparison empty without substituting the old unrestricted totals", () => {
  const html = renderToStaticMarkup(React.createElement(StartsAudit, { board: null, updated: "Updated now" }));
  expect(html).toContain("Waiting for results");
  expect(html).not.toContain("0% right");
});
