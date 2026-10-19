// The Gallery's Stats view: who does the most of one action per start. Pure: the page reads the daily player_sheets model
// (lib/playerSheet.ts) and the Sorare market (each player's card and crest), and the view ranks what these give it.
import { ACTION_LABELS, type Position, type Sheets } from "./playerSheet";
import type { CollectionCard, MarketPlayer } from "./play";

/** Sorare's actions, grouped as the selector shows them. Labels the stat sheet already has are reused. */
const GROUPS: { name: string; keys: string[] }[] = [
  { name: "Attacking", keys: ["goals", "goal_assist", "ontarget_scoring_att", "big_chance_created", "big_chance_missed", "adjusted_total_att_assist", "won_contest", "pen_area_entries", "was_fouled", "penalty_won", "assist_penalty_won"] },
  { name: "Passing", keys: ["accurate_pass", "accurate_long_balls", "successful_final_third_passes", "long_pass_own_to_opp_success", "missed_pass", "poss_lost_ctrl"] },
  { name: "Defending", keys: ["won_tackle", "interception_won", "effective_clearance", "outfielder_block", "blocked_cross", "poss_won", "duel_won", "duel_lost", "last_man_tackle", "clearance_off_line", "clean_sheet_60"] },
  { name: "Goalkeeping", keys: ["saves", "saved_ibox", "dive_save", "dive_catch", "penalty_save", "goals_conceded", "good_high_claim", "punches", "gk_smother", "accurate_keeper_sweeper", "cross_not_claimed"] },
  { name: "Bonuses", keys: ["double_double", "triple_double", "triple_triple"] },
  { name: "Mistakes and cards", keys: ["fouls", "error_lead_to_shot", "error_lead_to_goal", "penalty_conceded", "penalty_kick_missed", "own_goals", "yellow_card", "red_card"] },
];

const MORE_LABELS: Record<string, string> = {
  penalty_won: "Penalties won", assist_penalty_won: "Penalties won for a goal", clearance_off_line: "Clearances off the line",
  clean_sheet_60: "Clean sheets (60 min)", dive_catch: "Dive catches", cross_not_claimed: "Crosses not claimed",
  double_double: "Double-doubles", triple_double: "Triple-doubles", triple_triple: "Triple-triples",
  penalty_conceded: "Penalties conceded", penalty_kick_missed: "Penalties missed", own_goals: "Own goals",
};

/** A key with no label of its own still shows, by its words ("big_chance_lost" → "Big chance lost"). */
export const statLabel = (key: string): string => ACTION_LABELS[key] ?? MORE_LABELS[key] ?? (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, " ");

/** One ranked player: his card (yours when you own one), crest and starts, and his mean count per start of every action he does. */
export type StatPlayer = { slug: string; name: string; club: string | null; crest: string | null; pic: string; mine: boolean; pos: Position; starts: number; stats: Record<string, number> };
export type StatGroup = { name: string; stats: { key: string; label: string }[] };

const RARITY = ["unique", "super_rare", "rare", "limited"];
const rank = (card: CollectionCard) => (RARITY.indexOf(card.rarity) + 1 || 9) * 2 + (card.inSeason ? 0 : 1);

/**
 * Every current LaLiga player (the market) that has a stat sheet; a sheet of a player who left the league is left out. A player
 * you own is drawn as your own card, the rarest (in-season first).
 */
export function statPlayers(sheets: Sheets, market: MarketPlayer[], collection: CollectionCard[] = []): StatPlayer[] {
  const yours = new Map<string, CollectionCard>();
  for (const card of collection) {
    const held = yours.get(card.player);
    if (!held || rank(card) < rank(held)) yours.set(card.player, card);
  }
  const out: StatPlayer[] = [];
  for (const player of market) {
    const sheet = sheets.players[player.slug];
    if (!sheet) continue;
    const stats = Object.fromEntries(Object.entries(sheet.season).map(([key, [count]]) => [key, count]));
    const card = yours.get(player.slug);
    out.push({ slug: player.slug, name: player.name, club: player.club, crest: player.crest, pic: card?.pic ?? player.pic, mine: !!card, pos: sheet.pos, starts: sheet.seasonStarts, stats });
  }
  return out;
}

/** The selector's groups: only the actions some player has a number for, unknown ones in "Other". */
export function statGroups(players: StatPlayer[]): StatGroup[] {
  const seen = new Set(players.flatMap((player) => Object.keys(player.stats)));
  const known = new Set(GROUPS.flatMap((group) => group.keys));
  const other = [...seen].filter((key) => !known.has(key)).sort();
  return [...GROUPS, { name: "Other", keys: other }]
    .map((group) => ({ name: group.name, stats: group.keys.filter((key) => seen.has(key)).map((key) => ({ key, label: statLabel(key) })) }))
    .filter((group) => group.stats.length > 0);
}

/** Who is ranked: players with at least `minStarts` starts, of one position or all. */
const field = (players: StatPlayer[], minStarts: number, pos?: Position) => players.filter((player) => player.starts >= minStarts && (!pos || player.pos === pos));

/** The players with at least `minStarts` starts and a number for the action, highest mean first (more starts first on a tie). */
export function leaders(players: StatPlayer[], key: string, minStarts: number, pos?: Position, limit = 50): (StatPlayer & { value: number })[] {
  return field(players, minStarts, pos)
    .filter((player) => player.stats[key] !== undefined)
    .map((player) => ({ ...player, value: player.stats[key]! }))
    .sort((a, b) => b.value - a.value || b.starts - a.starts || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** How many players are ranked and their average per start; a player with no number for the action did it (next to) never, so counts as none. */
export function fieldAverage(players: StatPlayer[], key: string, minStarts: number, pos?: Position): { players: number; mean: number } {
  const ranked = field(players, minStarts, pos);
  return { players: ranked.length, mean: ranked.reduce((sum, player) => sum + (player.stats[key] ?? 0), 0) / (ranked.length || 1) };
}

/** A mean as the page prints it: two decimals under ten (0.92 goals), one above (84.5 passes). */
export const statValue = (value: number): string => value.toFixed(value >= 10 ? 1 : 2);
