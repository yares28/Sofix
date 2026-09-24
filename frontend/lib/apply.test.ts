import { describe, expect, it } from "vitest";
import { appearances, broken, cannot, readAnswer } from "./apply";
import type { Lineup, PlayCard } from "./play";

const card = (slug: string, over: Partial<PlayCard> = {}): PlayCard =>
  ({ slug, name: slug, pos: "MID", rarity: "limited", mult: 1, p: 0.9, mu: 50, x: 45, ...over }) as PlayCard;

const lineup = {
  board: "laliga-limited",
  boardId: "So5Leaderboard:laliga-limited",
  starters: [card("gk"), card("def"), card("mid", { captain: true }), card("fwd"), card("ext")],
  subs: [card("sub-gk"), card("sub-out")],
} as Lineup;

describe("the lineup Sorare is given", () => {
  it("numbers every slot, starters first, with one captain", () => {
    expect(appearances(lineup)).toEqual([
      { cardSlug: "gk", captain: false, index: 0 },
      { cardSlug: "def", captain: false, index: 1 },
      { cardSlug: "mid", captain: true, index: 2 },
      { cardSlug: "fwd", captain: false, index: 3 },
      { cardSlug: "ext", captain: false, index: 4 },
      { cardSlug: "sub-gk", captain: false, index: 5 },
      { cardSlug: "sub-out", captain: false, index: 6 },
    ]);
  });
});

describe("reading Sorare's answer", () => {
  it("keeps the verdict and the rules of a check", () => {
    const answer = readAnswer({
      state: "ok",
      data: {
        so5: {
          so5Leaderboard: {
            id: "So5Leaderboard:x",
            teamsCap: 4,
            previewSo5Lineup: {
              rewardMultiplier: 1.04,
              feedbackRules: [
                { ruleName: "SeasonBonus", state: "VALID", message: null },
                { ruleName: "SameClub", state: "INVALID", message: "Max 2 cards per club" },
              ],
            },
          },
        },
      },
    });
    expect(answer).toMatchObject({ state: "ok", multiplier: 1.04, cap: 4 });
    if (answer.state !== "ok") throw new Error("unreachable");
    expect(broken(answer.rules).map((rule) => rule.ruleName)).toEqual(["SameClub"]);
  });

  it("carries the draft's id, which the next step needs", () => {
    const answer = readAnswer({
      state: "ok",
      data: {
        createOrUpdateSo5Lineup: {
          errors: [],
          so5Lineup: { id: "So5Lineup:7", name: "Sofix plan 1", draft: true, confirmable: true },
        },
      },
    });
    expect(answer).toMatchObject({ state: "ok", lineupId: "So5Lineup:7" });
    if (answer.state !== "ok") throw new Error("unreachable");
    expect(answer.entered).toEqual([
      { id: "So5Lineup:7", name: "Sofix plan 1", draft: true, confirmable: true, cards: [] },
    ]);
  });

  it("lists what is already entered, with the cards it used", () => {
    const answer = readAnswer({
      state: "ok",
      data: {
        so5: {
          so5Leaderboard: {
            teamsCap: 4,
            mySo5Lineups: [
              {
                id: "So5Lineup:1",
                name: null,
                draft: false,
                confirmable: false,
                so5Appearances: [{ card: { slug: "gk" } }, { card: null }],
              },
            ],
          },
        },
      },
    });
    if (answer.state !== "ok") throw new Error("unreachable");
    expect(answer.entered).toEqual([
      { id: "So5Lineup:1", name: null, draft: false, confirmable: false, cards: ["gk"] },
    ]);
  });

  it("gives Sorare's refusal back in Sorare's words", () => {
    expect(readAnswer({ state: "rejected", errors: ["You should log in"] })).toEqual({
      state: "rejected",
      errors: ["You should log in"],
    });
    // A mutation answers 200 with an errors array: that is a refusal too, not a success.
    expect(
      readAnswer({
        state: "ok",
        data: { createOrUpdateSo5Lineup: { errors: [{ message: "Card already used" }], so5Lineup: null } },
      }),
    ).toEqual({ state: "rejected", errors: ["Card already used"] });
  });

  it("turns what the bridge could not do into something to say", () => {
    expect(readAnswer({ state: "no-tab" })).toEqual({ state: "no-tab" });
    expect(readAnswer({ state: "unknown" })).toEqual({ state: "no-bridge" }); // Sorare's page hasn't called its API yet
    expect(readAnswer({ state: "refused" })).toEqual({ state: "error" });
    expect(readAnswer(undefined)).toEqual({ state: "error" });
    expect(readAnswer({ state: "made up" })).toEqual({ state: "error" });
  });

  it("says what to do about it, and never blames the owner for a missing tab", () => {
    expect(cannot("no-tab")).toMatchObject({ act: "Open sorare.com" });
    expect(cannot("no-extension")).toMatchObject({ act: "Set it up" });
    expect(cannot("timeout")?.says).toContain("Nothing was saved");
    expect(cannot("ok")).toBeNull();
  });
});
