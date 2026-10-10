import type { MissionForm } from "./playerSheet";
import type { Rule } from "./missions";

export const missionMetric = (rule: Rule): string | null => ({ decisive: "decisive", score: "score", interception: "interception_won", assist: "goal_assist", goal: "goals", shot: "ontarget_scoring_att", tackle: "won_tackle", pass: "accurate_pass", unsupported: null })[rule.kind];
export const missionThreshold = (rule: Rule, target?: number) => rule.kind === "score" ? target : rule.kind === "unsupported" ? undefined : "atLeast" in rule ? rule.atLeast : 1;
export function formValues(form: MissionForm, key: string, n = 10, started?: boolean): number[] {
  return form.recent.slice(0, n).filter((g) => started === undefined || g.started === started).map((g) => g.values[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}
export function formRate(form: MissionForm, key: string, started: boolean): number | undefined {
  const values = formValues(form, key, 10, started);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : form.windows[started ? "starts" : "subs"].means[key];
}
