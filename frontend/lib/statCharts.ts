// The Stats page's four charts (owner's ask, 26 Oct 2026): pure helpers over the `stat_charts` read model (backend
// app/sorare/stat_charts.py), which the /api/stat-charts route hands out one window at a time. Ranking, look-alikes and club
// shares are computed here from the window the viewer picked; the backend owns who is in it and every number.
import { statLabel } from "./statLeaders";
import type { CollectionCard } from "./play";

export type Position = "GK" | "DEF" | "MID" | "FWD";
export const WINDOWS = [
  { key: "cur", label: "Season" },
  { key: "l5", label: "L5" },
  { key: "l10", label: "L10" },
  { key: "l40", label: "L40" },
] as const;
export type WindowKey = (typeof WINDOWS)[number]["key"];
export const LEAGUES = ["LaLiga", "Premier League", "Ligue 1", "Bundesliga", "Serie A"] as const;

/** The read model as the backend publishes it. */
export type ChartModel = {
  asOf: string;
  keys: string[];
  onSheet: Partial<Record<Position, string[]>>;
  players: {
    slug: string; name: string; pos: Position; league: string; club: string; crest: string | null; card: string | null;
    windows: Partial<Record<WindowKey, { starts: number; avg: number; values: (number | null)[] } | null>>;
  }[];
};

/** One player in one window, as the route hands him to the page: his card is yours when you own one. */
export type ChartPlayer = {
  slug: string; name: string; pos: Position; league: string; club: string; crest: string | null; card: string | null;
  mine: boolean; starts: number; avg: number; values: (number | null)[];
};
export type ChartWindow = { asOf: string; window: WindowKey; keys: string[]; players: ChartPlayer[] };

const RARITY = ["unique", "super_rare", "rare", "limited"];
const rank = (card: CollectionCard) => (RARITY.indexOf(card.rarity) + 1 || 9) * 2 + (card.inSeason ? 0 : 1);

/** The players with this window, each drawn as your own rarest card when you own one. */
export function chartWindow(model: ChartModel, window: WindowKey, collection: CollectionCard[] = []): ChartWindow {
  const yours = new Map<string, CollectionCard>();
  for (const card of collection) {
    const held = yours.get(card.player);
    if (!held || rank(card) < rank(held)) yours.set(card.player, card);
  }
  const players: ChartPlayer[] = [];
  for (const p of model.players) {
    const w = p.windows[window];
    if (!w) continue;
    const own = yours.get(p.slug);
    players.push({ slug: p.slug, name: p.name, pos: p.pos, league: p.league, club: p.club, crest: p.crest, card: own?.pic ?? p.card, mine: !!own, starts: w.starts, avg: w.avg, values: w.values });
  }
  return { asOf: model.asOf, window, keys: model.keys, players };
}

/** "avg" is the mean score per start; anything else an action of the stat sheet. */
export const AVG = "avg";
export const chartLabel = (key: string) => (key === AVG ? "Average score" : statLabel(key));
export const valueOf = (w: Pick<ChartWindow, "keys">, p: ChartPlayer, key: string): number | null => {
  if (key === AVG) return p.avg;
  const i = w.keys.indexOf(key);
  return i < 0 ? null : (p.values[i] ?? null);
};
export const chartValue = (key: string, v: number) => (key === AVG ? String(Math.round(v)) : v.toFixed(v >= 10 ? 1 : 2));

export type Filter = { league: string | "ALL"; pos: Position | "ALL" };
const inFilter = (p: ChartPlayer, f: Filter) => (f.league === "ALL" || p.league === f.league) && (f.pos === "ALL" || p.pos === f.pos);

/** The scatter's dots: players of the filter with both numbers; none, and the sentence that says why. */
export function scatterField(w: ChartWindow, f: Filter, x: string, y: string): { players: ChartPlayer[]; empty: string | null } {
  const here = w.players.filter((p) => inFilter(p, f));
  const players = here.filter((p) => valueOf(w, p, x) !== null && valueOf(w, p, y) !== null);
  if (players.length) return { players, empty: null };
  if (!here.length) return { players, empty: "Nobody with enough starts here yet" };
  const missing = here.some((p) => valueOf(w, p, x) !== null) ? y : x;
  return { players, empty: `${chartLabel(missing)} is not on a ${f.pos === "ALL" ? "player" : f.pos}'s stat sheet` };
}

/** His place among them, "3rd of 212". */
export function standing(values: number[], v: number): { rank: number; of: number } {
  return { rank: values.filter((other) => other > v).length + 1, of: values.length };
}
export const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"));

/** Twelve stats per position for the radar and the look-alikes; "goals conceded" counts for a keeper when it is low. */
export const AXES: Record<Position, string[]> = {
  GK: ["saves", "saved_ibox", "dive_save", "good_high_claim", "punches", "gk_smother", "accurate_keeper_sweeper", "accurate_pass", "accurate_long_balls", "successful_final_third_passes", "clean_sheet_60", "goals_conceded"],
  DEF: ["won_tackle", "interception_won", "effective_clearance", "outfielder_block", "blocked_cross", "poss_won", "duel_won", "accurate_pass", "accurate_long_balls", "successful_final_third_passes", "long_pass_own_to_opp_success", "adjusted_total_att_assist"],
  MID: ["accurate_pass", "successful_final_third_passes", "accurate_long_balls", "adjusted_total_att_assist", "big_chance_created", "won_contest", "pen_area_entries", "ontarget_scoring_att", "poss_won", "won_tackle", "interception_won", "duel_won"],
  FWD: ["goals", "ontarget_scoring_att", "big_chance_created", "adjusted_total_att_assist", "goal_assist", "won_contest", "pen_area_entries", "was_fouled", "successful_final_third_passes", "accurate_pass", "duel_won", "interception_won"],
};
export const LOW_IS_GOOD = new Set(["goals_conceded"]);

/**
 * Each player's share (0-1) of his position, every league together, on each of its twelve stats: the share he does more than,
 * ties counted half. A stat he has no number for counts as the bottom.
 */
export function profiles(w: ChartWindow, pos: Position): Map<string, number[]> {
  const pool = w.players.filter((p) => p.pos === pos);
  const axes = AXES[pos];
  const sorted = axes.map((k) => pool.map((p) => valueOf(w, p, k)).filter((v): v is number => v !== null).sort((a, b) => a - b));
  const out = new Map<string, number[]>();
  for (const p of pool) {
    out.set(p.slug, axes.map((k, j) => {
      const v = valueOf(w, p, k);
      const all = sorted[j]!;
      if (v === null || !all.length) return 0;
      let below = 0;
      let same = 0;
      for (const x of all) {
        if (x < v) below++;
        else if (x === v) same++;
      }
      const share = (below + same / 2) / all.length;
      return LOW_IS_GOOD.has(k) ? 1 - share : share;
    }));
  }
  return out;
}

/** His best stat as "Top 3%" and the stat. */
export function edge(profile: number[], pos: Position): { top: number; key: string } {
  let best = 0;
  profile.forEach((v, j) => { if (v > profile[best]!) best = j; });
  return { top: Math.max(1, Math.round((1 - (profile[best] ?? 0)) * 100)), key: AXES[pos][best]! };
}

export const likeness = (a: number[], b: number[]) => 1 - Math.sqrt(a.reduce((s, v, j) => s + (v - (b[j] ?? 0)) ** 2, 0) / Math.max(1, a.length));

export type LookAlike = { player: ChartPlayer; profile: number[]; like: number; same: string[]; apart: { key: string; more: boolean } };

/** The `count` players of his position who play most like him, from one league or all, closest first. */
export function lookAlikes(w: ChartWindow, hub: ChartPlayer, league: string | "ALL", count = 12): LookAlike[] {
  const prof = profiles(w, hub.pos);
  const mine = prof.get(hub.slug);
  if (!mine) return [];
  const axes = AXES[hub.pos];
  return w.players
    .filter((p) => p.pos === hub.pos && p.slug !== hub.slug && (league === "ALL" || p.league === league))
    .map((player) => {
      const profile = prof.get(player.slug)!;
      const gaps = axes.map((key, j) => ({ key, gap: Math.abs(profile[j]! - mine[j]!), more: profile[j]! > mine[j]! })).sort((a, b) => a.gap - b.gap);
      const far = gaps[gaps.length - 1]!;
      return { player, profile, like: likeness(profile, mine), same: gaps.slice(0, 3).map((g) => g.key), apart: { key: far.key, more: far.more } };
    })
    .sort((a, b) => b.like - a.like || a.player.name.localeCompare(b.player.name))
    .slice(0, count);
}

export type Club = { name: string; crest: string | null; total: number; players: { player: ChartPlayer; value: number; share: number }[] };
export const MIN_CLUB = 4; // fewer charted players and a club's "share" says more about who moved than who carries it

/** Each club of the league with MIN_CLUB players doing the stat: his share of what they do together per start, biggest first. */
export function clubShares(w: ChartWindow, league: string, key: string): Club[] {
  const byClub = new Map<string, ChartPlayer[]>();
  for (const p of w.players) {
    const v = valueOf(w, p, key);
    if (p.league !== league || !p.club || v === null || v <= 0) continue;
    byClub.set(p.club, [...(byClub.get(p.club) ?? []), p]);
  }
  return [...byClub.entries()]
    .filter(([, list]) => list.length >= MIN_CLUB)
    .map(([name, list]) => {
      const total = list.reduce((s, p) => s + valueOf(w, p, key)!, 0);
      const players = list.map((player) => ({ player, value: valueOf(w, player, key)!, share: valueOf(w, player, key)! / total }))
        .sort((a, b) => b.value - a.value);
      return { name, crest: players[0]!.player.crest, total, players };
    })
    .sort((a, b) => b.total - a.total);
}
