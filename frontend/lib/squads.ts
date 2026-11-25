import { z } from "zod";

/**
 * Squads (plans/squad-prices.md): per league, each club's Pro teams and Arena sevens as frontiers, cheapest first, with each
 * game's scores (backend/app/sorare/squads.py, written once a day by the refresh's Sorare step). The page never searches:
 * a budget picks the last frontier entry whose `from` fits it.
 */
export const SQUADS_PREFIX = "squads:";
/** The start-of-season view: each club's team picked from last season's record, as bought before the first game. */
export const SQUADS_START_PREFIX = "squads_next:";
export type Season = "now" | "start";
export const seasonOf = (raw: string | undefined): Season => (raw === "start" ? "start" : "now");
/** Two clubs: one team from both clubs, each club's game a try of its round (written each night, R2 only). */
export const SQUADS_PAIRS_PREFIX = "squads_pairs:";
export const SQUADS_PAIR_PREFIX = "squads_pair:";
export const SQUADS_PAIRS_START_PREFIX = "squads_pairs_next:";
export const SQUADS_PAIR_START_PREFIX = "squads_pair_next:";
export type TeamMode = "one" | "two";
export const teamOf = (raw: string | undefined): TeamMode => (raw === "two" ? "two" : "one");
export const LEAGUES = [
  { code: "LALIGA", label: "LaLiga" },
  { code: "PL", label: "Premier League" },
  { code: "BL1", label: "Bundesliga" },
  { code: "FL1", label: "Ligue 1" },
] as const;
export type LeagueCode = (typeof LEAGUES)[number]["code"];
export const leagueOf = (raw: string | undefined): LeagueCode => LEAGUES.find((l) => l.code === raw)?.code ?? "LALIGA";

const score = z.number().finite().nullable();
const series = { best: z.array(score), median: z.array(score), average: z.array(score), xsReal: z.array(score), xsExp: z.array(score) };
const entry = z.object({ id: z.number().int(), from: z.number() });
const lanes = z.object({ full: z.array(entry), owned: z.array(entry) });
const player = z.object({
  name: z.string(), pos: z.enum(["GK", "DEF", "MID", "FWD"]), eur: z.number(), owned: z.boolean(), art: z.string().nullable(),
  // v2 (Q3): eur is the cheapest listing when `listed`, else the market value; `classic` the cheapest listed classic card
  listed: z.boolean().default(false), classic: z.number().nullable().default(null), ownedClassic: z.boolean().default(false),
  from: z.string().nullable().default(null), // start of season: his club last season, when not this one
  played: z.string(), scores: z.array(z.number()), mins: z.array(z.number()),
});
// The one classic card a team buys (Sorare lets an in-season lineup take one): for the full price, and with your cards counted.
const classicOf = { classic: z.string().nullable().default(null), classicToBuy: z.string().nullable().default(null) };
const team = z.object({
  id: z.number().int(), cards: z.array(z.string()), full: z.number(), toBuy: z.number(), mean: z.number(), cov: z.number(),
  over: z.number().int(), ...series, ...classicOf,
  // start of season: how this team, bought before the first game, did this season
  proof: z.object({ games: z.number(), five: z.number(), mean: z.number().nullable(), clears: z.number() }).nullable().default(null),
  ladder: z.object({ clears: z.number(), cash: z.number(), essence: z.number(), top: z.number() }).nullable(),
});
const seven = z.object({
  id: z.number().int(), gk: z.string(), outs: z.array(z.string()), gsub: z.string().nullable(), osub: z.string().nullable(),
  full: z.number(), toBuy: z.number(), mean: z.number(), started: z.number(), ...series, ...classicOf,
  subIn: z.array(z.boolean()), allStarted: z.array(z.boolean()),
});
const game = z.object({
  id: z.string(), date: z.string(), home: z.boolean(), opponent: z.string(), crest: z.string().nullable(),
  club: z.string().optional(), round: z.number().int().optional(), // two clubs: whose try, and its round
});
// the club's next league games, with the fixture grid's difficulty (bucket 1 easiest … 5 hardest, and its label)
const fixture = z.object({
  date: z.string(), home: z.boolean(), opponent: z.string(), crest: z.string().nullable(),
  bucket: z.number().int().nullable(), label: z.string().nullable(),
});
export type Fixture = z.infer<typeof fixture>;
const club = z.object({
  club: z.string(), crest: z.string().nullable(), games: z.array(game), players: z.record(z.string(), player),
  teams: z.array(team), pro: z.record(z.string(), lanes), sevens: z.array(seven), arena: z.object({ full: z.array(entry), owned: z.array(entry) }).partial(),
  // start of season: players with no game in the league last season (listed, never guessed); a club new to the league
  rounds: z.array(z.number().int()).optional(), // two clubs: each game's round
  clubs: z.array(z.object({ club: z.string(), crest: z.string().nullable(), run: z.array(fixture).default([]) })).optional(),
  run: z.array(fixture).default([]),
  newcomers: z.array(z.object({ slug: z.string(), name: z.string(), pos: z.string(), art: z.string().nullable() })).default([]),
  promoted: z.boolean().default(false),
});
const block = z.object({
  version: z.union([z.literal(1), z.literal(2)]), generatedAt: z.string(), league: z.string(), code: z.string(), name: z.string(), season: z.number().int(),
  targets: z.array(z.number()), captain: z.number(),
  record: z.string().nullable().default(null), rounds: z.number().int().nullable().default(null), cardsOut: z.boolean().default(true),
  logo: z.string().nullable().default(null), // the league's logo as Sorare hosts it
  seasonBonus: z.number().default(0), // an in-season card's bonus the block's scores carry (blocks before it: none)
  board: z.array(z.object({ target: z.number(), cash: z.number(), essence: z.number() })).nullable(),
  arenaLines: z.array(z.object({ score: z.number(), cash: z.number(), essence: z.number() })),
  clubs: z.array(club),
});

export type SquadsBlock = z.infer<typeof block>;
export type SquadClub = z.infer<typeof club>;
export type SquadTeam = z.infer<typeof team>;
export type SquadSeven = z.infer<typeof seven>;
export type SquadPlayer = z.infer<typeof player>;
export type Entry = z.infer<typeof entry>;
export type Step = { target: number; cash: number; essence: number };
export type Line = { score: number; cash: number; essence: number };

export function readable(raw: unknown): SquadsBlock | null {
  const parsed = block.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function readableClub(raw: unknown): SquadClub | null {
  const parsed = club.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// The pair picker's block: per pair and lane, each team as one row (backend squads.PAIR_PRO / PAIR_ARENA).
const row = z.array(z.number());
const pairsBlock = z.object({
  version: z.number(), generatedAt: z.string(), code: z.string(), name: z.string(), captain: z.number(),
  logo: z.string().nullable().default(null), seasonBonus: z.number().default(0),
  board: z.array(z.object({ target: z.number(), cash: z.number(), essence: z.number() })).nullable(),
  arenaLines: z.array(z.object({ score: z.number(), cash: z.number(), essence: z.number() })),
  pairs: z.array(z.object({
    id: z.string(), clubs: z.tuple([z.string(), z.string()]), crests: z.tuple([z.string().nullable(), z.string().nullable()]),
    games: z.number(), pro: z.record(z.string(), z.object({ full: z.array(row), owned: z.array(row) })),
    arena: z.object({ full: z.array(row), owned: z.array(row) }).partial(),
  })),
});
export type PairsBlock = z.infer<typeof pairsBlock>;
export function readablePairs(raw: unknown): PairsBlock | null {
  const parsed = pairsBlock.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** A pair as a picker tile, its rows read back into entries. */
export function pairTile(p: PairsBlock["pairs"][number]): Tile {
  const pro = (rows: number[][]): TileEntry[] => rows.map(([id, from, toBuy, full, mean, over, cov, cash, clears]) => ({
    id: id!, from: from!, toBuy: toBuy!, full: full!, mean: mean!, over: over!, cov: cov!, cash: cash!, clears: clears!,
  }));
  const arena = (rows: number[][] | undefined): ArenaEntry[] => (rows ?? []).map(([id, from, toBuy, full, mean, started]) => ({
    id: id!, from: from!, toBuy: toBuy!, full: full!, mean: mean!, started: started!,
  }));
  return {
    club: `${p.clubs[0]} + ${p.clubs[1]}`, crest: p.crests[0], games: p.games, promoted: false,
    pair: { id: p.id, clubs: p.clubs, crests: p.crests },
    pro: Object.fromEntries(Object.entries(p.pro).map(([k, l]) => [k, { full: pro(l.full), owned: pro(l.owned) }])),
    arena: { full: arena(p.arena.full), owned: arena(p.arena.owned) },
  };
}

export const TARGETS = [0.7, 0.8, 0.9, 1] as const;
export type Target = (typeof TARGETS)[number];
export const targetOf = (raw: string | undefined): Target => {
  const n = Number(raw) / 100;
  return TARGETS.find((t) => Math.abs(t - n) < 1e-9) ?? 0.9;
};
export const budgetOf = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 5000) : 40;
};
/** The start-of-season lane of the best team inside a budget whatever its coverage (shown when none reaches the target). */
export const ANY = "0.0";
/** A lane key the block uses for a target ("0.9", "1.0"). */
export const laneKey = (t: Target) => (t === 1 ? "1.0" : String(t));

/** The frontier entry a budget buys: the last whose budget fits, or none when even the cheapest does not. */
export function within(lane: Entry[] | undefined, budget: number): Entry | null {
  let out: Entry | null = null;
  for (const e of lane ?? []) if (e.from <= budget + 1e-9) out = e;
  return out;
}

export type Res = "clear" | "miss" | "skip";
export type Rung = { target: number; res: Res; back: boolean; prize: Step | null };

export const LIVES = 4; // lineups a step (Sorare's "4 lives and 4 lineup tries per step")

/** Sorare's step clock ("What is Pro?", 20 Nov 2026): a clear climbs; a step must be cleared by the end of the matchday it was
 * started in, in at most LIVES lineups, or the board starts again from its first step; a step started later in the matchday
 * of a clear has until the end of the following matchday. One array of tries a round, in kickoff order. Same rule as
 * squads.ladder in the backend. */
export function ladder(rounds: (number | null)[][], board: Step[]): { rungs: Rung[][]; clears: number; cash: number; essence: number; top: number } {
  let level = 0, clears = 0, cash = 0, essence = 0, top = 0, lives = LIVES;
  let deadline: number | null = null, clearedIn: number | null = null;
  const rungs: Rung[][] = [];
  const fail = (out: Rung[]) => {
    const last = out[out.length - 1] ?? rungs.flat().at(-1);
    if (last && last.res === "miss") last.back = level > 0;
    level = 0; lives = LIVES; deadline = null;
  };
  rounds.forEach((tries, r) => {
    const out: Rung[] = [];
    rungs.push(out);
    for (const v of tries) {
      const step = board[level]!;
      if (v === null) { out.push({ target: step.target, res: "skip", back: false, prize: null }); continue; }
      if (deadline === null) deadline = clearedIn === r ? r + 1 : r;
      if (v >= step.target) {
        clears += 1; cash += step.cash; essence += step.essence; top = Math.max(top, step.target);
        out.push({ target: step.target, res: "clear", back: false, prize: step });
        level = (level + 1) % board.length; lives = LIVES; deadline = null; clearedIn = r;
      } else {
        out.push({ target: step.target, res: "miss", back: false, prize: null });
        lives -= 1;
        if (lives === 0) fail(out);
      }
    }
    if (deadline !== null && deadline <= r) fail(out); // the matchday ends with the step not cleared
  });
  return { rungs, clears, cash, essence, top };
}

/** A card's saving as the team's one classic card, as squads.Player.saving does: his own classic is free when your cards
 * count, an in-season card of his you own saves nothing more. */
function saving(p: SquadPlayer, mine: boolean): number {
  if (mine && p.owned) return 0;
  if (mine && p.ownedClassic) return p.eur;
  return p.classic !== null ? Math.max(0, p.eur - p.classic) : 0;
}

function* fives<T>(xs: T[], from = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === 5) { yield picked; return; }
  for (let i = from; i <= xs.length - (5 - picked.length); i++) yield* fives(xs, i + 1, [...picked, xs[i]!]);
}

export type CustomTeam = Pick<SquadTeam, "cards" | "full" | "toBuy" | "classic" | "classicToBuy" | "mean" | "cov" | "over" | "best" | "median" | "average">;

/** A team the page puts together (a swapped card, Q6), scored as the backend scores its own (squads.series, pro_search):
 * each game's valid fives of its starters (GK, DEF, MID, FWD and one more), every in-season card with the season bonus but
 * the classic one, the captain on his raw score; a game without five counts 0; for two clubs a round counts its best try. */
export function customTeam(club: SquadClub, cards: string[], o: { captain: number; season: number; firstStep: number | null }): CustomTeam {
  const players = cards.map((s) => [s, club.players[s]!] as const);
  const pick = (mine: boolean) => {
    const best = players.reduce<{ s: string | null; v: number }>((m, [s, p]) => (saving(p, mine) > m.v ? { s, v: saving(p, mine) } : m), { s: null, v: 0 });
    return best;
  };
  const full = pick(false), owned = pick(true);
  const classic = owned.s ?? full.s;
  const best: (number | null)[] = [], median: (number | null)[] = [], average: (number | null)[] = [];
  club.games.forEach((_, i) => {
    const on = players.filter(([, p]) => p.played[i] === "S");
    const totals: number[] = [];
    for (const f of fives(on)) {
      const pos = f.map(([, p]) => p.pos);
      if (pos.filter((x) => x === "GK").length !== 1 || !pos.includes("DEF") || !pos.includes("MID") || !pos.includes("FWD")) continue;
      const raw = f.map(([, p]) => p.scores[i] ?? 0);
      totals.push(f.reduce((t, [s], j) => t + raw[j]! * (s === classic ? 1 : 1 + o.season), 0) + o.captain * Math.max(...raw));
    }
    if (!totals.length) { best.push(null); median.push(null); average.push(null); return; }
    totals.sort((a, b) => a - b);
    const mid = totals.length >> 1;
    best.push(totals[totals.length - 1]!);
    median.push(totals.length % 2 ? totals[mid]! : (totals[mid - 1]! + totals[mid]!) / 2);
    average.push(totals.reduce((a, b) => a + b, 0) / totals.length);
  });
  const rounds = club.rounds ?? club.games.map((_, i) => i);
  const top = new Map<number, number | null>();
  rounds.forEach((r, i) => { const v = best[i] ?? null; const was = top.get(r) ?? null; top.set(r, v === null ? was : was === null ? v : Math.max(was, v)); });
  const perRound = [...top.values()];
  return {
    cards, classic: full.s, classicToBuy: owned.s,
    full: players.reduce((t, [, p]) => t + p.eur, 0) - full.v,
    toBuy: players.reduce((t, [, p]) => t + (p.owned ? 0 : p.eur), 0) - owned.v,
    mean: perRound.reduce<number>((t, v) => t + (v ?? 0), 0) / (perRound.length || 1),
    cov: perRound.filter((v) => v !== null).length / (perRound.length || 1),
    over: o.firstStep === null ? 0 : perRound.filter((v) => v !== null && v >= o.firstStep!).length,
    best, median, average,
  };
}

/** The best Arena prize a score reached: the index of the highest line it cleared, -1 for none. */
export function tier(v: number | null, lines: Line[]): number {
  if (v === null) return -1;
  let out = -1;
  lines.forEach((l, i) => { if (v >= l.score) out = i; });
  return out;
}

const fmt = new Intl.NumberFormat("en-GB");
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });
export const eur = (n: number) => money.format(n);
/** "$5 + 2,500 essence", "500 essence", or null for nothing. */
export function prize(cash: number, essence: number): string | null {
  const parts = [cash ? `$${fmt.format(cash)}` : "", essence ? `${fmt.format(essence)} essence` : ""].filter(Boolean);
  return parts.length ? parts.join(" + ") : null;
}
export const shortPrize = (s: Pick<Step, "cash" | "essence">) => (s.cash ? `$${fmt.format(s.cash)}` : `${fmt.format(s.essence)} ess.`);

/** A player's name as a card's caption: the last word of a long name. */
export function shortName(name: string): string {
  const parts = name.replace(/ /g, " ").split(" ");
  return name.length <= 13 ? name : parts.length > 1 && parts[parts.length - 1]!.length > 3 ? parts[parts.length - 1]! : name;
}

const GENERIC = new Set(["RC", "CD", "CA", "FC", "AFC", "RCD", "SD", "UD", "CF", "SC", "SV", "AS", "OGC", "VfB", "VfL", "TSG", "1.", "Deportivo",
  "Olympique", "Stade", "Borussia", "Eintracht", "Union", "Club", "de", "La", "Le", "Les", "the"]);
/** A club as three letters when there is no code: "Real Madrid" RMA, "Manchester City" MCI, "Deportivo Alavés" ALA. */
export function oppCode(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 1 && /^(Real|Manchester)$/.test(words[0]!)) return (words[0]![0]! + words[1]!.slice(0, 2)).toUpperCase();
  const kept = words.filter((w) => !GENERIC.has(w));
  return (kept[0] ?? words[0] ?? name).slice(0, 3).toUpperCase();
}

/** The day of a kickoff, Madrid time: "22 Aug". */
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });

/** What the picker needs of each frontier entry, never the games: the price both ways, the score and its 320s. */
export type TileEntry = Entry & { toBuy: number; full: number; mean: number; over: number; cov: number; cash?: number; clears?: number };
export type ArenaEntry = Entry & { toBuy: number; full: number; mean: number; started: number };
export type Tile = {
  club: string;
  crest: string | null;
  games: number;
  promoted: boolean;
  pair?: { id: string; clubs: [string, string]; crests: [string | null, string | null] };
  pro: Record<string, { full: TileEntry[]; owned: TileEntry[] }>;
  arena: { full: ArenaEntry[]; owned: ArenaEntry[] };
};


export function tile(c: SquadClub): Tile {
  const teams = new Map(c.teams.map((t) => [t.id, t]));
  const sevens = new Map(c.sevens.map((s) => [s.id, s]));
  const pro: Tile["pro"] = {};
  const mapLane = (es: Entry[] | undefined): TileEntry[] =>
    (es ?? []).flatMap((e) => {
      const team = teams.get(e.id);
      return team ? [{ ...e, toBuy: team.toBuy, full: team.full, mean: team.mean, over: team.over, cov: team.cov }] : [];
    });
  for (const t of TARGETS) {
    const lanes = c.pro[laneKey(t)];
    pro[laneKey(t)] = { full: mapLane(lanes?.full), owned: mapLane(lanes?.owned) };
  }
  const arena = (es: Entry[] | undefined): ArenaEntry[] =>
    (es ?? []).flatMap((e) => {
      const s = sevens.get(e.id);
      return s ? [{ ...e, toBuy: s.toBuy, full: s.full, mean: s.mean, started: s.started }] : [];
    });
  const any = c.pro[ANY];
  if (any) pro[ANY] = { full: mapLane(any.full), owned: mapLane(any.owned) };
  return { club: c.club, crest: c.crest, games: c.games.length, promoted: c.promoted, pro, arena: { full: arena(c.arena.full), owned: arena(c.arena.owned) } };
}


export type SquadsPage = {
  code: LeagueCode;
  logo: string | null;
  seasonBonus: number;
  alone?: Tile[]; // two clubs: each club's own tile (this season), to set the pair against
  season: Season;
  team: TeamMode;
  record: string | null;
  rounds: number | null;
  cardsOut: boolean;
  name: string;
  generatedAt: string;
  captain: number;
  board: Step[] | null;
  arenaLines: Line[];
  tiles: Tile[];
  club: SquadClub | null;
};

export type Settings = { budget: number; target: Target; mine: boolean };
export type Choice =
  | { mode: "pro"; entry: TileEntry; price: number }
  | { mode: "arena"; entry: ArenaEntry; price: number }
  | { mode: "short"; entry: TileEntry; price: number } // start of season: the best team inside the budget, below the target
  | { mode: "none"; cheapest: number | null };

/** What a club offers at these settings: the Arena seven when it fields all five starters often enough, else the Pro team. */
export function choice(t: Tile, s: Settings): Choice {
  const lane = s.mine ? "owned" : "full";
  const pro = within(t.pro[laneKey(s.target)]?.[lane], s.budget) as TileEntry | null;
  const arena = within(t.arena[lane], s.budget) as ArenaEntry | null;
  if (arena && arena.started >= s.target - 1e-9 && (!pro || arena.toBuy <= pro.toBuy)) return { mode: "arena", entry: arena, price: s.mine ? arena.toBuy : arena.full };
  if (pro) return { mode: "pro", entry: pro, price: s.mine ? pro.toBuy : pro.full };
  const short = within(t.pro[ANY]?.[lane], s.budget) as TileEntry | null;
  if (short) return { mode: "short", entry: short, price: s.mine ? short.toBuy : short.full };
  const first = t.pro[laneKey(s.target)]?.[lane]?.[0];
  return { mode: "none", cheapest: first ? (s.mine ? first.toBuy : first.full) : null };
}

/** The picker's order: clubs with a team inside the budget, most games over Pro's first step first, then the cheaper; then the rest, cheapest first. */
export function ranked(tiles: Tile[], s: Settings): { tile: Tile; choice: Choice }[] {
  const out = tiles.map((tile) => ({ tile, choice: choice(tile, s) }));
  const key = (x: { tile: Tile; choice: Choice }) =>
    x.choice.mode === "none" ? [2, 0, 0, x.choice.cheapest ?? 1e9]
      : x.choice.mode === "short" ? [1, -x.choice.entry.cov, 0, x.choice.price]
      // a pair: the money its Pro board won, then its steps, then its price (cash and essence never convert)
      : x.tile.pair && x.choice.mode === "pro" ? [0, -(x.choice.entry.cash ?? 0), -(x.choice.entry.clears ?? 0), x.choice.price]
      : [0, -(x.choice.mode === "pro" ? x.choice.entry.over : 0) / (x.tile.games || 1), 0, x.choice.price];
  return out.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0]! - kb[0]! || ka[1]! - kb[1]! || ka[2]! - kb[2]! || ka[3]! - kb[3]!;
  });
}
