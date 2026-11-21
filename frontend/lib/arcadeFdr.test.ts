import { describe, expect, it } from "vitest";
import { ARCADE_FDR_DAYS, boardFixtures, clubsOf, matchFixture, nameMatch, fdrOf, leagueLabel, settleKickoffs, sofixWords, withClubs, type FdrFixture } from "./arcadeFdr";
import type { FixtureGrid } from "./types";

const side = (code: string, name: string, bucket: 1 | 2 | 3 | 4 | 5) => ({ code, name, bucket, label: "Even", cleanSheet: 0.3, xgFor: 1.4, xgAgainst: 1.1 });
const fixture = (kickoff: string, home: string, away: string, league: FdrFixture["league"] = "PL"): FdrFixture => ({ league, kickoff, home: side(home.slice(0, 3).toUpperCase(), home, 2), away: side(away.slice(0, 3).toUpperCase(), away, 4) });
const game = (kickoff: string, home: string, away: string, slug = "premier-league-gb-eng") => ({ kickoff, competition: { slug }, home: { name: home }, away: { name: away } });

describe("Arcade and the league boards", () => {
  it("matches clubs by the words their names share, ignoring accents and FC-like words", () => {
    expect(nameMatch("Atlético de Madrid", "Ath Madrid")).toBeGreaterThan(0);
    expect(nameMatch("Tottenham Hotspur FC", "Tottenham")).toBe(1);
    expect(nameMatch("Real Madrid", "Real Betis")).toBe(1);
    expect(nameMatch("FC Bayern München", "Bayern Munich")).toBeGreaterThan(0);
    expect(nameMatch("Arsenal FC", "Everton")).toBe(0);
    // 9 Nov 2026: Sorare's "N.E.C. Nijmegen v Stade Rennais F.C." against the board's "N.E.C. v Rennes" matched no word.
    expect(nameMatch("N.E.C. Nijmegen", "N.E.C.")).toBe(1);
    expect(nameMatch("Stade Rennais F.C.", "Rennes")).toBe(1);
    expect(nameMatch("Stade Rennais F.C.", "Stade Reims")).toBe(1); // "stade" only: Rennais is not Reims
  });

  it("finds a Sorare game's fixture in the same league at the same kick-off, by names when two kick off together", () => {
    const board = [fixture("2026-10-25T14:00:00Z", "Arsenal", "Everton"), fixture("2026-10-25T14:00:00Z", "Liverpool", "Brighton"), fixture("2026-10-25T16:30:00Z", "Chelsea", "Fulham")];
    expect(matchFixture(game("2026-10-25T14:00:00Z", "Liverpool FC", "Brighton & Hove Albion FC"), board)?.home.name).toBe("Liverpool");
    expect(matchFixture(game("2026-10-25T16:30:00Z", "Chelsea FC", "Fulham FC"), board)?.away.name).toBe("Fulham");
    expect(matchFixture(game("2026-10-25T16:35:00Z", "X", "Y"), board)?.home.name).toBe("Chelsea"); // alone at that time
    expect(matchFixture(game("2026-10-25T14:00:00Z", "Unknown", "Other"), board)).toBeNull(); // two at once, no name in common
    expect(matchFixture(game("2026-10-25T16:30:00Z", "Chelsea FC", "Fulham FC", "uefa-champions-league"), board)).toBeNull(); // not a board league
  });

  it("builds both sides of each scheduled board fixture, and leaves out a side without a forecast", () => {
    const cell = (fixture_id: number, venue: "H" | "A", opponent_code: string, bucket: 1 | 2 | 3 | 4 | 5 | null) => ({ fixture_id, venue, opponent_code, kickoff_utc: "2026-10-25T14:00:00Z", date_confirmed: true, rescheduled: false, status: "scheduled" as const, result: null,
      prediction: bucket === null ? null : { difficulty: bucket, label: "Even" as const, bucket, expected_points: 1.4, probabilities: { win: 0.4, draw: 0.3, loss: 0.3 }, clean_sheet: 0.3, xg_for: 1.5, xg_against: 1.1 } });
    const grid = { competition: "PL", season: "2026", current_matchday: 9, model_version: null, lens_scales: {}, matchdays: [], teams: [
      { code: "ARS", name: "Arsenal", color: "#f00", crest_url: null, cells: [[cell(1, "H", "EVE", 2)], [cell(2, "A", "CHE", 3)]] },
      { code: "EVE", name: "Everton", color: "#00f", crest_url: null, cells: [[cell(1, "A", "ARS", 5)]] },
      { code: "CHE", name: "Chelsea", color: "#00f", crest_url: null, cells: [[cell(2, "H", "ARS", null)]] },
    ] } as unknown as FixtureGrid;
    const out = boardFixtures(grid, "PL", 0, Date.parse("2026-11-01T00:00:00Z"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ home: { code: "ARS", bucket: 2, difficulty: 2 }, away: { code: "EVE", bucket: 5, difficulty: 5 } });
  });

  it("reaches a game eleven days away and the last game of a two-month set, with numbers rounded for the page", () => {
    // 9 Nov 2026: Divination's first club games were 11 days away (an international break) and its last on 6 Jan; 8 days rated none.
    const now = Date.parse("2026-11-09T12:00:00Z");
    const cell = (fixture_id: number, venue: "H" | "A", kickoff_utc: string) => ({ fixture_id, venue, opponent_code: "X", kickoff_utc, date_confirmed: true, rescheduled: false, status: "scheduled" as const, result: null,
      prediction: { difficulty: 37.4999, label: "Even" as const, bucket: 3, expected_points: 1.4, probabilities: { win: 0.4, draw: 0.3, loss: 0.3 }, clean_sheet: 0.312345, xg_for: 1.456789, xg_against: 1.123456 } });
    const grid = { competition: "PD", season: "2026", current_matchday: 13, model_version: null, lens_scales: {}, matchdays: [], teams: [
      { code: "RMA", name: "Real Madrid", color: "#fff", crest_url: null, cells: [[cell(1, "H", "2026-11-20T20:00:00Z")], [cell(2, "A", "2027-01-06T20:15:00Z")]] },
      { code: "BAR", name: "Barcelona", color: "#00f", crest_url: null, cells: [[cell(1, "A", "2026-11-20T20:00:00Z")], [cell(2, "H", "2027-01-06T20:15:00Z")]] },
    ] } as unknown as FixtureGrid;
    const out = boardFixtures(grid, "PD", now, now + ARCADE_FDR_DAYS * 86_400_000);
    expect(out.map((f) => f.kickoff)).toEqual(["2026-11-20T20:00:00Z", "2027-01-06T20:15:00Z"]);
    expect(out[0]!.home).toMatchObject({ difficulty: 37.5, cleanSheet: 0.31, xgFor: 1.46, xgAgainst: 1.12 });
  });
});

describe("one FDR form across Arcade", () => {
  // 9 Nov 2026: tickets and Teams to build around showed the 1-5 band, cards, Players and Batch difficulty out of 100.
  const side = { code: "RMA", name: "Real Madrid", difficulty: 23.6, bucket: 1 as const, label: "Very favourite", cleanSheet: 0.5, xgFor: 2.1, xgAgainst: 0.7 };
  it("is the difficulty out of 100 in its band colour, never the band number", () => {
    expect(fdrOf(side)).toEqual({ value: 24, band: 1, title: "Very favourite · difficulty 24 of 100 (lower is easier)" });
  });
  it("says it is missing rather than inventing one", () => {
    expect(fdrOf({ ...side, difficulty: undefined })).toEqual({ value: null, band: 1, title: "Very favourite · difficulty unknown" });
    expect(fdrOf(null)).toEqual({ value: null, band: null, title: "FDR unavailable" });
  });
});

describe("one name per league", () => {
  // 9 Nov 2026: Sorare's "English League Players" beside Sofix's "Premier League".
  it("uses Sofix's name for a league it has a board for, else Sorare's", () => {
    expect(leagueLabel({ slug: "premier-league-gb-eng", name: "English League Players" })).toBe("Premier League");
    expect(leagueLabel({ slug: "laliga-es", name: "LALIGA EA Sports" })).toBe("LaLiga");
    expect(leagueLabel({ slug: "uefa-nations-league", name: "UEFA Nations League" })).toBe("UEFA Nations League");
  });
});

describe("kick-offs Sorare has not set yet (plans/arcade-trust.md step 2)", () => {
  // 10 Nov 2026: Sorare listed 40 games at 00:00 UTC, all of LaLiga's 6 Dec round among them; the chain planned "Sun 6 Dec 01:00".
  const tbc = (home: string, away: string, slug = "laliga-es") => ({ ...game("2026-12-06T00:00:00Z", home, away, slug), id: `${home}-${away}` });
  it("takes the board's kick-off when its clubs match within four days", () => {
    const board = [fixture("2026-12-06T15:15:00Z", "Sevilla", "Malaga", "PD"), fixture("2026-12-06T17:30:00Z", "Barcelona", "Celta", "PD")];
    const [sevilla, barca] = settleKickoffs([tbc("Sevilla FC", "Málaga CF"), tbc("FC Barcelona", "RC Celta")], board);
    expect(sevilla).toMatchObject({ kickoff: "2026-12-06T15:15:00Z" });
    expect(sevilla).not.toHaveProperty("tbc");
    expect(barca).toMatchObject({ kickoff: "2026-12-06T17:30:00Z" });
  });
  it("marks it Date TBC when no board fixture of those clubs has a time", () => {
    const [game] = settleKickoffs([tbc("Sevilla FC", "Málaga CF")], [fixture("2026-12-20T15:15:00Z", "Sevilla", "Malaga", "PD"), fixture("2026-12-06T15:15:00Z", "Sevilla", "Betis", "PD")]);
    expect(game).toMatchObject({ kickoff: "2026-12-06T00:00:00Z", tbc: true });
    expect(settleKickoffs([tbc("Napoli", "Como", "uefa-nations-league")], [])[0]).toMatchObject({ tbc: true });
  });
  it("leaves a game with a real kick-off as it is", () => {
    const real = { ...game("2026-12-06T15:15:00Z", "Sevilla FC", "Málaga CF", "laliga-es"), id: "x" };
    expect(settleKickoffs([real], [])).toEqual([real]);
  });
});

describe("an old board copy's kick-offs (plans/arcade-trust.md step 4)", () => {
  const board = [fixture("2026-12-07T20:00:00Z", "Sevilla", "Malaga", "PD")];
  const copied = { ...game("2026-12-06T15:15:00Z", "Sevilla FC", "Málaga CF", "laliga-es"), id: "s" };
  it("takes the board's time for a game moved since the copy was read", () => {
    expect(settleKickoffs([copied], board, true)[0]).toMatchObject({ kickoff: "2026-12-07T20:00:00Z" });
  });
  it("keeps Sorare's own time on a fresh read", () => {
    expect(settleKickoffs([copied], board)[0]).toMatchObject({ kickoff: "2026-12-06T15:15:00Z" });
  });
});

describe("the main app's words and pictures in Arcade (plans/arcade-trust.md step 13)", () => {
  it("colours FDR by its number with the same cut-offs in every league, never the league's own band", () => {
    // 20 Nov 2026: Nice v PSG at 29 was "Favourite" while Man City at 30 was "Very favourite".
    const psg = { ...side("PSG", "Paris SG", 2), difficulty: 29 }, city = { ...side("MCI", "Man City", 1), difficulty: 30 };
    expect(fdrOf(psg)).toMatchObject({ value: 29, band: 1 });
    expect(fdrOf(city)).toMatchObject({ value: 30, band: 1 });
    expect([35, 36, 46, 56, 66].map((d) => fdrOf({ ...side("X", "X", 3), difficulty: d }).band)).toEqual([1, 2, 3, 4, 5]);
    expect(fdrOf({ ...side("X", "X", 4), difficulty: undefined }).band).toBe(4); // no number: the board's band stands
    expect(fdrOf(psg).title).toMatch(/^Very favourite · difficulty 29 of 100/);
  });
  it("names each club as Sofix does, with its crest and colour, by its Sorare slug", () => {
    const clubs = clubsOf([{ teams: [{ sorare_slug: "espanyol-barcelona", name: "Espanyol", crest_url: "https://c/esp.png", color: "#1f6fb2" }] }] as never);
    expect(clubs.get("espanyol-barcelona")).toEqual({ name: "Espanyol", crest: "https://c/esp.png", color: "#1f6fb2" });
    const game = { id: "G", kickoff: "", status: "", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: "espanyol-barcelona", name: "RCD Espanyol de Barcelona", crest: null }, away: { slug: "other", name: "Other FC", crest: "x" } };
    const [named] = withClubs([game], clubs);
    expect(named!.home).toEqual({ slug: "espanyol-barcelona", name: "Espanyol", crest: "https://c/esp.png" });
    expect(named!.away).toEqual(game.away); // a club no board knows keeps Sorare's name
  });
  it("says Premier League where Sorare says English League", () => {
    expect(sofixWords("Collect English players in English League")).toBe("Collect English players in Premier League");
    expect(sofixWords("Big 5 English League Players")).toBe("Big 5 Premier League");
  });
});
