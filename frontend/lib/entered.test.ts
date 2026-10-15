import { afterEach, describe, expect, it, vi } from "vitest";
import { pendingLine, proLine, readProLineups, readWeekLineups, resultLine, runWeekLineups, weekWon, type GameweekLineup } from "./entered";

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

describe("what a lineup says before its games", () => {
  const LOCK = "2026-10-02T14:00:00Z"; // Fri 2 Oct 16:00 in Madrid
  const lineup = (result: GameweekLineup["result"], scores: (number | null)[] = [0, 0], draft = false): GameweekLineup => ({
    id: "l",
    name: null,
    draft,
    confirmable: false,
    board: null,
    competition: "Limited Cap 120",
    result,
    cards: scores.map((score, index) => ({ slug: `c${index}`, name: `C${index}`, picture: null, rarity: "limited", score, captain: false })),
  });
  const zero = { score: 0, rank: null, cash: 0, essence: 0, card: false };

  it("counts down to the lock instead of saying it is still scoring", () => {
    expect(pendingLine(lineup(zero), LOCK, new Date("2026-09-30T10:57:00Z"))).toBe("Locks in 2 d 3 h");
    expect(pendingLine(lineup(zero), LOCK, new Date("2026-10-02T09:00:00Z"))).toBe("Locks in 5 h");
    expect(pendingLine(lineup(zero), LOCK, new Date("2026-10-02T13:20:00Z"))).toBe("Locks in 40 min");
  });

  it("says not started between the lock and the first game", () => {
    expect(pendingLine(lineup(zero), LOCK, new Date("2026-10-02T14:05:00Z"))).toBe("Not started");
  });

  it("says nothing once a card has scored or a rank is given, even before the lock, and for a draft", () => {
    expect(pendingLine(lineup({ score: 313, rank: 1204, cash: 0, essence: 0, card: false }, [60, 80]), LOCK, new Date("2026-09-30T10:57:00Z"))).toBeNull();
    const after = new Date("2026-10-02T20:00:00Z");
    expect(pendingLine(lineup({ ...zero, score: 31 }, [31, 0]), LOCK, after)).toBeNull();
    expect(pendingLine(lineup({ ...zero, score: 0 }, [0, 12]), LOCK, after)).toBeNull();
    expect(pendingLine(lineup({ score: 300, rank: 40, cash: 0, essence: 0, card: false }, [60, 80]), LOCK, after)).toBeNull();
    expect(pendingLine(lineup(null, [null], true), LOCK, new Date("2026-09-30T10:00:00Z"))).toBeNull();
  });

  it("does not know the lock of a week it was not told it for, so it only says not started when nothing has scored", () => {
    expect(pendingLine(lineup(zero), undefined, new Date("2026-10-02T14:05:00Z"))).toBe("Not started");
    expect(pendingLine(lineup({ ...zero, score: 20 }, [20, 0]), undefined, new Date("2026-10-02T14:05:00Z"))).toBeNull();
  });
});

describe("reading the signed-in manager's gameweek lineups", () => {
  it("retains original slots and bonus rules for estimating a custom lineup, including after archiving", () => {
    const answer = readWeekLineups({ state: "ok", data: { so5: { so5Fixture: { mySo5Lineups: [{
      id: "custom", draft: false, so5Leaderboard: { slug: "board", displayName: "LaLiga",
        rules: { appearances: [{ positions: ["Goalkeeper"], sub: false }] },
        engineConfiguration: { captain: 0.5, season: 0.05, grade: 0.01, scarcity: { limited: 0 }, sameActiveClub: { number_players_per_club: { max: 2 }, bonus: 0.02 }, averageScores: { max: 260, bonus: 0.04 } },
        displayedTypedRules: [{ key: "SeasonBonus" }],
      }, so5Appearances: [{ anyCard: { slug: "c", inSeasonEligible: true, anyTeam: { name: "Celta" } }, player: { slug: "p", displayName: "Player" }, index: 0, grade: 3, positions: ["Goalkeeper"], averageScore: 45, captain: true }],
    }] } } } });
    expect(answer).toMatchObject({ state: "ok", lineups: [{
      scoring: { slots: [{ positions: ["Goalkeeper"], sub: false }], captain: 0.5, minInSeason: 4, clubBonus: [2, 0.02], averageBonus: [260, 0.04] },
      cards: [{ player: "p", index: 0, level: 3, inSeason: true, average: 45, club: "Celta" }],
    }] });
  });
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

  it("requires a complete fixture read before treating a week as empty", () => {
    expect(readWeekLineups({ state: "ok", data: { so5: { so5Fixture: null } } })).toEqual({ state: "error" });
    expect(readWeekLineups({ state: "ok", data: { so5: { so5Fixture: { mySo5Lineups: null } } } })).toEqual({ state: "error" });
    expect(readWeekLineups({ state: "ok", data: { so5: { so5Fixture: { mySo5Lineups: [] } } } })).toEqual({ state: "ok", lineups: [] });
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

describe("what a week's lineups won", () => {
  const lineup = (draft: boolean, result: { rank: number | null; essence: number; cash: number } | null) =>
    ({ id: "x", name: null, draft, confirmable: false, board: null, competition: "c", cards: [], result: result && { score: 300, card: false, ...result } }) as GameweekLineup;

  it("adds up the entered lineups, leaves drafts out, and is final once every lineup is ranked", () => {
    const won = weekWon([lineup(false, { rank: 900, essence: 250, cash: 2.5 }), lineup(false, { rank: 20000, essence: 0, cash: 0 }), lineup(true, null)]);
    expect(won).toEqual({ essence: 250, cash: 2.5, lineups: 2, final: true });
  });

  it("is not final while a lineup still waits for its rank", () => {
    expect(weekWon([lineup(false, { rank: null, essence: 0, cash: 0 })]).final).toBe(false);
  });
});

describe("answers Sorare words differently", () => {
  it("reads null lists as none instead of a broken answer, and counts XP", () => {
    const answer = readWeekLineups({
      state: "ok",
      data: {
        so5: {
          so5Fixture: {
            mySo5Lineups: [
              { id: "L1", name: null, draft: false, confirmable: true, so5Leaderboard: { slug: "b", displayName: "LaLiga" }, so5Rankings: null, so5Appearances: null },
              {
                id: "L2",
                name: "Two",
                draft: false,
                confirmable: false,
                so5Leaderboard: { slug: "c", displayName: "LaLiga" },
                so5Rankings: [
                  {
                    ranking: 2100,
                    score: 300,
                    so5Leaderboard: { slug: "c" },
                    so5Rewards: [{ rewardConfigs: [{ __typename: "InGameCurrencyRewardConfig", amount: 500, currency: "LIMITED_XP" }] }],
                  },
                ],
                so5Appearances: [],
              },
            ],
          },
        },
      },
    });
    expect(answer.state).toBe("ok");
    if (answer.state !== "ok") return;
    expect(answer.lineups[0]).toMatchObject({ id: "L1", result: null, cards: [] });
    expect(answer.lineups[1]?.result).toMatchObject({ rank: 2100, xp: 500, essence: 0, cash: 0 });
    expect(resultLine(answer.lineups[1]!.result!)).toBe("Rank 2,100 · 500 XP");
  });

  it("leaves a null answer unread instead of recording zero lineups", () => {
    expect(readWeekLineups({ state: "ok", data: { so5: null } })).toEqual({ state: "error" });
  });
});

describe("your Pro lineups", () => {
  const lineup = (id: string, startDate: string, score: number | null = null) => ({
    id, name: null, draft: false, confirmable: false, so5Leaderboard: { slug: `pro-${id}`, displayName: "Pro LaLiga" },
    so5Rankings: score === null ? [] : [{ ranking: null, score, so5Leaderboard: { slug: `pro-${id}` } }],
    so5Appearances: [{ anyCard: { slug: "card-a" }, player: { displayName: "A" }, score: 60, captain: true }],
    so5Fixture: { startDate },
  });
  const reply = {
    state: "ok",
    data: { currentUser: { boards: [{ title: "Pro Limited", steps: [
      { __typename: "CareerProStep", level: 3, target: 280, myLineups: [lineup("in", "2026-10-17T14:00:00Z", 301), lineup("out", "2026-10-10T14:00:00Z"), {}] },
      { __typename: "CareerStep", level: 1, target: 100, myLineups: [lineup("career", "2026-10-17T14:00:00Z")] },
    ] }] } },
  };

  it("keeps the Pro lineups whose matchday starts in the gameweek, with their step", () => {
    const { lineups: rows, note } = readProLineups(reply, "2026-10-16T00:00:00Z", "2026-10-20T00:00:00Z");
    expect(rows.map((row) => row.id)).toEqual(["in"]);
    expect(note).toBeNull();
    expect(rows[0]).toMatchObject({ competition: "Pro Limited", pro: { level: 3, target: 280 }, cards: [{ slug: "card-a", captain: true }] });
    expect(proLine(rows[0]!.pro!, rows[0]!.result?.score ?? null)).toBe("Step 3 · needs 280 · cleared");
    expect(proLine({ level: 1, target: 200 }, null)).toBe("Step 1 · needs 200");
  });

  it("says why none shows: an old extension, an old Sorare tab, Sorare's refusal, or none in this week", () => {
    const note = (answer: unknown, start = "2026-10-16", end = "2026-10-20") => {
      const read = readProLineups(answer, start, end);
      expect(read.lineups).toEqual([]);
      return read.note;
    };
    expect(note(null)).toContain("Reload in chrome://extensions");
    expect(note({ state: "refused" })).toBe("Pro lineups not read: reload your sorare.com tab once.");
    expect(note({ state: "rejected", errors: ["Query too deep"] })).toBe('Pro lineups not read: Sorare says "Query too deep".');
    expect(note({ state: "ok", data: null })).toBe("Pro lineups could not be read this time.");
    expect(note(reply, "2026-11-01", "2026-11-05")).toBe("No Pro lineup in this GW (2 on your Pro boards in other weeks).");
    expect(note({ state: "ok", data: { currentUser: { boards: [] } } })).toBe("Sorare lists no Pro board for you.");
  });

  it("adds them to the gameweek's lineups, and an extension without Pro changes nothing", async () => {
    const fixture = { state: "ok", data: { so5: { so5Fixture: { startDate: "2026-10-16T00:00:00Z", endDate: "2026-10-20T00:00:00Z", mySo5Lineups: [] } } } };
    for (const [answer, ids] of [[reply, ["in"]], [null, []]] as const) {
      vi.stubGlobal("chrome", { runtime: { sendMessage: (_id: string, message: { type: string; step?: string }, send: (value: unknown) => void) =>
        send(message.type === "ping" ? { ok: true, version: "0.3.16", sorareUser: "Yares", appReachable: true } : message.step === "week-entered" ? fixture : answer) } });
      const read = await runWeekLineups("gw-22", 200);
      expect(read.state === "ok" && read.lineups.map((row) => row.id)).toEqual(ids);
    }
  });

  it("never holds a week open for its rank", () => {
    const pro = { id: "p", name: null, draft: false, confirmable: false, board: null, competition: "Pro", cards: [], result: null, pro: { level: 1, target: 200 } } as GameweekLineup;
    expect(weekWon([pro]).final).toBe(true);
  });
});
