import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArcadeElevens, readArcadeElevens } from "./arcadeElevens";
import { outlookOf, type ArcadeCard, type ArcadeGame } from "./arcade";
import recorded from "./fixtures/arcade-elevens-response.json";

const extension = vi.hoisted(() => ({ ask: vi.fn(), ping: vi.fn() }));
vi.mock("./extension", () => ({ askExtension: extension.ask, pingExtension: extension.ping, extensionAtLeast: (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }) >= 0 }));
const NOW = Date.parse("2026-10-30T17:10:00Z");
const game = { id: "Game:11111111-2222-3333-4444-555555555555", kickoff: "2026-10-30T18:00:00Z", home: { slug: "nice", name: "Nice" }, away: { slug: "rennes", name: "Rennes" } } as ArcadeGame;
const card = (player: string, teamSlug = "nice") => ({ slug: player, player, teamSlug } as ArcadeCard);
const players = Array.from({ length: 11 }, (_, i) => ({ slug: `p-${i}`, displayName: `P ${i}`, position: i === 0 ? "Goalkeeper" : i < 5 ? "Defender" : i < 9 ? "Midfielder" : "Forward" }));
const formation = { startingLineupAvailable: true, startingLineup: [players.slice(0, 1), players.slice(1, 5), players.slice(5, 9), players.slice(9)], bench: [{ slug: "bench", displayName: "Bench", position: "Forward" }] };
const answer = () => ({ anyGame: { id: game.id, date: game.kickoff, homeTeam: game.home, awayTeam: game.away, homeFormation: structuredClone(formation), awayFormation: { startingLineupAvailable: false, startingLineup: [], bench: [] } } });
const cards = [card("p-0"), card("bench"), card("absent"), card("away", "rennes")];
let kept: Map<string, string>;
beforeEach(() => {
  kept = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => kept.set(key, value) });
  extension.ping.mockReset().mockResolvedValue({ version: "0.4.21" });
  extension.ask.mockReset().mockResolvedValue({ ok: true, state: "ok", data: answer() });
});
afterEach(() => vi.unstubAllGlobals());

describe("Arcade confirmed elevens", () => {
  it("accepts the real credential-free Lille–Lens response and keeps both sides' starters and bench", () => {
    const actual = { id: recorded.id, kickoff: recorded.date, home: recorded.homeTeam, away: recorded.awayTeam } as ArcadeGame;
    const starters = recorded.homeFormation.startingLineup.flat();
    const bench = recorded.awayFormation.bench;
    const mine = [card(starters[0]!.slug, recorded.homeTeam.slug), card(bench[0]!.slug, recorded.awayTeam.slug)];
    expect(parseArcadeElevens({ anyGame: recorded }, actual, mine, NOW)).toEqual({ [mine[0]!.player]: [10000, NOW / 1000], [mine[1]!.player]: [0, NOW / 1000] });
  });
  it("keeps a complete announced side: starters 100%, bench and absent 0%, unannounced opponents unknown", () => {
    expect(parseArcadeElevens(answer(), game, cards, NOW)).toEqual({ "p-0": [10000, NOW / 1000], bench: [0, NOW / 1000], absent: [0, NOW / 1000] });
  });
  it("never accepts another game's, moved fixture's, swapped team's or incomplete eleven", () => {
    const wrong = answer(); wrong.anyGame.id = "Game:aaaaaaaa-2222-3333-4444-555555555555";
    expect(parseArcadeElevens(wrong, game, cards, NOW)).toBeNull();
    const moved = answer(); moved.anyGame.date = "2026-10-31T18:00:00Z";
    expect(parseArcadeElevens(moved, game, cards, NOW)).toBeNull();
    const swapped = answer(); swapped.anyGame.homeTeam = game.away!;
    expect(parseArcadeElevens(swapped, game, cards, NOW)).toBeNull();
    const partial = answer(); partial.anyGame.homeFormation.startingLineup[1]!.pop();
    expect(parseArcadeElevens(partial, game, cards, NOW)).toBeNull();
  });
  it.each([0, 10000])("confirmed %s overrides every published model forecast only in its own game", (bp) => {
    const c = card("p-0");
    const model = { "p-0": { p: 0.83, source: "futbolfantasy" as const, sources: { futbolfantasy: 0.83 }, kickoff: game.kickoff, mu: 50 } };
    expect(outlookOf(c, game, null, null, model, { [game.id]: { "p-0": [bp, NOW / 1000] } })).toMatchObject({ start: bp / 10000, startSource: "sorare", confirmed: true, score: 50 });
    expect(outlookOf(c, { ...game, id: "other" }, null, null, model, { [game.id]: { "p-0": [bp, NOW / 1000] } })).toMatchObject({ start: 0.83, confirmed: false });
  });
  it("cold-reads every imminent owned game without tabs, skips later/unowned games, and rereads on an explicit refresh", async () => {
    const later = { ...game, id: "later", kickoff: "2026-10-31T18:00:00Z" };
    const other = { ...game, id: "unowned", home: { slug: "other", name: "Other", crest: null }, away: { slug: "another", name: "Another", crest: null } };
    const read = await readArcadeElevens([game, later, other], cards, false, NOW);
    expect(read).toMatchObject({ state: "ok", games: [game.id], unread: [] });
    expect(extension.ask.mock.calls.map(([m]) => m)).toEqual([{ type: "sorare", step: "arcade-elevens", game: game.id }]);
    await readArcadeElevens([game], cards, false, NOW + 30_000);
    expect(extension.ask).toHaveBeenCalledTimes(1);
    await readArcadeElevens([game], cards, true, NOW + 30_000);
    expect(extension.ask).toHaveBeenCalledTimes(2);
  });
  it("retains known confirmations across navigation and a closed source tab, expires them, and distinguishes refusal from unannounced", async () => {
    await readArcadeElevens([game], cards, false, NOW);
    extension.ask.mockResolvedValue({ ok: true, state: "no-tab" });
    const failed = await readArcadeElevens([game], cards, true, NOW + 60_000);
    expect(failed.chances[game.id]?.["bench"]?.[0]).toBe(0);
    expect(failed.unread).toEqual([game.id]);
    expect((await readArcadeElevens([game], cards, false, Date.parse(game.kickoff) + 4 * 3600_000)).chances).toEqual({});
    kept.clear();
    const empty = answer(); empty.anyGame.homeFormation = { startingLineupAvailable: false, startingLineup: [], bench: [] };
    extension.ask.mockResolvedValue({ ok: true, state: "ok", data: empty });
    expect(await readArcadeElevens([game], cards, false, NOW)).toMatchObject({ state: "ok", games: [], chances: {}, unread: [] });
  });
  it("reads a newly acquired player's lineup despite a recent cache and preserves an already announced opposite side", async () => {
    await readArcadeElevens([game], cards, false, NOW);
    const more = [...cards, card("p-1")];
    expect((await readArcadeElevens([game], more, false, NOW + 1000)).chances[game.id]?.["p-1"]?.[0]).toBe(10000);
    expect(extension.ask).toHaveBeenCalledTimes(2);
    const unannounced = answer(); unannounced.anyGame.homeFormation = { startingLineupAvailable: false, startingLineup: [], bench: [] };
    extension.ask.mockResolvedValue({ ok: true, state: "ok", data: unannounced });
    expect((await readArcadeElevens([game], more, true, NOW + 2000)).chances[game.id]?.["p-0"]?.[0]).toBe(10000);
  });
  it("keeps full simultaneous game coverage and stops on a rate limit without marking later games unannounced", async () => {
    const second = { ...game, id: "Game:aaaaaaaa-2222-3333-4444-555555555555" };
    extension.ask.mockImplementation(async (m) => ({ ok: true, state: "ok", data: { anyGame: { ...answer().anyGame, id: m.game } } }));
    expect((await readArcadeElevens([game, second], cards, false, NOW)).games).toEqual([game.id, second.id]);
    kept.clear(); extension.ask.mockClear().mockResolvedValue({ ok: true, state: "error", status: 429 });
    expect((await readArcadeElevens([game, second], cards, false, NOW)).unread).toEqual([game.id, second.id]);
    expect(extension.ask).toHaveBeenCalledTimes(1);
  });
});
