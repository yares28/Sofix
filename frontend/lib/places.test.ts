import { describe, expect, it } from "vitest";
import { placeOf, viewOf } from "./places";

describe("placeOf and viewOf", () => {
  it("groups every route under its place", () => {
    const cases: [string, string | null, string | null][] = [
      ["/", "This week", "Recap"],
      ["/play", "This week", "Sorare"],
      ["/fixtures", "This week", "LaLiga"],
      ["/lineups", "This week", "Lineups"],
      ["/missions", "This week", "Missions"],
      ["/season", "Season", "Fixtures"],
      ["/difficulty", "Season", "Difficulty"],
      ["/table", "Season", "Table"],
      ["/team/FCB", "Season", null],
      ["/cards", "Gallery", "Cards"],
      ["/players/arda-guler", "Gallery", "Players"],
      ["/audit", "Audit", "Audit"],
      ["/control", null, null],
    ];
    for (const [path, place, view] of cases) {
      const found = placeOf(path);
      expect(found?.label ?? null, path).toBe(place);
      expect(found ? (viewOf(found, path)?.label ?? null) : null, path).toBe(view);
    }
  });
});
