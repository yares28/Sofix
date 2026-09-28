import { afterEach, describe, expect, it, vi } from "vitest";
import { readWeekLineups, runWeekLineups } from "./entered";

afterEach(() => vi.unstubAllGlobals());

describe("reading the signed-in manager's gameweek lineups", () => {
  it("keeps the competition and the exact cards Sorare returned", () => {
    const answer = readWeekLineups({
      state: "ok",
      data: {
        so5: {
          so5Fixture: {
            mySo5Lineups: [
              {
                id: "So5Lineup:17",
                name: "Friday team",
                draft: false,
                confirmable: false,
                so5Leaderboard: { slug: "laliga-17", displayName: "LALIGA EA SPORTS" },
                so5Appearances: [
                  {
                    anyCard: { slug: "arda-guler-2026-limited-1" },
                    pictureUrl: "https://assets.sorare.com/arda.png",
                    player: { displayName: "Arda Guler" },
                    rarity: "limited",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(answer).toEqual({
      state: "ok",
      lineups: [
        {
          id: "So5Lineup:17",
          name: "Friday team",
          draft: false,
          confirmable: false,
          board: "laliga-17",
          competition: "LALIGA EA SPORTS",
          cards: [
            {
              slug: "arda-guler-2026-limited-1",
              name: "Arda Guler",
              picture: "https://assets.sorare.com/arda.png",
              rarity: "limited",
            },
          ],
        },
      ],
    });
  });

  it("treats a fixture without lineups as an honest empty gameweek", () => {
    expect(readWeekLineups({ state: "ok", data: { so5: { so5Fixture: null } } })).toEqual({ state: "ok", lineups: [] });
  });

  it("keeps extension and Sorare failures distinct", () => {
    expect(readWeekLineups({ state: "no-tab" })).toEqual({ state: "no-tab" });
    expect(readWeekLineups({ state: "unknown" })).toEqual({ state: "no-bridge" });
    expect(readWeekLineups({ state: "rejected", errors: ["Sign in first"] })).toEqual({
      state: "rejected",
      errors: ["Sign in first"],
    });
    expect(readWeekLineups(undefined)).toEqual({ state: "error" });
  });

  it("stops at an outdated extension instead of sending a request it cannot understand", async () => {
    const sendMessage = vi.fn((_id: string, message: { type: string }, reply: (value: unknown) => void) => {
      expect(message).toEqual({ type: "ping" });
      reply({ ok: true, version: "0.1.0", sorareUser: "Yares", appReachable: true });
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    await expect(runWeekLineups("gw-17", 50)).resolves.toEqual({ state: "outdated", version: "0.1.0" });
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
