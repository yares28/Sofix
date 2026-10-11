import { afterEach, expect, it, vi } from "vitest";
const read = vi.fn();
vi.mock("./entered", async (original) => ({ ...await original<typeof import("./entered")>(), runWeekLineups: (...args: unknown[]) => read(...args) }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); read.mockReset(); });
it("retries archiving after missing access rather than suppressing recovery for the day", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ weeks: [], pending: [{ slug: "a" }, { slug: "b" }] })));
  vi.stubGlobal("fetch", fetcher);
  read.mockResolvedValue({ state: "no-tab" });
  const { archiveFinishedWeeks } = await import("./myWeeksClient");
  const first = await archiveFinishedWeeks();
  expect(first.issue?.state).toBe("no-tab");
  expect(read).toHaveBeenCalledTimes(1);
  await archiveFinishedWeeks();
  expect(read).toHaveBeenCalledTimes(2);
});
it("reads the selected week even if archive storage is stalled", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  read.mockResolvedValue({ state: "ok", lineups: [] });
  const { readEnteredWeek } = await import("./myWeeksClient");
  expect(await readEnteredWeek("live", false)).toMatchObject({ state: "ok", lineups: [] });
  expect(read).toHaveBeenCalledWith("live");
});
it("reads saved lineups without the extension and never treats a storage failure as empty", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ weeks: [{ slug: "a", lineups: [] }], pending: [] }))));
  const { readEnteredWeek, archiveFinishedWeeks } = await import("./myWeeksClient");
  expect(await readEnteredWeek("a")).toMatchObject({ state: "ok", saved: true, lineups: [] });
  expect(read).not.toHaveBeenCalled();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
  expect((await archiveFinishedWeeks()).unavailable).toBe(true);
});

it("reports a newly archived final week as saved only after storage accepts it", async () => {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => options?.method === "POST"
    ? new Response(null, { status: 200 })
    : new Response(JSON.stringify({ weeks: [], pending: [{ slug: "finished" }] })));
  vi.stubGlobal("fetch", fetcher);
  read.mockResolvedValue({ state: "ok", lineups: [] });
  const { readEnteredWeek } = await import("./myWeeksClient");
  expect(await readEnteredWeek("finished")).toMatchObject({ state: "ok", saved: true });
  fetcher.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST"
    ? new Response(null, { status: 503 })
    : new Response(JSON.stringify({ weeks: [], pending: [{ slug: "finished" }] })));
  expect((await readEnteredWeek("finished")).saved).not.toBe(true);
});
it("automatically enriches an older saved custom lineup while retaining its recorded result", async () => {
  const card = { slug: "c", name: "C", picture: null, rarity: "limited", score: 40, captain: true };
  const lineup = { id: "l", name: "Saved", draft: false, confirmable: false, competition: "LaLiga", board: "b", cards: [card], result: { score: 60, rank: 10, essence: 250, cash: 0, card: false } };
  const scoring = { slots: [{ positions: ["Defender"], sub: false }], minInSeason: 0, captain: 0.5, season: 0, grade: 0.01, scarcity: {}, clubBonus: null, averageBonus: null };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ weeks: [{ slug: "old", lineups: [lineup] }], pending: [] }))));
  read.mockResolvedValue({ state: "ok", lineups: [{ ...lineup, scoring, result: { ...lineup.result, score: 999 }, cards: [{ ...card, index: 0, player: "p", level: 2, inSeason: true, average: 40, positions: ["Defender"] }] }] });
  const { readEnteredWeek } = await import("./myWeeksClient");
  const answer = await readEnteredWeek("old");
  expect(answer).toMatchObject({ state: "ok", saved: true, lineups: [{ scoring, result: lineup.result, cards: [{ index: 0, player: "p" }] }] });
  read.mockResolvedValue({ state: "no-tab" });
  expect(await readEnteredWeek("old")).toMatchObject({ state: "ok", saved: true, lineups: [lineup] });
});
