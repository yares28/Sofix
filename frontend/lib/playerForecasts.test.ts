import { expect, it } from "vitest";
import { marketForWeek } from "./playerForecasts";
import { planPlayer } from "./playerPage";
import type { GameweekPlan, MarketPlayer, Sorare } from "./play";

const market = [{ slug: "mine", name: "Mine", pos: "MID", club: "Barcelona", crest: null, average: 40, projection: 90, eur: null, pic: "", x: 90, mu: 90,
  fixture: { kickoff: "2026-10-15T12:00:00Z", venue: "A", opponent: "Wrong week", opponentCrest: null } },
{ slug: "other", name: "Other", pos: "DEF", club: "Barcelona", crest: null, average: 40, projection: null, eur: null, pic: "" }] as MarketPlayer[];
const info = { id: "21", slug: "gw21", number: 21, start: "2026-10-09T14:00:00Z", end: "2026-10-13T13:59:00Z", lock: "2026-10-09T14:00:00Z", name: "GW21" };
const game = { kickoff: "2026-10-11T12:00:00Z", competition: "laliga-es", home: "FC Barcelona", away: "Getafe", sofix: 52, sources: { sofix: 0.5 } };
const record = { gameweek: info, players: { mine: { mu: 48, pPlay: 0.5, pStart: 0, startSource: "sofix" as const, games: [game] }, other: { mu: 50, pPlay: 0.8, pStart: 0.7, startSource: "sofix" as const, games: [game] } } };

it("restores every player's saved GW stats after the optimizer moves on, retaining zero and exact opponents", () => {
  const rows = marketForWeek(market, "22", info, null, record);
  expect(rows[0]).toMatchObject({ x: 24, start: 52, pStart: 0, fixture: { opponent: "Getafe", venue: "H", kickoff: game.kickoff } });
  expect(rows[1]).toMatchObject({ x: 40, start: 52, pStart: 0.7 });
  expect(rows[0]!.projection).toBeNull();
  expect(market[0]!.x).toBe(90);
});

it("never borrows another GW or national-team opponent from the player's club", () => {
  expect(marketForWeek(market, "22", info, null, { ...record, gameweek: { ...info, slug: "different" } })[0]!.x).toBeUndefined();
  const national = { ...game, competition: "uefa-nations-league", home: "Spain", away: "France" };
  const row = marketForWeek(market, "22", info, null, { ...record, players: { mine: { ...record.players.mine, games: [national] } } })[0]!;
  expect(row.x).toBe(24);
  expect(row.fixture).toBeUndefined();
});

it("selects the requested player's GW instead of the first old or future week that contains him", () => {
  const player = { player: "mine", x: 24, games: [{ kickoff: game.kickoff }] };
  const data = { weeks: [{ gameweek: { ...info, id: "20" }, playing: { players: [{ ...player, x: 10 }] } }, { gameweek: info, playing: { players: [player] } }] } as unknown as Sorare;
  expect(planPlayer(data, "mine", "21")?.x).toBe(24);
  expect(planPlayer(data, "mine", "23")).toBeNull();
});

it("gives owned players exactly the saved plan's numbers rather than recomputing their forecast", () => {
  const player = { player: "mine", x: 23.9, start: 51.2, p: 0.5, pStart: 0, startSource: "futbolfantasy", games: [{ ...game, team: "Spain", opponent: "France", opponentCrest: null, venue: "A" }] };
  const plan = { gameweek: info, playing: { players: [player] } } as unknown as GameweekPlan;
  expect(marketForWeek(market, "22", info, plan, record)[0]).toMatchObject({ x: 23.9, start: 51.2, pStart: 0, fixture: { opponent: "France", venue: "A" } });
});
