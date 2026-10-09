import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import SavedData from "../components/control/SavedData";
import { DATASETS, readHealth, type DataHealth } from "./dataHealth";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
const date = "2026-10-09T12:00:00Z";
const page: DataHealth = { version: 1, generatedAt: date, datasets: DATASETS.map((id) => ({
  id, count: id === "games" ? 30462 : 0, players: id === "games" ? 1025 : undefined,
  newest: id === "games" ? date : null, lastRead: id === "games" ? date : null, warnings: [],
})) };

it("rejects broken or duplicate coverage rather than displaying invented zero counts", () => {
  expect(readHealth(null)).toBeNull();
  expect(readHealth({ ...page, datasets: [...page.datasets.slice(1), page.datasets[1]] })).toBeNull();
  expect(readHealth({ ...page, generatedAt: "bad date" })).toBeNull();
  expect(readHealth(page)?.datasets[0]?.count).toBe(30462);
});

it("preserves dated counts and names the unavailable source", () => {
  const health = structuredClone(page);
  health.datasets[1] = { id: "odds", count: 3869, newest: "2026-09-20", lastRead: date,
    source: "football-data.co.uk (PSCH)", warnings: ["football-data.co.uk unavailable on the last read; saved prices remain."] };
  const html = renderToStaticMarkup(React.createElement(SavedData, { data: health, now: new Date(date) }));
  expect(html).toContain("30,462 game rows");
  expect(html).toContain("1,025 players");
  expect(html).toContain("3,869 price readings");
  expect(html).toMatch(/Latest priced match 20 Sept? 2026/);
  expect(html).toContain("saved prices remain");
  expect(html).toContain("0 saved weeks");
  expect(html).not.toContain("Not checked yet");
});
