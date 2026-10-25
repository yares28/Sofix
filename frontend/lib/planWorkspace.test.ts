import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import response from "../e2e/fixtures/sorare-response.json";
import { nextWeek, type GameweekPlan, type Sorare } from "./play";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("../components/SiteNav", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("./api", () => ({ loadGrid: vi.fn(async () => ({ grid: null, meta: null })) }));
vi.mock("./system", () => ({ loadSystem: vi.fn(async () => null) }));
vi.mock("./missionsData", () => ({ loadMissions: vi.fn(async () => null) }));
vi.mock("./missionsPool", () => ({ loadMissionPool: vi.fn(async () => null) }));
vi.mock("./missionsToday", () => ({ missionsToday: vi.fn(async () => null) }));
vi.mock("./planScoresData", () => ({ loadPlanActuals: vi.fn(async () => ({})) }));
vi.mock("./playData", () => ({ loadSorare: vi.fn(), loadSorareAlt: vi.fn(), loadSorareLens: vi.fn(), loadSorareWeek: vi.fn(), loadFrozenPlan: vi.fn(), loadProjectedWeek: vi.fn(), loadProRebuild: vi.fn() }));
vi.mock("./weeks", () => ({ weekContext: vi.fn(), pageWeeks: (weeks: unknown[]) => weeks, weekDates: () => "25–29 Sep", weekName: () => "Sorare GW17", noPlan: () => ({ heading: "Not recorded", says: "No saved plan", lineups: null }) }));

import { loadSorare, loadSorareAlt, loadSorareLens, loadFrozenPlan } from "./playData";
import { loadMissions } from "./missionsData";
import { weekContext } from "./weeks";
import PlayPlace from "../components/play/PlayPlace";
import PlayView from "../components/play/PlayView";

const data = response.data as unknown as Sorare;
const week = nextWeek(data);
const make = (params: Record<string, string>, alternatives = true) => PlayPlace({ searchParams: Promise.resolve(params), alternatives });
async function view(params: Record<string, string>) {
  const tree = await make(params);
  for (const node of React.Children.toArray(tree.props.children)) if (React.isValidElement<{ week: GameweekPlan; by: string; after: boolean }>(node) && node.type === PlayView) return node.props;
  throw new Error("No plan workspace");
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(week.gameweek.lock) - 3600000));
  vi.mocked(loadSorare).mockResolvedValue(data);
  vi.mocked(loadSorareAlt).mockResolvedValue(null);
  vi.mocked(loadSorareLens).mockResolvedValue(null);
  vi.mocked(loadFrozenPlan).mockResolvedValue(null);
  vi.mocked(weekContext).mockReturnValue({ weeks: [], now: null, current: { gw: week.gameweek.id, state: "next", md: null } } as unknown as ReturnType<typeof weekContext>);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("moved bookmarks redirect before downloading models", async () => {
  await expect(make({ gw: week.gameweek.id, by: "ceiling", plan: "2" }, false)).rejects.toThrow(/^redirect:\/audit\/strategies\?view=plans/);
  expect(loadSorare).not.toHaveBeenCalled();
});

it("a saved Sorare forecast is available independently, with no inherited Sofix hindsight or mission reads", async () => {
  const alt = { gameweek: week.gameweek, builtAt: "", projected: 30, players: 30, plans: [week.plans[1]!] };
  vi.mocked(loadSorareAlt).mockResolvedValue(alt);
  const result = await view({ by: "sorare", after: "1" });
  expect(result.by).toBe("sorare");
  expect(result.week.plans).toEqual(alt.plans);
  expect(result.week.hindsight).toBeUndefined();
  expect(result.after).toBe(false);
  expect(loadMissions).not.toHaveBeenCalled();
});

it("a mismatched source GW never supplies a lineup", async () => {
  vi.mocked(loadSorareAlt).mockResolvedValue({ gameweek: { ...week.gameweek, slug: "another-gw" }, builtAt: "", projected: 1, players: 1, plans: week.plans });
  expect((await view({ by: "sorare" })).week.plans).toEqual([]);
});
