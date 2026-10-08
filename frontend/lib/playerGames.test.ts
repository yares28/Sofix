import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPlayerGames, loadPlayerSheets } from "./playerGames";
import { seasonSummary, type SavedGame } from "./playerHistory";

vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ database: vi.fn(), readModel: vi.fn() }));
import { database, readModel } from "./db";

const game = (over: Partial<SavedGame> = {}): SavedGame => ({
  game_id: "g", date: "2026-09-01T19:00:00Z", competition: "laliga-es", home: "Home", away: "Away", status: "FINAL",
  played: true, started: true, mins: 90, score: 60, yellow: 1, red: false, sofix_x: 50, sorare_x: 65, read_at: "2026-10-08T10:00:00Z", ...over,
});
beforeEach(() => { vi.resetAllMocks(); });

describe("saved player history", () => {
  it("counts this season's appearances, LaLiga yellows and each source's miss on known starts only", () => {
    const summary = seasonSummary([game(), game({ game_id: "2", yellow: 3, score: 70 }), game({ started: false, score: 20, yellow: 0 }), game({ competition: "premier-league-gb", yellow: 2 }), game({ played: false, started: false, score: 0, yellow: 0 }), game({ status: "PENDING", score: 99 }), game({ date: "2026-06-30T19:00:00Z", yellow: 5 })], new Date("2026-10-08"));
    expect(summary).toMatchObject({ games: 4, starts: 3, average: 52.5, yellows: 4, yellowComplete: true, sofix: { n: 3, miss: 40 / 3 }, sorare: { n: 3, miss: 5 } });
  });
  it("does not turn missing scores, starts or cards into zero or ban claims", () => {
    const summary = seasonSummary([game({ score: null, started: null, played: null, yellow: null }), game({ sofix_x: null, sorare_x: null })], new Date("2026-10-08"));
    expect(summary).toMatchObject({ games: 1, starts: 1, average: 60, yellows: 1, yellowComplete: false, sofix: null, sorare: null });
  });
  it("reads parameterized games and absences and validates a slug before querying", async () => {
    const sql = vi.fn().mockResolvedValueOnce([game()]).mockResolvedValueOnce([]);
    vi.mocked(database).mockReturnValue(sql as unknown as NonNullable<ReturnType<typeof database>>);
    expect((await loadPlayerGames("a-player"))?.games).toEqual([game()]);
    expect(sql.mock.calls[0]!.slice(1)).toContain("a-player");
    expect(await loadPlayerGames("../bad")).toBeNull();
    expect(sql).toHaveBeenCalledTimes(2);
  });
  it("uses the daily sheet read model and keeps missing history distinct from an empty history", async () => {
    vi.mocked(database).mockReturnValue(vi.fn() as unknown as NonNullable<ReturnType<typeof database>>);
    const sheets = { asOf: "2026-10-07", players: {} };
    vi.mocked(readModel).mockResolvedValue({ payload: sheets, updatedAt: "2026-10-08" });
    expect(await loadPlayerSheets()).toEqual(sheets);
    expect(readModel).toHaveBeenCalledWith("player_sheets");
    vi.mocked(database).mockReturnValue(vi.fn().mockRejectedValue(new Error("unavailable")) as unknown as NonNullable<ReturnType<typeof database>>);
    expect(await loadPlayerGames("a-player")).toBeNull();
  });
});
