// The Players page's numbers (plans/xscore.md P9 X5b; roadmap 10.5): a player's stat sheet, how he compares with the others in his position, his last
// ten starts and the bars of his game. Pure: the page reads the daily player_sheets model, built from saved games, and calls these.

export type Position = "GK" | "DEF" | "MID" | "FWD";
/** What one action is worth in a start: its mean count and the mean points Sorare gave for it. */
export type Mean = [count: number, points: number];

export type Sheet = {
  pos: Position;
  team: string;
  starts: number;
  season: Record<string, Mean>;
  seasonStarts: number;
  l10: Record<string, Mean>;
  /** His last ten starts, oldest first: score, opponent, decisive (1), H/A, interceptions, assists, goals, then optional mission shot/tackle counts. */
  last: [score: number, opponent: string, decisive: 0 | 1, venue: "H" | "A", interceptions: number, assists: number, goals: number, shotsOnTarget?: number, tacklesWon?: number][];
  /** How often a saved start with complete stats was decisive. */
  decAll: number;
  cs: number;
  pens: number;
};

export type Sheets = { asOf: string; players: Record<string, Sheet> };

export type Window = "next" | "l10" | "all";

const GROUPS: { name: string; keys: [string, string][] }[] = [
  { name: "Goalkeeping", keys: [["saves", "Saves"], ["saved_ibox", "Saves inside the box"], ["dive_save", "Dive saves"], ["penalty_save", "Penalties saved"], ["goals_conceded", "Goals conceded"], ["good_high_claim", "High claims"], ["punches", "Punches"], ["gk_smother", "Smothers"], ["accurate_keeper_sweeper", "Sweeper actions"]] },
  { name: "Attacking", keys: [["goals", "Goals"], ["goal_assist", "Assists"], ["ontarget_scoring_att", "Shots on target"], ["big_chance_created", "Big chances created"], ["big_chance_missed", "Big chances missed"], ["adjusted_total_att_assist", "Shot assists"], ["won_contest", "Dribbles won"], ["pen_area_entries", "Penalty-area entries"], ["was_fouled", "Fouls won"]] },
  { name: "Passing", keys: [["accurate_pass", "Accurate passes"], ["accurate_long_balls", "Accurate long balls"], ["successful_final_third_passes", "Final-third passes"], ["long_pass_own_to_opp_success", "Long passes into their half"], ["missed_pass", "Missed passes"], ["poss_lost_ctrl", "Possession lost"]] },
  { name: "Defending", keys: [["won_tackle", "Tackles won"], ["interception_won", "Interceptions"], ["effective_clearance", "Clearances"], ["outfielder_block", "Blocks"], ["blocked_cross", "Blocked crosses"], ["poss_won", "Possession won"], ["duel_won", "Duels won"], ["duel_lost", "Duels lost"], ["fouls", "Fouls"], ["last_man_tackle", "Last-man tackles"]] },
  { name: "Mistakes and cards", keys: [["error_lead_to_shot", "Errors leading to a shot"], ["error_lead_to_goal", "Errors leading to a goal"], ["yellow_card", "Yellow cards"], ["red_card", "Red cards"]] },
];

/** The actions his game puts more or less of with the goals his side is expected to concede, and with the goals it is expected to score. */
const WITH_AGAINST = new Set(["goals_conceded", "saves", "saved_ibox", "dive_save", "good_high_claim", "punches", "effective_clearance", "outfielder_block", "blocked_cross", "duel_won", "duel_lost", "gk_smother"]);
const WITH_FOR = new Set(["goals", "goal_assist", "ontarget_scoring_att", "big_chance_created", "big_chance_missed", "adjusted_total_att_assist", "pen_area_entries", "won_contest"]);
const MIN_POINTS = 0.7; // an action worth less than this per start, either way, is not worth a line on the sheet
const MAX_ROWS = 5; // the most lines one group shows: the ones that move the score most
const LEAGUE_GOALS = 1.3; // goals a side scores in a LaLiga game
const CLAMP: [number, number] = [0.6, 1.6];

export type SheetRow = { name: string; count: string; points: number | null };
export type SheetGroup = { name: string; rows: SheetRow[] };

/** How much more or less of his actions a game holds than an average one: from the goals his side is expected to concede and to score (null for a game with no price). */
export function gameFactors(odds: { goalsFor?: number | null; goalsAgainst?: number | null } | null | undefined): { against: number; attack: number } | null {
  if (!odds || typeof odds.goalsFor !== "number" || typeof odds.goalsAgainst !== "number") return null;
  const clamp = (v: number) => Math.min(CLAMP[1], Math.max(CLAMP[0], v));
  return { against: clamp(odds.goalsAgainst / LEAGUE_GOALS), attack: clamp(odds.goalsFor / LEAGUE_GOALS) };
}

const one = (n: number) => n.toFixed(1);

/**
 * The sheet of one window: each action's mean count and points per start, in Sorare's groups, an action he does too seldom left out. "next" is his season's
 * mean moved by the game (`gameFactors`): more shots to save against a stronger attack, more chances created against a weaker defence. The points move with the count.
 */
export function sheetGroups(sheet: Sheet, window: Window, factors: { against: number; attack: number } | null): SheetGroup[] {
  const source = window === "l10" ? sheet.l10 : sheet.season;
  const out: SheetGroup[] = [];
  for (const group of GROUPS) {
    const rows: SheetRow[] = [];
    for (const [key, name] of group.keys) {
      const mean = source[key];
      if (!mean) continue;
      const k = window === "next" && factors ? (WITH_AGAINST.has(key) ? factors.against : WITH_FOR.has(key) ? factors.attack : 1) : 1;
      rows.push({ name, count: one(mean[0] * k), points: mean[1] * k });
    }
    const kept = rows.filter((r) => Math.abs(r.points ?? 0) >= MIN_POINTS).sort((a, b) => Math.abs(b.points ?? 0) - Math.abs(a.points ?? 0)).slice(0, MAX_ROWS);
    if (kept.length) out.push({ name: group.name, rows: kept });
  }
  return out;
}

/** What a start's all-around points add up to: every action of the sheet, the ones a line is not drawn for included. */
export function sheetTotal(sheet: Sheet, window: Window, factors: { against: number; attack: number } | null): number {
  const source = window === "l10" ? sheet.l10 : sheet.season;
  const known = new Set(GROUPS.flatMap((g) => g.keys.map(([key]) => key)));
  return Object.entries(source).reduce((sum, [key, mean]) => {
    const k = window === "next" && factors ? (WITH_AGAINST.has(key) ? factors.against : WITH_FOR.has(key) ? factors.attack : 1) : 1;
    return known.has(key) ? sum + mean[1] * k : sum;
  }, 0);
}

export type Strip = { name: string; values: number[]; me: number; median: number; lo: number; hi: number; rank: string };

const count = (m: Record<string, Mean>, ...keys: string[]) => keys.reduce((sum, k) => sum + (m[k]?.[0] ?? 0), 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

type Metric = { name: string; of: (s: Sheet) => number; lowIsGood?: boolean; digits: number };
const L10 = (s: Sheet) => mean(s.last.map((row) => row[0]));
const METRICS: Record<Position, Metric[]> = {
  GK: [
    { name: "Average, last 10 starts", of: L10, digits: 1 },
    { name: "Saves per start", of: (s) => count(s.season, "saves"), digits: 1 },
    { name: "Clean sheets", of: (s) => s.cs / Math.max(1, s.seasonStarts), digits: 2 },
    { name: "Goals conceded per start", of: (s) => count(s.season, "goals_conceded"), lowIsGood: true, digits: 1 },
  ],
  DEF: [
    { name: "Average, last 10 starts", of: L10, digits: 1 },
    { name: "Tackles and interceptions", of: (s) => count(s.season, "won_tackle", "interception_won"), digits: 1 },
    { name: "Clearances and blocks", of: (s) => count(s.season, "effective_clearance", "outfielder_block"), digits: 1 },
    { name: "Clean sheets", of: (s) => s.cs / Math.max(1, s.seasonStarts), digits: 2 },
  ],
  MID: [
    { name: "Average, last 10 starts", of: L10, digits: 1 },
    { name: "Goals and assists", of: (s) => count(s.season, "goals", "goal_assist"), digits: 2 },
    { name: "Chances created", of: (s) => count(s.season, "big_chance_created", "adjusted_total_att_assist"), digits: 1 },
    { name: "Possession won", of: (s) => count(s.season, "poss_won"), digits: 1 },
  ],
  FWD: [
    { name: "Average, last 10 starts", of: L10, digits: 1 },
    { name: "Goals", of: (s) => count(s.season, "goals"), digits: 2 },
    { name: "Shots on target", of: (s) => count(s.season, "ontarget_scoring_att"), digits: 1 },
    { name: "Chances created", of: (s) => count(s.season, "big_chance_created", "adjusted_total_att_assist"), digits: 1 },
  ],
};

/** How he compares with the others of his position with at least eight starts: one dot each, where he and the middle one are, and the share he beats. */
export function strips(sheets: Sheets, slug: string): Strip[] {
  const mine = sheets.players[slug];
  if (!mine) return [];
  const others = Object.entries(sheets.players).filter(([key, s]) => s.pos === mine.pos && (key === slug || s.starts >= 8));
  return METRICS[mine.pos].map((metric) => {
    const values = others.map(([, s]) => metric.of(s)).sort((a, b) => a - b);
    const me = metric.of(mine);
    const worse = values.filter((v) => (metric.lowIsGood ? v > me : v < me)).length;
    const share = Math.round((worse / Math.max(1, values.length - 1)) * 100);
    const middle = values.length ? values[Math.floor(values.length / 2)]! : me;
    const f = (v: number) => Number(v.toFixed(metric.digits));
    return {
      name: metric.name,
      values: values.map(f),
      me: f(me),
      median: f(middle),
      lo: f(values[0] ?? me),
      hi: f(values[values.length - 1] ?? me),
      rank: `${metric.lowIsGood ? "fewer than" : "higher than"} ${share}%`,
    };
  });
}

/** A start's bars as the panel draws them (the same arithmetic as `shapeBars` in extension/core.js, held together by a test). */
export type Shape = { p: number; dec: number; plain: number; sdDec: number; sdPlain: number; low: number; high: number; why?: [string, number][] };

export function shapeBars(shape: Shape, score: number, count = 40): { h: number; kind: "me" | "dec" | "run" | "out" }[] {
  const bell = (x: number, m: number, sd: number) => Math.exp(-0.5 * ((x - m) / sd) ** 2) / sd;
  const spreadDec = Math.max(shape.sdDec, 1);
  const spreadPlain = Math.max(shape.sdPlain, 1);
  const nearest = Math.min(count - 1, Math.max(0, Math.floor((score / 100) * count)));
  const xs = Array.from({ length: count }, (_, i) => (i + 0.5) * (100 / count));
  const dec = xs.map((x) => shape.p * bell(x, shape.dec, spreadDec));
  const plain = xs.map((x) => (1 - shape.p) * bell(x, shape.plain, spreadPlain));
  const top = Math.max(...dec.map((d, i) => d + plain[i]!));
  return xs.map((x, i) => ({
    h: Math.max(4, Math.round(((dec[i]! + plain[i]!) / top) * 100)),
    kind: i === nearest ? "me" : dec[i]! > plain[i]! ? "dec" : x >= shape.low && x <= shape.high ? "run" : "out",
  }));
}
