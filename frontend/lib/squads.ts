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
const club = z.object({
  club: z.string(), crest: z.string().nullable(), games: z.array(game), players: z.record(z.string(), player),
  teams: z.array(team), pro: z.record(z.string(), lanes), sevens: z.array(seven), arena: z.object({ full: z.array(entry), owned: z.array(entry) }).partial(),
  // start of season: players with no game in the league last season (listed, never guessed); a club new to the league
  rounds: z.array(z.number().int()).optional(), // two clubs: each game's round
  clubs: z.array(z.object({ club: z.string(), crest: z.string().nullable() })).optional(),
  newcomers: z.array(z.object({ slug: z.string(), name: z.string(), pos: z.string(), art: z.string().nullable() })).default([]),
  promoted: z.boolean().default(false),
});
const block = z.object({
  version: z.union([z.literal(1), z.literal(2)]), generatedAt: z.string(), league: z.string(), code: z.string(), name: z.string(), season: z.number().int(),
  targets: z.array(z.number()), captain: z.number(),
  record: z.string().nullable().default(null), rounds: z.number().int().nullable().default(null), cardsOut: z.boolean().default(true),
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

/** One try a game (or several, in kickoff order, within a round): a clear climbs, a miss with no clear after it in the round
 * sends the board back to its first step. Same rule as squads.ladder in the backend. */
export function ladder(rounds: (number | null)[][], board: Step[]): { rungs: Rung[][]; clears: number; cash: number; essence: number; top: number } {
  let level = 0, clears = 0, cash = 0, essence = 0, top = 0;
  const rungs = rounds.map((tries) => {
    let missed = false;
    const out: Rung[] = tries.map((v) => {
      const step = board[level]!;
      if (v === null) return { target: step.target, res: "skip", back: false, prize: null };
      if (v >= step.target) {
        clears += 1; cash += step.cash; essence += step.essence; top = Math.max(top, step.target);
        level = (level + 1) % board.length;
        missed = false;
        return { target: step.target, res: "clear", back: false, prize: step };
      }
      missed = true;
      return { target: step.target, res: "miss", back: false, prize: null };
    });
    if (missed) {
      const last = out[out.length - 1]!;
      last.back = level > 0;
      level = 0;
    }
    return out;
  });
  return { rungs, clears, cash, essence, top };
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
