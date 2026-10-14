import { missionMetric, missionThreshold } from "./missionForm";
import type { Rule } from "./missions";
import type { MissionForm } from "./playerSheet";

/** One appearance of his, judged against the mission's target. */
export type Played = { date: string; started: boolean | null; hit: boolean };

/** His last `n` dated appearances with a number for the mission's stat, oldest first, each one a hit or not. Empty when the mission has no target to judge by. */
export function lastGames(form: MissionForm | undefined, rule: Rule, target?: number, n = 10): Played[] {
  const metric = missionMetric(rule), threshold = missionThreshold(rule, target);
  if (!form || !metric || threshold === undefined) return [];
  return form.recent.slice(0, n).filter((g) => typeof g.values[metric] === "number").map((g) => ({ date: g.date, started: g.started, hit: g.values[metric]! >= threshold })).reverse();
}

/** "2/5" of the games where he started (or came on), "–" when there were none. */
export function roleHits(games: Played[], started: boolean): string {
  const of = games.filter((g) => g.started === started);
  return of.length ? `${of.filter((g) => g.hit).length}/${of.length}` : "–";
}

/** The three stats, per game, that sit beside the one the mission counts (stat key, column title, shown as a share of games). */
export type Related = readonly [key: string, label: string, share?: true];
const GOALS: Related = ["goals", "Goals"], ASSISTS: Related = ["goal_assist", "Assists"], SHOTS: Related = ["ontarget_scoring_att", "On target"], BOX: Related = ["pen_area_entries", "Box entries"];
const WINS: Related = ["duel_won", "Duels won"], BALL: Related = ["poss_won", "Ball wins"], MINUTES: Related = ["mins_played", "Minutes"];
const RELATED: Record<Rule["kind"], readonly [Related, Related, Related]> = {
  decisive: [GOALS, ASSISTS, ["clean_sheet_60", "Clean sheet", true]],
  interception: [["won_tackle", "Tackles won"], BALL, WINS],
  tackle: [["interception_won", "Interceptions"], BALL, WINS],
  assist: [["big_chance_created", "Chances made"], BOX, GOALS],
  goal: [SHOTS, BOX, ASSISTS],
  shot: [GOALS, BOX, ["big_chance_missed", "Chances missed"]],
  miss: [SHOTS, BOX, GOALS],
  booked: [["fouls", "Fouls"], WINS, MINUTES],
  pass: [MINUTES, ["missed_pass", "Passes missed"], ASSISTS],
  score: [MINUTES, ["decisive", "Decisive", true], GOALS],
  unsupported: [GOALS, ASSISTS, MINUTES],
};
export const relatedStats = (rule: Rule) => RELATED[rule.kind];

/** His average per game over his last ten appearances, ready to print; a dash when the stat was not recorded. */
export function perGame(form: MissionForm | undefined, [key, , share]: Related): string {
  const mean = form?.windows.l10.means[key];
  return mean === undefined ? "–" : share ? `${Math.round(100 * mean)}%` : key === "mins_played" ? String(Math.round(mean)) : mean === 0 ? "0" : mean.toFixed(1);
}

/** The counted stat's average per game over his last ten, the tie-break when two cards hit equally often. */
export function recentMean(form: MissionForm | undefined, rule: Rule): number {
  const metric = missionMetric(rule);
  return (metric && form?.windows.l10.means[metric]) || 0;
}
