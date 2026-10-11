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
  const update = vi.fn();
  void readEnteredWeek("live", false, update);
  await vi.waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: "ok", lineups: [] })));
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
  const update = vi.fn();
  const answer = await readEnteredWeek("old", true, update);
  expect(answer).toMatchObject({ state: "ok", saved: true, lineups: [lineup] });
  await vi.waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: "ok", saved: true, lineups: [expect.objectContaining({ scoring, result: lineup.result, cards: [expect.objectContaining({ index: 0, player: "p" })] })] })));
  read.mockResolvedValue({ state: "no-tab" });
  expect(await readEnteredWeek("old")).toMatchObject({ state: "ok", saved: true, lineups: [lineup] });
});

it("saves live reads and immediately restores them after tab closure with a background refresh", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  const lineup = { id: "live-team", name: "Mine", board: "board", competition: "LaLiga", draft: false, confirmable: false, cards: [{ slug: "c", name: "C", picture: null, rarity: "limited", captain: true, score: 0 }], result: { score: 0, rank: null, essence: 0, cash: 0, card: false } };
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => new Response(JSON.stringify(options?.method === "POST" ? { ok: true, archived: false } : { weeks: [], pending: [], snapshots: [] })));
  vi.stubGlobal("fetch", fetcher);
  read.mockResolvedValue({ state: "ok", lineups: [lineup] });
  let client = await import("./myWeeksClient");
  expect(await client.readEnteredWeek("live", false)).toMatchObject({ state: "ok", saved: true, archived: false, lineups: [lineup] });
  expect(fetcher.mock.calls.some(([, options]) => options?.method === "POST")).toBe(true);
  vi.resetModules(); // new app/tab, only persistent browser data survives
  client = await import("./myWeeksClient");
  read.mockResolvedValue({ state: "no-tab" });
  const updated = vi.fn();
  expect(await client.readEnteredWeek("live", false, updated)).toMatchObject({ state: "ok", lineups: [lineup] });
  await vi.waitFor(() => expect(updated).toHaveBeenCalledWith(expect.objectContaining({ state: "ok", lineups: [lineup], refreshIssue: { state: "no-tab" } })));
  expect(await client.readEnteredWeek("other", false)).toMatchObject({ state: "no-tab" });
});

it("renders a server snapshot on a cold device before a slow Sorare refresh finishes", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ weeks: [], pending: [], snapshots: [{ slug: "live", savedAt: "2026-10-11T12:00:00Z", lineups: [] }] }))));
  read.mockImplementation(() => new Promise(() => undefined));
  const { readEnteredWeek } = await import("./myWeeksClient");
  expect(await readEnteredWeek("live", false)).toMatchObject({ state: "ok", saved: true, archived: false, lineups: [] });
});

it("does not let an immediate closed-tab answer hide a slower server snapshot on a cold device", async () => {
  let deliver: (response: Response) => void = () => undefined;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { deliver = resolve; })));
  read.mockResolvedValue({ state: "no-tab" });
  const { readEnteredWeek } = await import("./myWeeksClient");
  const update = vi.fn();
  const first = readEnteredWeek("live", false, update);
  await vi.waitFor(() => expect(read).toHaveBeenCalledWith("live"));
  deliver(new Response(JSON.stringify({ weeks: [], pending: [], snapshots: [{ slug: "live", lineups: [], savedAt: "2026-10-11T12:00:00Z" }] })));
  expect(await first).toMatchObject({ state: "ok", saved: true, lineups: [] });
  await vi.waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: "ok", refreshIssue: { state: "no-tab" } })));
});

it("drops drafts from the browser snapshot when the server confirms final archival", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => new Response(JSON.stringify(options?.method === "POST" ? { ok: true, archived: true } : { weeks: [], pending: [] }))));
  const draft = { id: "draft", name: "Draft", board: "b", competition: "LaLiga", draft: true, confirmable: false, cards: [], result: null };
  read.mockResolvedValue({ state: "ok", lineups: [draft] });
  const { readEnteredWeek } = await import("./myWeeksClient");
  expect(await readEnteredWeek("old")).toMatchObject({ state: "ok", saved: true, archived: true, lineups: [] });
});
