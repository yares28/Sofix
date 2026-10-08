// The daily missions and who fits them (plans/xscore.md P9 "Daily missions", X7; roadmap 10.5c and 10.7). The extension reads the pickers from the Missions
// page of Sorare (read only) and the app keeps them per rarity (`read_models` key `missions`); this ranks the cards you have with a game that day.
import type { PlayingPlayer } from "./play";
import type { Sheet } from "./playerSheet";

export const MISSIONS_TAG = "missions";

/** One of your picks for a mission, as Sorare lists it: the player, his game, the card's rarity and Sorare's verdict (READY, SUCCESS, FAILURE). */
export type MissionPick = { player: string; game: string | null; rarity: string | null; status: string | null; card?: string; id?: string; locked?: boolean; score?: number; target?: number };

export type MissionRow = {
  id: string;
  title: string;
  description: string;
  mode: "DECISIVE" | "SCORE";
  picks: number;
  made: number;
  period: string | null;
  state: string | null;
  /** The stats the mission counts, when Sorare says (extension 0.3.6). */
  stats?: string[];
  /** Your picks with Sorare's verdict (extension 0.3.6). */
  appearances?: MissionPick[];
  startDate?: string;
  config?: string;
  thresholds?: { stat: string; min: number }[];
  overperform?: { by: number; averageType: string };
  ruleTypes?: string[];
  eligibleCards?: Record<string, string[]>;
  rewards?: { type: string; amount?: number; label: string }[];
};
export type MissionsModel = Partial<Record<string, { missions: MissionRow[]; seen_at: string; requested_at?: string; verified?: boolean }>>;

/**
 * Sorare's daily missions reset at 9:00 CET, which is 08:00 UTC all year. A mission day runs from one reset to the next and is named by the date it
 * starts on: at 07:00 UTC on 7 Oct it is still the day of 6 Oct. (Read as 9:00 Madrid time in summer, the reset would come an hour earlier; this way a
 * list is at worst thought stale for that hour and loaded once more, never kept a day too long.)
 */
const RESET_UTC_HOURS = 8;
export function missionDay(at: Date): string {
  return new Date(at.getTime() - RESET_UTC_HOURS * 3_600_000).toISOString().slice(0, 10);
}

/** Whether a list read at `seenAt` is today's missions, not a day before the last reset. */
export function isToday(seenAt: string | null | undefined, now: Date): boolean {
  if (!seenAt) return false;
  const seen = new Date(seenAt);
  return !Number.isNaN(seen.getTime()) && missionDay(seen) === missionDay(now);
}

export const RARITY_NAME: Record<string, string> = { limited: "Limited", rare: "Rare", super_rare: "Super Rare", unique: "Unique" };

/** What the Load button says once the extension answers (`null`: it did not, in time). */
export function missionsLoadNote(answer: { state: string; loaded: Record<string, number> | null } | null): string {
  if (!answer) return "The Sofix extension didn’t answer. Try again.";
  switch (answer.state) {
    case "ok": {
      const found = Object.entries(answer.loaded ?? {}).filter(([, n]) => n > 0);
      if (!found.length) return "Loaded: no missions on Sorare today.";
      return `Loaded: ${found.map(([rarity, n]) => `${n} ${RARITY_NAME[rarity] ?? rarity} mission${n === 1 ? "" : "s"}`).join(", ")}.`;
    }
    case "no-tab":
      return "No sorare.com tab is open. Open one in this browser, then press Load.";
    case "signed-out":
      return "Sign in on sorare.com, then press Load.";
    case "no-bridge":
      return "Reload your sorare.com tab, then press Load.";
    case "app-error":
      return "Sorare answered, but Sofix couldn't save the missions. Try again in a minute.";
    case "incomplete":
      return "Sorare's missions could not be verified. Your saved missions are kept. Reload the Sorare tab, then retry.";
    default:
      return "Sorare didn’t answer. Try again in a minute.";
  }
}

/** What a pick has to do for the mission to pay. `score` (beat his own average by some points) is not ranked yet. */
export type Rule =
  | { kind: "decisive"; label: string }
  | { kind: "interception"; atLeast: number; label: string }
  | { kind: "assist"; atLeast: number; label: string }
  | { kind: "goal"; atLeast: number; label: string }
  | { kind: "score"; label: string }
  | { kind: "unsupported"; label: string };

/** The rule in the mission's own words: "2+ interceptions", an assist, a goal, beating his average, or any positive decisive action. */
export function ruleOf(mission: Pick<MissionRow, "title" | "description"> & Partial<MissionRow>): Rule {
  if (mission.mode === "SCORE") return { kind: "score", label: mission.overperform ? `beat ${mission.overperform.averageType} by ${mission.overperform.by} points` : mission.thresholds?.length ? `score ${mission.thresholds[0]!.min}+` : mission.description || "Sorare score target" };
  if (mission.thresholds?.length) {
    if (mission.thresholds.length !== 1) return { kind: "unsupported", label: mission.description || "Combined stat target" };
    const target = mission.thresholds[0]!;
    const kind = ({ interception_won: "interception", goal_assist: "assist", goals: "goal" } as const)[target.stat as "goals"];
    if (kind) return { kind, atLeast: target.min, label: `${target.min}+ ${target.stat.replaceAll("_", " ")}` };
    return { kind: "unsupported", label: mission.description || `Target: ${target.stat}` };
  }
  const stats = mission.stats ?? [];
  if (stats.length) {
    const kind = stats.length === 1 ? ({ goals: "goal", goal_assist: "assist", interception_won: "interception" } as const)[stats[0] as "goals"] : undefined;
    if (kind) return { kind, atLeast: 1, label: `1+ ${stats[0]!.replaceAll("_", " ")}` };
    const standard = ["goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save"];
    if (!standard.every((s) => stats.includes(s)) || stats.some((s) => ![...standard, "clean_sheet_60"].includes(s))) return { kind: "unsupported", label: mission.description || "Custom decisive target" };
    return { kind: "decisive", label: "a decisive action" };
  }
  const text = `${mission.title} ${mission.description}`;
  const count = (word: RegExp) => Number(new RegExp(`(\\d+)\\s*\\+\\s*${word.source}`, "i").exec(text)?.[1] ?? 1);
  if (/interception/i.test(text)) {
    const atLeast = count(/interceptions?/);
    return { kind: "interception", atLeast, label: `${atLeast}+ interceptions` };
  }
  if (/assist/i.test(text)) {
    const atLeast = count(/assists?/);
    return { kind: "assist", atLeast, label: atLeast > 1 ? `${atLeast}+ assists` : "an assist" };
  }
  if (/\bgoals?\b/i.test(text)) {
    const atLeast = count(/goals?/);
    return { kind: "goal", atLeast, label: atLeast > 1 ? `${atLeast}+ goals` : "a goal" };
  }
  return /decisive/i.test(text) ? { kind: "decisive", label: "a decisive action" } : { kind: "unsupported", label: mission.description || "Target not rated" };
}

/** What the mission pays, in its own words ("200 XP", "50 All-Star Essence"), or null when the description names nothing. */
export function rewardOf(mission: Pick<MissionRow, "description"> & Partial<MissionRow>): string | null {
  if (mission.rewards?.length) return mission.rewards.map((r) => `${r.amount ?? ""} ${r.type === "CardShardRewardConfig" ? `${r.label || "Sorare"} Essence` : r.label || r.type.replace("RewardConfig", "")}`.trim()).join(" · ");
  const found = /(\d[\d,]*)\s*(XP|[A-Za-z-]+\s+Essence|Essence)/i.exec(mission.description);
  return found ? `${found[1]} ${found[2]}` : null;
}

/** The chance of at least `n` events when `rate` of them are expected (a Poisson count). */
export function atLeast(n: number, rate: number): number {
  if (n <= 0) return 1;
  const lambda = Math.max(0, rate);
  let term = Math.exp(-lambda);
  let below = term;
  for (let k = 1; k < n; k++) {
    term *= lambda / k;
    below += term;
  }
  return Math.min(1, Math.max(0, 1 - below));
}

export type Window = { l5: number; l8: number; season: number };
export type Suggestion = {
  slug: string;
  name: string;
  pos: PlayingPlayer["pos"];
  pic: string;
  club: string | null;
  opponent: string;
  venue: "H" | "A";
  kickoff: string;
  chance: number;
  /** What he does per start (a share of starts for a decisive action) over his last 5, last 8 and two seasons. */
  average: Window;
  cards: number;
  card?: string;
  game?: string;
  team?: string | null;
  competition?: string;
  pStart?: number;
  startSource?: string;
  samples?: { l5: number; l8: number; baseline: number };
  hits?: Window;
};
/** `all`: every card of yours with a game this mission day that Sofix can rate for it, likeliest first (also those it gave to another mission);
 * `unrated`: the others with a game, which no number fits (no stat sheet, or a mission that asks him to beat his own average). */
export type MissionPlan = { mission: MissionRow; rule: Rule; reward: string | null; open: number; picks: Suggestion[]; all: Suggestion[]; unrated: { slug: string; name: string }[] };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** The last `n` of his ten recorded starts, newest first as `last` is oldest first. */
const newest = (sheet: Sheet, n: number) => sheet.last.slice(-n);

/** His chance of the rule in his game that day, and what he did per start over 5, 8 and two seasons; null when nothing can be said (no number for him). */
export function fit(rule: Rule, player: PlayingPlayer, sheet: Sheet | null): { chance: number; average: Window } | null {
  if (rule.kind === "score" || rule.kind === "unsupported") return null;
  const play = Math.min(1, Math.max(0, player.pStart !== undefined && player.pOn !== undefined ? player.pStart + player.pOn : player.p));
  const count = (index: 4 | 5 | 6) => ({
    l5: mean(newest(sheet!, 5).map((r) => r[index])),
    l8: mean(newest(sheet!, 8).map((r) => r[index])),
  });
  if (rule.kind === "decisive") {
    const conditional = player.shape?.p ?? sheet?.decAll;
    const chance = conditional === undefined ? undefined : player.pStart !== undefined && player.pOn !== undefined && player.onShape
      ? player.pStart * conditional + player.pOn * player.onShape.p : play * conditional;
    if (typeof chance !== "number") return null;
    const l5 = sheet ? mean(newest(sheet, 5).map((r) => r[2])) : chance;
    const l8 = sheet ? mean(newest(sheet, 8).map((r) => r[2])) : chance;
    return { chance, average: { l5, l8, season: sheet ? sheet.decAll : chance } };
  }
  if (!sheet) return null;
  const key = rule.kind === "interception" ? "interception_won" : rule.kind === "assist" ? "goal_assist" : "goals";
  const index = rule.kind === "interception" ? 4 : rule.kind === "assist" ? 5 : 6;
  const season = sheet.season[key]?.[0] ?? 0;
  return { chance: play * atLeast(rule.atLeast, season), average: { ...count(index), season } };
}

/**
 * Your cards of one rarity with a game still to be played this mission day (`missionDay`: Sorare's day runs from one 9:00 CET reset to the next, so a game
 * at 21:00 belongs to the missions loaded that morning, not to the next day's): each player once, at his next game, whichever gameweek it belongs to (the
 * one being played now included). Missions are daily and the next ones are not known.
 */
export function playingToday(players: PlayingPlayer[], rarity: string, now: Date): { day: string; candidates: { p: PlayingPlayer; game: PlayingPlayer["games"][number] }[] } {
  const next = new Map<string, { p: PlayingPlayer; game: PlayingPlayer["games"][number] }>();
  for (const p of players) {
    if (!p.player || p.rarity !== rarity || (p as PlayingPlayer & { eligibility?: string }).eligibility) continue;
    const game = [...p.games].sort((a, b) => a.kickoff.localeCompare(b.kickoff)).find((g) => new Date(g.kickoff) > now);
    const id = (p as PlayingPlayer & { card?: string }).card ?? p.player;
    const held = next.get(id);
    if (game && (!held || game.kickoff < held.game.kickoff)) next.set(id, { p, game });
  }
  const day = missionDay(now);
  const candidates = [...next.values()].sort((a, b) => a.game.kickoff.localeCompare(b.game.kickoff)).filter((u) => missionDay(new Date(u.game.kickoff)) === day);
  return { day, candidates };
}

/**
 * The best cards for each mission: of your players with a game still to be played on the day, the ones likeliest to do what it asks, each in one mission only
 * (the likeliest pairs first), as many as it has picks left. The day is today in Madrid; a later day is never offered, because tomorrow's missions are not known. A mission for another rarity than a
 * player's card is not offered to him.
 */
export function plan(
  missions: MissionRow[],
  rarity: string,
  players: PlayingPlayer[],
  sheets: Record<string, Sheet | undefined>,
  now: Date,
): { day: string | null; plans: MissionPlan[] } {
  const { day, candidates } = playingToday(players, rarity, now);
  const plans: MissionPlan[] = missions.map((mission) => ({ mission, rule: ruleOf(mission), reward: rewardOf(mission), open: Math.max(0, mission.picks - mission.made), picks: [], all: [], unrated: [] }));
  const pairs: { plan: MissionPlan; pick: Suggestion }[] = [];
  for (const one of plans) {
    for (const { p, game } of candidates) {
      const card = (p as PlayingPlayer & { card?: string }).card;
      if (one.mission.eligibleCards && game.id && game.id in one.mission.eligibleCards && (!card || !one.mission.eligibleCards[game.id]?.includes(card))) continue;
      if (one.mission.eligibleCards && (!game.id || !(game.id in one.mission.eligibleCards))) { one.unrated.push({ slug: p.player!, name: `${p.name} (eligibility not checked)` }); continue; }
      if (one.mission.ruleTypes?.length && !one.mission.eligibleCards) {
        one.unrated.push({ slug: p.player!, name: `${p.name} (eligibility not checked)` });
        continue;
      }
      const found = fit(one.rule, { ...p, pStart: game.pStart ?? p.pStart, pOn: game.pOn ?? p.pOn }, sheets[p.player!] ?? null);
      if (!found) {
        one.unrated.push({ slug: p.player!, name: p.name });
        continue;
      }
      const sheet = sheets[p.player!];
      const index = one.rule.kind === "interception" ? 4 : one.rule.kind === "assist" ? 5 : one.rule.kind === "goal" ? 6 : 2;
      const threshold = "atLeast" in one.rule ? one.rule.atLeast : 1;
      const hits = (n: number) => sheet ? mean(newest(sheet, n).map((r) => Number(Number(r[index]) >= threshold))) : 0;
      const pick = { slug: p.player!, card: (p as PlayingPlayer & { card?: string }).card, game: game.id, team: game.team, competition: game.competition, pStart: game.pStart ?? p.pStart, startSource: game.startSource ?? p.startSource,
        name: p.name, pos: p.pos, pic: p.pic, club: p.club, opponent: game.opponent, venue: game.venue, kickoff: game.kickoff, chance: found.chance, average: found.average, cards: p.cards,
        samples: { l5: Math.min(5, sheet?.last.length ?? 0), l8: Math.min(8, sheet?.last.length ?? 0), baseline: sheet?.starts ?? 0 }, hits: { l5: hits(5), l8: hits(8), season: sheet?.decAll ?? 0 } };
      pairs.push({ plan: one, pick });
      one.all.push(pick);
    }
    one.all.sort((a, b) => b.chance - a.chance);
  }
  const priority = (p: MissionPlan) => /essence/i.test(p.reward ?? "") ? 0 : /clue/i.test(p.reward ?? "") ? 1 : /xp|experience/i.test(p.reward ?? "") ? 2 : 3;
  pairs.sort((a, b) => priority(a.plan) - priority(b.plan) || b.pick.chance - a.pick.chance);
  const used = new Set<string>(missions.flatMap((m) => (m.appearances ?? []).map((a) => a.card ?? a.player)));
  for (const { plan: one, pick } of pairs) {
    if (used.has(pick.card ?? pick.slug) || used.has(pick.slug) || one.picks.some((p) => p.slug === pick.slug) || one.mission.appearances?.some((p) => p.player === pick.slug) || one.picks.length >= one.open) continue;
    used.add(pick.card ?? pick.slug);
    one.picks.push(pick);
  }
  return { day, plans };
}
