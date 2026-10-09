import { expect, it } from "vitest";
import { missionPlayers } from "./missionInventory";
import { fit } from "./missions";

it("includes Sorare-discovered owned cards and the actual national-team fixture without borrowing another game's estimate", () => {
  const missions = [{ id: "t", title: "Decisive", description: "", mode: "DECISIVE" as const, picks: 3, made: 0, period: "DAILY", state: "READY",
    inventory: [{ card: "p-card", player: "p", name: "Player", pos: "FWD" as const, pic: "https://assets.sorare.com/p.png", game: { id: "game", kickoff: "2026-10-10T19:00:00Z", competition: "nations-league", team: "Spain", opponent: "France", opponentCrest: null, venue: "H" as const } }] }];
  const players = missionPlayers([], missions, "limited");
  expect(players[0]).toMatchObject({ card: "p-card", games: [{ team: "Spain", availabilityKnown: false }] });
  expect(fit({ kind: "decisive", label: "" }, players[0]!, null)).toBeNull();
});
