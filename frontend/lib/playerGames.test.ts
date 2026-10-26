import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPlayerGames, loadPlayerSheets, sheetsPart } from "./playerGames";
import { seasonSummary, type SavedGame } from "./playerHistory";
import type { Sheets } from "./playerSheet";

vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ published: vi.fn(), readModel: vi.fn(), readModelAt: vi.fn() }));
vi.mock("./r2", () => ({ blockVersions: vi.fn(), blockVersion: vi.fn(), blockAt: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
import { published, readModel } from "./db";
import { blockAt, blockVersion } from "./r2";

const game = (over: Partial<SavedGame> = {}): SavedGame => ({
  game_id: "g", date: "2026-09-01T19:00:00Z", competition: "laliga-es", home: "Home", away: "Away", status: "FINAL",
  played: true, started: true, mins: 90, score: 60, yellow: 1, red: false, sofix_x: 50, sorare_x: 65, ff_start: null, read_at: "2026-10-08T10:00:00Z", ...over,
});
beforeEach(() => { vi.resetAllMocks(); });

describe("saved player history", () => {
  it("shows a published game once it has started, and every absence", async () => {
    vi.mocked(published).mockReturnValue(true);
    const absence = { id: 1, kind: "out", cause: null, first_seen: "2026-10-01T00:00:00Z", last_seen: "2026-10-02T00:00:00Z", back: null };
    vi.mocked(readModel).mockResolvedValue({ payload: { games: [game({ game_id: "later", date: "2999-01-01T19:00:00Z" }), game()], absences: [absence] }, updatedAt: "x" });
    const history = await loadPlayerGames("abdul-mumin");
    expect(history?.games.map((g) => g.game_id)).toEqual(["g"]);
    expect(history?.absences).toEqual([absence]);
  });
  it("counts this season's appearances, LaLiga yellows and each source's miss on known starts only", () => {
    const summary = seasonSummary([game(), game({ game_id: "2", yellow: 3, score: 70 }), game({ started: false, score: 20, yellow: 0 }), game({ competition: "premier-league-gb", yellow: 2 }), game({ played: false, started: false, score: 0, yellow: 0 }), game({ status: "PENDING", score: 99 }), game({ date: "2026-06-30T19:00:00Z", yellow: 5 })], new Date("2026-10-08"));
    expect(summary).toMatchObject({ games: 4, starts: 3, average: 52.5, yellows: 4, yellowComplete: true, sofix: { n: 3, miss: 40 / 3 }, sorare: { n: 3, miss: 5 } });
  });
  it("counts how often FF called his start right: a start at 50% or more, no start below it, only games with FF's number and a known start", () => {
    const summary = seasonSummary([game({ ff_start: 0.95 }), game({ ff_start: 0.7, started: false }), game({ ff_start: 0.3, started: false }), game({ ff_start: 0.95, started: null }), game({ ff_start: 0.95, status: "PENDING" }), game()], new Date("2026-10-08"));
    expect(summary.ff).toEqual({ right: 2, n: 3 });
    expect(seasonSummary([game()], new Date("2026-10-08")).ff).toBeNull();
  });
  it("does not turn missing scores, starts or cards into zero or ban claims", () => {
    const summary = seasonSummary([game({ score: null, started: null, played: null, yellow: null }), game({ sofix_x: null, sorare_x: null })], new Date("2026-10-08"));
    expect(summary).toMatchObject({ games: 1, starts: 1, average: 60, yellows: 1, yellowComplete: false, sofix: null, sorare: null });
  });
  it("reads the player's own block and validates a slug before reading", async () => {
    vi.mocked(published).mockReturnValue(true);
    vi.mocked(readModel).mockResolvedValue({ payload: { games: [game()], absences: [] }, updatedAt: "x" });
    expect((await loadPlayerGames("a-player"))?.games).toEqual([game()]);
    expect(readModel).toHaveBeenCalledWith("player_games:a-player");
    expect(await loadPlayerGames("../bad")).toBeNull();
    expect(readModel).toHaveBeenCalledTimes(1);
  });
  it("uses the daily sheet read model and keeps missing history distinct from an empty history", async () => {
    vi.mocked(published).mockReturnValue(true);
    // Over Next's 2 MB cache limit in one piece (2.3 MB on 26 Oct 2026): read as a head and four groups of players.
    const players = Object.fromEntries(Array.from({ length: 1600 }, (_, i) => [`player-${i}`, { form: "x".repeat(1400), zero: i === 0 ? 0 : null }]));
    const sheets = { asOf: "2026-10-07", players } as unknown as Sheets;
    expect(JSON.stringify(sheets).length).toBeGreaterThan(2_000_000);
    vi.mocked(blockVersion).mockResolvedValue("v1");
    vi.mocked(blockAt).mockResolvedValue({ payload: sheets, updatedAt: "2026-10-08" });
    expect(await loadPlayerSheets()).toEqual(sheets);
    expect(vi.mocked(blockVersion).mock.calls).toEqual([["player_sheets"]]);
    for (const part of [-1, 0, 1, 2, 3]) expect(JSON.stringify(sheetsPart(sheets, part)).length).toBeLessThan(1_600_000);
    vi.mocked(readModel).mockRejectedValue(new Error("unavailable"));
    expect(await loadPlayerGames("a-player")).toBeNull();
    vi.mocked(readModel).mockResolvedValue(null);
    expect(await loadPlayerGames("a-player")).toEqual({ games: [], absences: [] });
  });
});

it("does not offer a LaLiga disciplinary total for an exclusively foreign history", () => {
  expect(seasonSummary([game({ competition: "bundesliga-de" })], new Date("2026-10-08")).hasLaLiga).toBe(false);
  expect(seasonSummary([game()], new Date("2026-10-08")).hasLaLiga).toBe(true);
});
