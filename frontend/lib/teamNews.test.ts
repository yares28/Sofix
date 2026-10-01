import { describe, expect, it } from "vitest";
import { gameLine, idleNote, lockChip, movedWhy, nationalWeek, shares, sinceLabel, splitLabel } from "./teamNews";
import type { NewsGame, NewsMove } from "./play";

const NOW = new Date("2026-10-07T12:00:00Z"); // Wed 7 Oct 14:00 in Madrid
const game: NewsGame = { id: "g1", kickoff: "2026-10-11T14:15:00Z", team: "Real Sociedad", opponent: "Deportivo", venue: "H" };

describe("the split of the players", () => {
  it("is drawn in proportion, with a sliver for the few who are out so they are never lost", () => {
    const parts = shares({ likely: 35, doubtful: 21, unlikely: 16, out: 1 });

    expect(parts.map((p) => [p.key, p.count])).toEqual([
      ["likely", 35],
      ["doubtful", 21],
      ["unlikely", 16],
      ["out", 1],
    ]);
    expect(parts.find((p) => p.key === "out")!.flex).toBeGreaterThan(1);
    expect(parts.find((p) => p.key === "likely")!.flex).toBe(35);
  });

  it("leaves a band with nobody in it out", () => {
    expect(shares({ likely: 5, doubtful: 0, unlikely: 0, out: 0 }).map((p) => p.key)).toEqual(["likely"]);
  });

  it("is spoken for a screen reader", () => {
    expect(splitLabel({ likely: 35, doubtful: 21, unlikely: 16, out: 1 })).toBe("35 likely to start, 21 in doubt, 16 unlikely, 1 out");
    expect(splitLabel({ likely: 2, doubtful: 0, unlikely: 0, out: 0 })).toBe("2 likely to start");
  });
});

describe("the game of a row", () => {
  it("says who he plays, at home or away, and when in Madrid time", () => {
    expect(gameLine(game)).toBe("v Deportivo · Sun 16:15");
    expect(gameLine({ ...game, venue: "A" })).toBe("at Deportivo · Sun 16:15");
    expect(gameLine({ ...game, venue: null })).toBe("Deportivo · Sun 16:15");
  });

  it("names what moved a player: his status, else his game", () => {
    const move = (kind: NewsMove["kind"]) => ({ kind, game }) as NewsMove;

    expect(movedWhy(move("out"))).toBe("Out");
    expect(movedWhy(move("doubt"))).toBe("Doubt");
    expect(movedWhy(move("suspended"))).toBe("Suspended");
    expect(movedWhy(move("available"))).toBe("v Deportivo · Sun 16:15");
    expect(movedWhy(move(null))).toBe("v Deportivo · Sun 16:15");
  });
});

describe("the lock and the comparison", () => {
  it("counts down to the lock, or says it is locked", () => {
    expect(lockChip("2026-10-09T19:00:00Z", NOW)).toBe("Locks Fri 21:00 · in 2 d 7 h");
    expect(lockChip("2026-10-07T18:00:00Z", NOW)).toBe("Locks Wed 20:00 · in 6 h");
    expect(lockChip("2026-10-07T11:00:00Z", NOW)).toBe("Locked");
  });

  it("says since yesterday when the reading is from the day before, else since the day and time", () => {
    expect(sinceLabel("2026-10-06T20:00:00Z", NOW)).toBe("since yesterday");
    expect(sinceLabel("2026-10-05T20:00:00Z", NOW)).toBe("since Mon 22:00");
  });
});

describe("why there is no news yet", () => {
  const week = (competition: string) => ({ gameweek: { number: 19 }, playing: { players: [{ games: [{ competition }] }, { games: [{ competition }] }] } });

  it("says a national-team week is not Futbol Fantasy's, and where the next club games are", () => {
    const note = idleNote(week("uefa-nations-league"), { round: 8, yours: 9 });

    expect(note.lead).toBe("GW19 is national-team games.");
    expect(note.rest).toBe("Futbol Fantasy covers LaLiga only.");
    expect(note.lineups).toBe("Round 8's lineups are on Lineups (9 of your players).");
  });

  it("names no round when the page holds none, and speaks of one player in the singular", () => {
    expect(idleNote(week("international-friendlies"), null).lineups).toBeNull();
    expect(idleNote(week("uefa-nations-league"), { round: 8, yours: 1 }).lineups).toBe("Round 8's lineups are on Lineups (1 of your players).");
    expect(idleNote(week("uefa-nations-league"), { round: 8, yours: 0 }).lineups).toBe("Round 8's lineups are on Lineups (none of your players).");
  });

  it("says when it publishes a club's next game, in a week of club games", () => {
    const note = idleNote(week("laliga-es"), { round: 8, yours: 9 });

    expect(note.lead).toBe("Futbol Fantasy has not published a lineup for your players yet.");
    expect(note.rest).toContain("It publishes each club's next game about a day after its last one.");
    expect(note.lineups).toBeNull();
  });

  it("does not call a week national-team games while some of its games are a club's", () => {
    const mixed = { gameweek: { number: 19 }, playing: { players: [{ games: [{ competition: "uefa-nations-league" }] }, { games: [{ competition: "laliga-es" }] }] } };

    expect(idleNote(mixed, null).lead).toMatch(/^Futbol Fantasy has not published/);
    expect(idleNote({ gameweek: { number: 19 }, playing: { players: [] } }, null).lead).toMatch(/^Futbol Fantasy has not published/);
  });
});

describe("a week with a few games of other leagues in it (GW19 on 1 Oct: 15 national, 3 Segunda, 1 Argentine)", () => {
  const games = (...competitions: string[]) => ({
    gameweek: { number: 19 },
    playing: { players: competitions.map((competition) => ({ games: [{ competition }] })) },
  });
  const break_ = games(...Array(15).fill("uefa-nations-league"), ...Array(3).fill("segunda-division-es"), "superliga-argentina-de-futbol");

  it("is still national-team games: no LaLiga game, and the national ones are the bulk", () => {
    expect(nationalWeek(break_)).toBe(true);
    const note = idleNote(break_, { round: 8, yours: 9 });
    expect(note.lead).toBe("GW19 is national-team games.");
    expect(note.rest).toBe("Futbol Fantasy covers LaLiga only.");
  });

  it("is not once a LaLiga game is in it, however few", () => {
    expect(nationalWeek(games("uefa-nations-league", "uefa-nations-league", "uefa-nations-league", "laliga-es"))).toBe(false);
  });

  it("says there is no LaLiga when the week is not mostly national either", () => {
    const other = games("segunda-division-es", "segunda-division-es", "primera-a", "uefa-nations-league");

    expect(nationalWeek(other)).toBe(false);
    const note = idleNote(other, { round: 8, yours: 3 });
    expect(note.lead).toBe("GW19 has no LaLiga games.");
    expect(note.rest).toBe("Futbol Fantasy covers LaLiga only.");
    expect(note.lineups).toBe("Round 8's lineups are on Lineups (3 of your players).");
  });
});
