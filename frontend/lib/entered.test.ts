import { afterEach, describe, expect, it, vi } from "vitest";
import { readWeekLineups, resultLine, runWeekLineups } from "./entered";

afterEach(() => vi.unstubAllGlobals());

describe("how a lineup's result reads", () => {
  it("says the rank and what was paid", () => {
    expect(resultLine({ score: 313.4, rank: 1204, cash: 2.5, essence: 250, card: true })).toBe(
      "Rank 1,204 · $2.50 · 250 essence · a card",
    );
    expect(resultLine({ score: 300, rank: 31, cash: 40, essence: 0, card: false })).toBe("Rank 31 · $40");
  });

  it("says nothing was paid once it is ranked, and that it is still scoring before that", () => {
    expect(resultLine({ score: 210, rank: 90_000, cash: 0, essence: 0, card: false })).toBe("Rank 90,000 · no reward paid");
    expect(resultLine({ score: 120, rank: null, cash: 0, essence: 0, card: false })).toBe("Still scoring");
  });
});

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
          result: null,
          cards: [
            {
              slug: "arda-guler-2026-limited-1",
              name: "Arda Guler",
              picture: "https://assets.sorare.com/arda.png",
              rarity: "limited",
              score: null,
              captain: false,
            },
          ],
        },
      ],
    });
  });

  describe("what a lineup scored, where it ranked and what it won", () => {
    const appearance = (slug: string, score: number, captain = false) => ({
      anyCard: { slug },
      pictureUrl: null,
      player: { displayName: slug },
      rarity: "limited",
      score,
      captain,
    });
    const lineup = (rankings: unknown[]) => ({
      state: "ok",
      data: {
        so5: {
          so5Fixture: {
            mySo5Lineups: [
              {
                id: "So5Lineup:1",
                name: null,
                draft: false,
                confirmable: false,
                so5Leaderboard: { slug: "all-star", displayName: "All Star" },
                so5Rankings: rankings,
                so5Appearances: [appearance("a-1", 61.5, true), appearance("a-2", 40)],
              },
            ],
          },
        },
      },
    });
    const paid = {
      ranking: 1204,
      score: 313.4,
      so5Leaderboard: { slug: "all-star" },
      so5Rewards: [
        {
          rewardConfigs: [
            { __typename: "MonetaryRewardConfig", amount: { usdCents: 250 } },
            { __typename: "CardShardRewardConfig", rarity: "limited", quantity: 250 },
            { __typename: "CardShardRewardConfig", rarity: "rare", quantity: 5 }, // only Limited essence counts
            { __typename: "CardRewardConfig", rarity: "limited", quality: "common" },
          ],
        },
      ],
    };

    it("adds up the rewards Sorare paid: dollars, Limited essence and a card", () => {
      const answer = readWeekLineups(lineup([paid]));
      expect(answer.state === "ok" && answer.lineups[0]!.result).toEqual({ score: 313.4, rank: 1204, cash: 2.5, essence: 250, card: true });
    });

    it("keeps each card's score and who the captain is", () => {
      const answer = readWeekLineups(lineup([paid]));
      const cards = answer.state === "ok" ? answer.lineups[0]!.cards : [];
      expect(cards.map((c) => [c.score, c.captain])).toEqual([[61.5, true], [40, false]]);
    });

    it("reads the ranking of the competition the lineup is in, not another", () => {
      const other = { ...paid, ranking: 9, score: 500, so5Leaderboard: { slug: "somewhere-else" }, so5Rewards: [] };
      const answer = readWeekLineups(lineup([other, paid]));
      expect(answer.state === "ok" && answer.lineups[0]!.result?.rank).toBe(1204);
    });

    it("has a score and no rank or reward while the week is still being played", () => {
      const live = { ranking: null, score: 120, so5Leaderboard: { slug: "all-star" }, so5Rewards: [] };
      const answer = readWeekLineups(lineup([live]));
      expect(answer.state === "ok" && answer.lineups[0]!.result).toEqual({ score: 120, rank: null, cash: 0, essence: 0, card: false });
    });

    it("has no result at all when Sorare has ranked nothing", () => {
      const answer = readWeekLineups(lineup([]));
      expect(answer.state === "ok" && answer.lineups[0]!.result).toBeNull();
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
