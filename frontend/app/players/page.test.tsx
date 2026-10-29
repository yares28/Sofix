import { afterEach, beforeEach, expect, it, vi } from "vitest";
import React, { isValidElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";

const { sorare, forecasts } = vi.hoisted(() => ({ sorare: vi.fn(), forecasts: vi.fn() }));
vi.mock("../../lib/playData", () => ({ loadSorare: sorare, loadPlayerForecasts: forecasts }));
vi.mock("../../lib/api", () => ({ loadGrid: async () => ({ grid: null, meta: null }) }));
vi.mock("../../lib/system", () => ({ loadSystem: async () => null }));
vi.mock("../../lib/foreignPlayersData", () => ({ loadLeaguePlayers: async () => null }));
vi.mock("../../lib/weeks", () => ({ weekContext: () => ({ current: { id: "s:selected", gw: "selected" } }) }));
vi.mock("../../components/SiteNav", () => ({ default: () => null }));
vi.mock("../../components/cards/PlayersView", () => ({ default: () => null }));
import Players from "./page";
import PlayersView from "../../components/cards/PlayersView";

const recorded = JSON.parse(readFileSync(new URL("../../e2e/fixtures/sorare-response.json", import.meta.url), "utf8")).data;
function clientElement(node: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) return node.map(clientElement).find(Boolean) ?? null;
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  return element.type === PlayersView ? element : clientElement(element.props.children);
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  sorare.mockResolvedValue(recorded);
  forecasts.mockResolvedValue({ market: [{ slug: "selected-player", projection: null, pStart: 0, startSource: "ff" }] });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps the selected GW's market evidence without serializing unrelated weekly plans into the browser", async () => {
  const element = clientElement(await Players({ searchParams: Promise.resolve({ w: "s:selected" }) }));
  const serialized = JSON.stringify(element?.props.data);
  expect(serialized).not.toContain('"weeks"');
  expect(serialized).not.toContain('"timeline"');
  expect(serialized.length).toBeLessThan(JSON.stringify(recorded).length / 2);
  expect(element?.props.forecastWeek).toBe("selected");
  expect(element?.props.weekId).toBe("s:selected");
  const data = element?.props.data as { collection: unknown; market: unknown };
  expect(data.collection).toEqual(recorded.collection);
  expect(data.market).toEqual([{ slug: "selected-player", projection: null, pStart: 0, startSource: "ff" }]);
});
