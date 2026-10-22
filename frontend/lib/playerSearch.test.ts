import { expect, it } from "vitest";
import { findPlayers, searchIndex, searchPlayerHref, type SearchPlayer } from "./playerSearch";
import type { Sorare } from "./play";

const p = (slug: string, name: string): SearchPlayer => ({ slug, name, club: null, pic: "" });
const all = [p("alvaro-garcia", "Álvaro García"), p("david-soria", "David Soria"), p("mario-garcia", "Mario García"), p("garcia-x", "Garcia")];

it("finds a player by any part of his name, accents ignored, names starting with the query first", () => {
  expect(findPlayers(all, "garcia").map((x) => x.slug)).toEqual(["garcia-x", "alvaro-garcia", "mario-garcia"]);
  expect(findPlayers(all, "alvaro gar").map((x) => x.slug)).toEqual(["alvaro-garcia"]);
  expect(findPlayers(all, "  ")).toEqual([]);
});

it("lists the index and your own players once each", () => {
  const data = { market: [{ slug: "a", name: "A", club: "X", pic: "pa" }], weeks: [{ playing: { cards: 2, players: [{ player: "a", name: "A", club: "X", pic: "pa" }, { player: "b", name: "B", club: null, pic: "pb" }] } }] } as unknown as Sorare;
  expect(searchIndex(data).map((x) => x.slug)).toEqual(["a", "b"]);
  expect(searchIndex(null)).toEqual([]);
});

it("includes both foreign indexes and deduplicates owned identities", () => {
  const data = { market: [], weeks: [{ playing: { players: [{ player: "pl", name: "PL", club: "Arsenal", pic: "" }] } }] } as unknown as Sorare;
  const foreign = [{ slug: "pl", name: "PL", club: "Arsenal", pic: "" }, { slug: "bl", name: "BL", club: "Bayern", pic: "" }];
  expect(searchIndex(data, foreign).map(p => p.slug)).toEqual(["pl", "bl"]);
});

it("keeps an explicitly selected calendar week in a global search result", () => {
  expect(searchPlayerHref("pl-player", new URLSearchParams("w=2026-10-23&league=PL"))).toBe("/players/pl-player?w=2026-10-23");
  expect(searchPlayerHref("pl-player", new URLSearchParams())).toBe("/players/pl-player");
});
