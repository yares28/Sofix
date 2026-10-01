import { describe, expect, it } from "vitest";
import {
  calledUpIn,
  chanceTone,
  crestSource,
  freshness,
  gaugeText,
  initialsOf,
  kickoffLabel,
  lineupsGlance,
  matchState,
  otherWeekNote,
  pickMatch,
  readable,
  playerLabels,
  readLabel,
  roundDays,
  shortCode,
  sorareLine,
  squadOut,
  startersIn,
  statusLine,
  yoursSummary,
  sectionsOf,
  teamsRead,
  tint,
  yoursIn,
  yoursLabel,
  yoursPlayers,
  type LineupMatch,
  type LineupSide,
  type LineupsData,
} from "./lineups";

const NOW = new Date("2026-10-10T14:56:00Z"); // Sat 10 Oct 16:56 in Madrid

function side(name: string, extra: Partial<LineupSide> = {}): LineupSide {
  return {
    name,
    club: null,
    ffId: null,
    crest: null,
    coach: null,
    rotations: null,
    predictability: null,
    season: null,
    changedAt: null,
    published: true,
    squad: null,
    formation: "4-4-2",
    rows: [],
    alternatives: [],
    absent: [],
    unlinked: [],
    ...extra,
  };
}

function match(id: number, kickoff: string | null, extra: Partial<LineupMatch> = {}): LineupMatch {
  return {
    id,
    url: `https://www.futbolfantasy.com/partidos/${id}`,
    competition: "laliga",
    competitionName: "LaLiga",
    round: 8,
    kickoff,
    score: null,
    readAt: "2026-10-10T14:50:00Z",
    home: side("Home"),
    away: side("Away"),
    ...extra,
  };
}

function data(matches: LineupMatch[], extra: Partial<LineupsData> = {}): LineupsData {
  return { version: 1, generatedAt: NOW.toISOString(), readAt: "2026-10-10T14:50:00Z", failed: [], stopped: null, matches, cards: {}, ...extra };
}

const player = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `P ${id}`, p: 0.5, ...extra });

describe("the matches of the page", () => {
  it("groups them by competition and round, in kickoff order", () => {
    const sections = sectionsOf(
      data([
        match(3, "2026-10-14T19:00:00Z", { competition: "champions", competitionName: "Champions League", round: 2 }),
        match(1, "2026-10-11T14:15:00Z"),
        match(2, "2026-10-09T19:00:00Z"),
      ]),
    );

    expect(sections.map((s) => [s.competition, s.round, s.matches.map((m) => m.id)])).toEqual([
      ["laliga", 8, [2, 1]],
      ["champions", 2, [3]],
    ]);
    expect(sections[0]!.label).toBe("LaLiga · Round 8");
    expect(sections[1]!.label).toBe("Champions League · Matchday 2");
  });

  it("names a knockout tie by its phase", () => {
    const [section] = sectionsOf(
      data([match(1, "2026-10-14T19:00:00Z", { competition: "champions", competitionName: "Champions League", round: null, phase: "Octavos de final" })]),
    );

    expect(section!.label).toBe("Champions League · Octavos de final");
  });

  it("puts a match with no date after the dated ones", () => {
    const [section] = sectionsOf(data([match(1, null), match(2, "2026-10-11T14:15:00Z")]));

    expect(section!.matches.map((m) => m.id)).toEqual([2, 1]);
  });

  it("offers a competition only when the page holds one", () => {
    const one = sectionsOf(data([match(1, "2026-10-11T14:15:00Z"), match(2, "2026-10-11T16:15:00Z")]));
    const more = sectionsOf(
      data([match(1, "2026-10-11T14:15:00Z"), match(2, "2026-10-14T19:00:00Z", { competition: "europa-league", competitionName: "Europa League", round: 2 })]),
    );

    expect(new Set(one.map((s) => s.competition)).size).toBe(1);
    expect(new Set(more.map((s) => s.competition))).toEqual(new Set(["laliga", "europa-league"]));
  });

  it("opens on the match asked for, else the next one to be played", () => {
    const all = sectionsOf(data([match(1, "2026-10-09T19:00:00Z"), match(2, "2026-10-10T19:00:00Z"), match(3, "2026-10-11T19:00:00Z")]));

    expect(pickMatch(all, "3", NOW)?.id).toBe(3);
    expect(pickMatch(all, null, NOW)?.id).toBe(2);
    expect(pickMatch(all, "999", NOW)?.id).toBe(2);
    expect(pickMatch(all, null, new Date("2026-10-20T00:00:00Z"))?.id).toBe(3); // all played: the last
    expect(pickMatch([], null, NOW)).toBeNull();
  });
});

describe("what a match says about itself", () => {
  it("has kicked off once its kickoff has passed", () => {
    expect(matchState(match(1, "2026-10-10T14:00:00Z"), NOW)).toBe("started");
    expect(matchState(match(1, "2026-10-10T19:00:00Z"), NOW)).toBe("ahead");
    expect(matchState(match(1, null), NOW)).toBe("tbc");
  });

  it("writes the kickoff in Madrid time, or says the date is not known", () => {
    expect(kickoffLabel("2026-10-11T14:15:00Z")).toEqual({ day: "Sun 11 Oct", time: "16:15", short: "Sun 16:15" });
    expect(kickoffLabel(null)).toEqual({ day: "Date TBC", time: "TBC", short: "TBC" });
  });

  it("counts the players of his it names, in the eleven and among the alternatives", () => {
    const one = match(1, "2026-10-11T14:15:00Z", {
      home: side("Home", {
        rows: [{ line: "FWD", players: [player("1", { yours: "a" }), player("2")] }],
        alternatives: [player("3", { yours: "b" })],
      }),
      away: side("Away", { alternatives: [player("4", { yours: "c" })] }),
    });

    expect(yoursIn(one)).toBe(3);
  });
});

describe("which week the page is for", () => {
  it("writes the days of the round from its first kickoff to its last, in Madrid time", () => {
    expect(roundDays("2026-10-09T19:00:00Z", "2026-10-12T19:00:00Z")).toBe("Fri 9 – Mon 12 Oct");
    expect(roundDays("2026-09-30T19:00:00Z", "2026-10-03T19:00:00Z")).toBe("Wed 30 Sep – Sat 3 Oct");
    expect(roundDays("2026-10-10T19:00:00Z", "2026-10-10T21:00:00Z")).toBe("Sat 10 Oct");
  });

  it("links to the Sorare week the round feeds, or says Sorare has not opened it", () => {
    const open = { id: "2026-10-09", gw: "21", number: 21 };
    const early = { id: "2026-10-09", gw: null, number: null };

    expect(sorareLine(undefined, undefined, NOW)).toBeNull();
    expect(sorareLine(early, undefined, NOW)).toEqual({ text: "Sorare: not open yet", href: "/play?w=2026-10-09" });
    expect(sorareLine(open, "2026-10-16T14:00:00Z", NOW)).toEqual({ text: "Sorare GW21 · locks Fri 16:00", href: "/play?w=2026-10-09" });
    expect(sorareLine(open, "2026-10-10T10:00:00Z", NOW)?.text).toBe("Sorare GW21 · locked");
    expect(sorareLine(open, undefined, NOW)?.text).toBe("Sorare GW21");
  });

  it("says why the page shows round 8 when it was opened for another week", () => {
    const ask = (md: number | null, number: number | null) => otherWeekNote({ md, number }, 8, false);
    const base = "Futbol Fantasy only has each club's next LaLiga game: round 8.";

    expect(otherWeekNote(null, 8, false)).toBeNull();
    expect(ask(8, null)).toBeNull();
    expect(ask(6, null)).toBe(`${base} Round 6 has been played.`);
    expect(ask(9, null)).toBe(`${base} Round 9 comes after it.`);
    expect(ask(null, 19)).toBe(`${base} Sorare GW19 has no LaLiga round.`);
    expect(otherWeekNote({ md: null, number: 19 }, 8, true)).toBe(`${base} Sorare GW19 is national-team games.`);
    expect(otherWeekNote({ md: 6, number: null }, null, false)).toBeNull();
  });
});

describe("when a call-up is shown", () => {
  const called = [{ line: "FWD" as const, players: [player("1", { status: { international: true } }), player("2")] }];

  it("is once the club has named its squad, and not before", () => {
    expect(squadOut(side("A", { squad: true }))).toBe(true);
    expect(squadOut(side("A", { squad: false }))).toBe(false);
    expect(squadOut(side("A", { squad: null }))).toBe(false);
    expect(squadOut(side("A", { squad: true, published: false }))).toBe(false);
  });

  it("puts it in the legend only when some player in the match shows one", () => {
    const named = match(1, "2026-10-11T14:15:00Z", { home: side("H", { squad: true, rows: called }), away: side("A", { squad: false, rows: called }) });
    const unnamed = match(1, "2026-10-11T14:15:00Z", { home: side("H", { squad: false, rows: called }), away: side("A", { squad: null, rows: called }) });
    const none = match(1, "2026-10-11T14:15:00Z", { home: side("H", { squad: true, rows: [{ line: "FWD", players: [player("2")] }] }) });

    expect(calledUpIn(named)).toBe(true);
    expect(calledUpIn(unnamed)).toBe(false);
    expect(calledUpIn(none)).toBe(false);
  });
});

describe("the glance Home takes at the lineups", () => {
  const europa = { competition: "europa-league", competitionName: "Europa League", round: 2 };
  const two = (kickoff: string, extra: Partial<LineupMatch> = {}) =>
    match(1, kickoff, {
      ...extra,
      home: side("Home", { rows: [{ line: "FWD", players: [player("1", { yours: "a" })] }], alternatives: [player("3", { yours: "b" })] }),
      away: side("Away", { alternatives: [player("4", { yours: "c" })] }),
    });

  it("is the LaLiga round still to play and how many of his players are in it", () => {
    const more = match(2, "2026-10-11T16:15:00Z", { home: side("X", { alternatives: [player("9", { yours: "d" })] }) });

    expect(lineupsGlance(data([two("2026-10-11T14:15:00Z"), more]), NOW)).toEqual({ round: 8, yours: 4 });
  });

  it("counts a player once, and leaves out the other competitions", () => {
    const again = match(2, "2026-10-11T16:15:00Z", { home: side("X", { alternatives: [player("1", { yours: "a" })] }) });

    expect(lineupsGlance(data([two("2026-10-11T14:15:00Z"), again, two("2026-10-14T19:00:00Z", europa)]), NOW)).toEqual({ round: 8, yours: 3 });
  });

  it("is nothing when the page holds no LaLiga round to come", () => {
    expect(lineupsGlance(null, NOW)).toBeNull();
    expect(lineupsGlance(data([]), NOW)).toBeNull();
    expect(lineupsGlance(data([two("2026-10-09T14:15:00Z")]), NOW)).toBeNull();
    expect(lineupsGlance(data([two("2026-10-14T19:00:00Z", europa)]), NOW)).toBeNull();
  });
});

describe("your players in a match, for the strip at its top", () => {
  const one = match(1, "2026-10-11T14:15:00Z", {
    home: side("Home", {
      club: "RSO",
      rows: [{ line: "FWD", players: [player("1", { name: "Mikel Oyarzabal", p: 0.9, yours: "oyarzabal" }), player("2", { name: "Ander Barrenetxea", p: 0.5 })] }],
      alternatives: [player("3", { name: "Takefusa Kubo", p: 0.4, yours: "kubo" }), player("4", { name: "Orri Steinn Óskarsson", p: 0, yours: "orri", status: { kind: "suspended" } })],
    }),
    away: side("Away", {
      club: "DEP",
      rows: [{ line: "DEF", players: [player("5", { name: "Luismi Cruz", p: 0.7, yours: "luismi", status: { kind: "doubt" } })] }],
      alternatives: [player("6", { name: "Noé Carrillo", p: null, yours: "noe" })],
    }),
  });

  it("lists the eleven first by chance, then the alternatives, with his short name, club and what is wrong with him", () => {
    const list = yoursPlayers(one);

    expect(list.map((p) => [p.label, p.p, p.starting, p.club, p.kind])).toEqual([
      ["OYARZABAL", 0.9, true, "RSO", null],
      ["CRUZ", 0.7, true, "DEP", "doubt"],
      ["KUBO", 0.4, false, "RSO", null],
      ["CARRILLO", null, false, "DEP", null],
      ["ÓSKARSSON", 0, false, "RSO", "suspended"],
    ]);
    expect(list[0]).toMatchObject({ slug: "oyarzabal", name: "Mikel Oyarzabal" });
  });

  it("counts the same players as the tab does", () => {
    expect(yoursPlayers(one)).toHaveLength(yoursIn(one));
    expect(yoursPlayers(match(2, null))).toEqual([]);
  });
});

describe("what a player is called on a card and on a chip", () => {
  it("is his surname, with an initial where two of the same side share it, whichever list they are in", () => {
    const labels = playerLabels([
      { id: "1", name: "Mikel Oyarzabal" },
      { id: "2", name: "Álex Remiro" },
      { id: "3", name: "Jon Williams" },
      { id: "4", name: "Nico Williams" },
    ]);

    expect(labels).toEqual({ "1": "OYARZABAL", "2": "REMIRO", "3": "J. WILLIAMS", "4": "N. WILLIAMS" });
  });
});

describe("what a match tab says about your players", () => {
  const mixed = match(1, "2026-10-11T14:15:00Z", {
    home: side("Home", {
      rows: [{ line: "FWD", players: [player("1", { yours: "a" }), player("2")] }],
      alternatives: [player("3", { yours: "b" }), player("5", { yours: "c" })],
    }),
    away: side("Away", { rows: [{ line: "DEF", players: [player("4", { yours: "d" })] }], alternatives: [player("6", { yours: "e" })] }),
  });

  it("counts yours in the match and how many of them are in the probable eleven", () => {
    expect(yoursIn(mixed)).toBe(5);
    expect(startersIn(mixed)).toBe(2);
    expect(yoursLabel(mixed)).toBe("5 yours · 2 starting");
  });

  it("says none starting when every one of yours is an alternative", () => {
    const none = match(2, "2026-10-11T16:15:00Z", { home: side("H", { alternatives: [player("7", { yours: "a" }), player("8", { yours: "b" }), player("9", { yours: "c" })] }) });

    expect(yoursLabel(none)).toBe("3 yours · 0 starting");
    expect(yoursLabel(match(3, null))).toBe("0 yours · 0 starting");
  });
});

describe("how fresh the reading is", () => {
  const read = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString();

  it("is fresh under a day, with the time of the newest read", () => {
    const f = freshness(data([match(1, "2026-10-11T14:15:00Z", { readAt: read(1) })], { readAt: read(0.1) }), NOW);

    expect(f.state).toBe("fresh");
    expect(f.readAt).toBe(read(0.1));
  });

  it("says it could not read when the last ask failed, and the reading shown is older", () => {
    const f = freshness(data([match(1, "2026-10-11T14:15:00Z", { readAt: read(3) })], { failed: ["x: HTTP 403"], readAt: read(0.1) }), NOW);

    expect(f.state).toBe("failed");
    expect(f.readAt).toBe(read(0.1));
    expect(f.shown).toBe(read(3));
  });

  it("is too old once the newest reading is over a day old", () => {
    const f = freshness(data([match(1, "2026-10-11T14:15:00Z", { readAt: read(31) })], { readAt: read(31) }), NOW);

    expect(f.state).toBe("old");
  });

  it("is empty when the site has never been read", () => {
    expect(freshness(data([], { readAt: null }), NOW).state).toBe("none");
  });

  it("counts the teams that published their lineup", () => {
    const one = match(1, "2026-10-11T14:15:00Z", { home: side("A"), away: side("B", { published: false }) });
    const two = match(2, "2026-10-11T16:15:00Z");

    expect(teamsRead([one, two])).toEqual({ published: 3, teams: 4 });
  });
});

describe("a player's look", () => {
  it("is shaded by his chance of starting", () => {
    expect(chanceTone(0.9)).toBe("strong");
    expect(chanceTone(0.8)).toBe("strong");
    expect(chanceTone(0.7)).toBe("good");
    expect(chanceTone(0.5)).toBe("mid");
    expect(chanceTone(0.4)).toBe("mid");
    expect(chanceTone(0.2)).toBe("low");
    expect(chanceTone(0)).toBe("low");
    expect(chanceTone(null)).toBe("none");
  });

  it("is named by his surname, with an initial when two of a side share it", () => {
    const side = [
      { id: "1", name: "Sergio Gómez", p: 0.8 },
      { id: "2", name: "Álex Gómez", p: 0.5 },
      { id: "3", name: "Mikel Oyarzabal", p: 0.9 },
      { id: "4", name: "Isco", p: 0.5 },
    ];

    expect(playerLabels(side)).toEqual({ "1": "S. GÓMEZ", "2": "Á. GÓMEZ", "3": "OYARZABAL", "4": "ISCO" });
  });

  it("has the two letters of his name when a card has no picture", () => {
    expect(initialsOf("Mikel Oyarzabal")).toBe("MO");
    expect(initialsOf("Isco")).toBe("IS");
  });
});

describe("the payload the job wrote", () => {
  it("is read when it has the job's shape and left out when it does not", () => {
    expect(readable({ version: 1, matches: [] })?.matches).toEqual([]);
    expect(readable({ version: 1, matches: [] })?.cards).toEqual({});
    expect(readable({ version: 2, matches: [] })).toBeNull();
    expect(readable({ version: 1, matches: "x" })).toBeNull();
    expect(readable(null)).toBeNull();
  });
});

describe("the words on the page", () => {
  it("says when a reading was made: how long ago and the Madrid time", () => {
    expect(readLabel("2026-10-10T14:56:00Z", NOW)).toBe("just now (16:56)");
    expect(readLabel("2026-10-09T15:05:00Z", NOW)).toBe("24 h ago (17:05)");
    expect(readLabel("2026-09-29T09:40:00Z", NOW)).toBe("11 days ago (Tue 11:40)");
    expect(readLabel(null, NOW)).toBe("never");
  });

  it("calls a club by our code, else by the first three letters of its name", () => {
    expect(shortCode({ ...side("Real Sociedad"), club: "RSO" })).toBe("RSO");
    expect(shortCode(side("Bayern München"))).toBe("BAY");
    expect(shortCode(side("Sp. Lisboa"))).toBe("SP.");
  });

  it("words the site's two gauges in English, by its label and else by its step", () => {
    expect(gaugeText({ value: 1, label: "Sin rotaciones" }, "rotations")).toBe("No rotation");
    expect(gaugeText({ value: 5, label: "Rotaciones extremas" }, "rotations")).toBe("Extreme rotation");
    expect(gaugeText({ value: 4, label: "Poco previsible" }, "predictability")).toBe("Not very predictable");
    expect(gaugeText({ value: 1, label: "???" }, "predictability")).toBe("Very predictable");
    expect(gaugeText(null, "rotations")).toBeNull();
  });

  it("puts the season's predictability beside the round's", () => {
    expect(statusLine({ value: 4, label: "Poco previsible" }, 0.83)).toBe("Not very predictable this round · 83% over the season");
    expect(statusLine({ value: 4, label: "Poco previsible" }, null)).toBe("Not very predictable this round");
    expect(statusLine(null, 0.83)).toBe("83% predictable over the season");
    expect(statusLine(null, null)).toBeNull();
  });

  it("sums up the owner's players on a match for the strip's tooltip", () => {
    expect(yoursSummary(0)).toBe("none of your players");
    expect(yoursSummary(1)).toBe("1 of your players");
    expect(yoursSummary(3)).toBe("3 of your players");
  });
});

describe("the crests", () => {
  it("are drawn only from the two hosts the page may load from", () => {
    expect(crestSource("https://crests.football-data.org/86.png")).toBe("https://crests.football-data.org/86.png");
    expect(crestSource("https://static.futbolfantasy.com/uploads/images/equipos/escudom/16.png")).toContain("escudom/16.png");
    expect(crestSource("https://evil.example/86.png")).toBeNull();
    expect(crestSource("https://static.futbolfantasy.com/other.png")).toBeNull();
    expect(crestSource(null)).toBeNull();
  });

  it("tints a club colour, and leaves anything that is not a hex colour clear", () => {
    expect(tint("#0067b1", "1a")).toBe("#0067b11a");
    expect(tint("blue", "1a")).toBe("transparent");
    expect(tint(undefined, "1a")).toBe("transparent");
  });
});
