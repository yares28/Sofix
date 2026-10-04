// The daily missions and who fits them (plans/xscore.md P9 "Daily missions", X7; roadmap 10.5c and 10.7). The extension reads the pickers from the Missions
// page of Sorare (read only) and the app keeps them per rarity (`read_models` key `missions`); this ranks the cards you have with a game that day.
import type { PlayingPlayer } from "./play";
import type { Sheet } from "./playerSheet";

export const MISSIONS_TAG = "missions";

export type MissionRow = {
  id: string;
  title: string;
  description: string;
  mode: "DECISIVE" | "SCORE";
  picks: number;
  made: number;
  period: string | null;
  state: string | null;
};
export type MissionsModel = Partial<Record<string, { missions: MissionRow[]; seen_at: string }>>;

/** What a pick has to do for the mission to pay. */
export type Rule =
  | { kind: "decisive"; label: string }
  | { kind: "interception"; atLeast: number; label: string }
  | { kind: "assist"; atLeast: number; label: string }
  | { kind: "goal"; atLeast: number; label: string };

/** The rule in the mission's own words: "2+ interceptions", an assist, a goal, or any positive decisive action. */
export function ruleOf(mission: Pick<MissionRow, "title" | "description">): Rule {
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
  return { kind: "decisive", label: "a decisive action" };
}

/** What the mission pays, in its own words ("200 XP", "50 All-Star Essence"), or null when the description names nothing. */
export function rewardOf(mission: Pick<MissionRow, "description">): string | null {
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
};
export type MissionPlan = { mission: MissionRow; rule: Rule; reward: string | null; open: number; picks: Suggestion[] };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** The last `n` of his ten recorded starts, newest first as `last` is oldest first. */
const newest = (sheet: Sheet, n: number) => sheet.last.slice(-n);

/** His chance of the rule in his game that day, and what he did per start over 5, 8 and two seasons; null when nothing can be said (no number for him). */
export function fit(rule: Rule, player: PlayingPlayer, sheet: Sheet | null): { chance: number; average: Window } | null {
  const count = (index: 4 | 5 | 6) => ({
    l5: mean(newest(sheet!, 5).map((r) => r[index])),
    l8: mean(newest(sheet!, 8).map((r) => r[index])),
  });
  if (rule.kind === "decisive") {
    const chance = player.shape?.p ?? sheet?.decAll;
    if (typeof chance !== "number") return null;
    const l5 = sheet ? mean(newest(sheet, 5).map((r) => r[2])) : chance;
    const l8 = sheet ? mean(newest(sheet, 8).map((r) => r[2])) : chance;
    return { chance, average: { l5, l8, season: sheet ? sheet.decAll : chance } };
  }
  if (!sheet) return null;
  const key = rule.kind === "interception" ? "interception_won" : rule.kind === "assist" ? "goal_assist" : "goals";
  const index = rule.kind === "interception" ? 4 : rule.kind === "assist" ? 5 : 6;
  const season = sheet.season[key]?.[0] ?? 0;
  return { chance: atLeast(rule.atLeast, season), average: { ...count(index), season } };
}

const madridDay = (iso: string): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * The best cards for each mission: of your players with a game still to be played on the day, the ones likeliest to do what it asks, each in one mission only
 * (the likeliest pairs first), as many as it has picks left. The day is the next one, in Madrid, on which any of them plays. A mission for another rarity than a
 * player's card is not offered to him.
 */
export function plan(
  missions: MissionRow[],
  rarity: string,
  players: PlayingPlayer[],
  sheets: Record<string, Sheet | undefined>,
  now: Date,
): { day: string | null; plans: MissionPlan[] } {
  const upcoming = players
    .filter((p) => p.player && p.rarity === rarity && p.games[0] && new Date(p.games[0].kickoff) > now)
    .sort((a, b) => a.games[0]!.kickoff.localeCompare(b.games[0]!.kickoff));
  const day = upcoming.length ? madridDay(upcoming[0]!.games[0]!.kickoff) : null;
  const candidates = upcoming.filter((p) => madridDay(p.games[0]!.kickoff) === day);
  const plans: MissionPlan[] = missions.map((mission) => ({ mission, rule: ruleOf(mission), reward: rewardOf(mission), open: Math.max(0, mission.picks - mission.made), picks: [] }));
  const pairs: { plan: MissionPlan; pick: Suggestion }[] = [];
  for (const one of plans) {
    for (const p of candidates) {
      const found = fit(one.rule, p, sheets[p.player!] ?? null);
      const game = p.games[0]!;
      if (!found) continue;
      pairs.push({
        plan: one,
        pick: { slug: p.player!, name: p.name, pos: p.pos, pic: p.pic, club: p.club, opponent: game.opponent, venue: game.venue, kickoff: game.kickoff, chance: found.chance, average: found.average, cards: p.cards },
      });
    }
  }
  pairs.sort((a, b) => b.pick.chance - a.pick.chance);
  const used = new Set<string>();
  for (const { plan: one, pick } of pairs) {
    if (used.has(pick.slug) || one.picks.length >= one.open) continue;
    used.add(pick.slug);
    one.picks.push(pick);
  }
  return { day, plans };
}
