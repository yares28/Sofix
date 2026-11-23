import { expect, it } from "vitest";
import recorded from "../e2e/fixtures/sorare-response.json";
import { restoreFrozenPlan } from "./frozenPlan";
import type { GameweekPlan, Sorare } from "./play";

it("restores display fields without changing the pre-lock scores or requiring omitted optimizer lists", () => {
  const data = recorded.data as unknown as Sorare;
  const week = structuredClone(data.weeks[1]!);
  const bare = Object.fromEntries(Object.entries(week).filter(([key]) => !["playable", "blocked", "notWorth"].includes(key))) as GameweekPlan;
  const card = bare.plans[0]!.lineups[0]!.starters[0]!;
  card.pic = "";
  const restored = restoreFrozenPlan(bare as GameweekPlan, data);
  expect(restored.playable).toEqual([]);
  expect(restored.plans[0]!.lineups[0]!.starters[0]!.pic).toBeTruthy();
  expect(restored.plans[0]!.lineups[0]!.starters[0]!.x).toBe(card.x);
  expect(restored.gameweek).toEqual(week.gameweek);
});

it("restores the card art of the Pro boards' groups, as for the plan's lineups (2 Nov 2026: LaLiga Pro showed initials)", () => {
  const data = recorded.data as unknown as Sorare;
  const week = structuredClone(data.weeks[1]!);
  const owned = (data.collection ?? []).find((c) => c.pic)!;
  const starter = { ...week.plans[0]!.lineups[0]!.starters[0]!, slug: owned.slug, pic: "" };
  const bare = { ...week, pro: [{ comp: "LaLiga Pro", key: "LALIGA | Pro", steps: [{ level: 2, target: 380, cash: 0, essence: 0 }], windows: [{ from: "2026-11-01T17:30:00Z", to: "2026-11-01T17:30:00Z", x: 297, boost: 1, allStart: 0.3, ifStart: [0.04], wait: [0.03], starters: [starter] }] }] } as GameweekPlan;
  expect(restoreFrozenPlan(bare, data).pro![0]!.windows[0]!.starters[0]!.pic).toBe(owned.pic);
});

it("restores each game's crests, which the frozen copy keeps no pictures of (23 Nov 2026: Dituro's Levante game drew a shield)", () => {
  const data = recorded.data as unknown as Sorare;
  const week = structuredClone(data.weeks[1]!);
  const player = week.playing.players.find((p) => p.games.some((g) => g.opponentCrest))!;
  const game = player.games.find((g) => g.opponentCrest)!;
  game.team = player.club;
  const opponentCrest = game.opponentCrest;
  const teamCrest = data.market!.find((row) => row.club === player.club && row.crest)?.crest
    ?? data.weeks.flatMap((w) => w.playing.players).flatMap((p) => p.games).find((g) => g.opponent === player.club && g.opponentCrest)?.opponentCrest;
  expect(teamCrest).toBeTruthy();
  for (const g of player.games) {
    g.opponentCrest = null;
    g.teamCrest = null;
  }
  // a club Sofix shows nowhere else keeps no crest: never someone else's
  const stranger = { ...game, id: "Game:stranger", opponent: "Nowhere FC", opponentCrest: null, teamCrest: null };
  player.games.push(stranger);
  const restored = restoreFrozenPlan(week, data).playing.players.find((p) => p.player === player.player)!;
  const back = restored.games.find((g) => g.id === game.id)!;
  expect(back.opponentCrest).toBe(opponentCrest);
  expect(back.teamCrest).toBe(teamCrest);
  expect(back.x).toBe(game.x);
  expect(restored.games.find((g) => g.id === "Game:stranger")!.opponentCrest).toBeNull();
});
