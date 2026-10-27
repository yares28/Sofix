import { actualRewards, rewardCoverage, rewardForecast, rewardSignature, type PlayRewardBlock, type RewardValues } from "./playRewards";
import type { Plan } from "./play";

export function weekRewards(rows: { expected?: RewardValues | null; actual?: RewardValues | null }[]) {
  const forecasts = rows.map(row => row.expected);
  return { total: rows.length, expected: rewardForecast(forecasts), coverage: rewardCoverage(forecasts), actual: actualRewards(rows.map(row => row.actual)) };
}
export type WeekRewards = ReturnType<typeof weekRewards>;

/** Checked results remain evidence even if a later private snapshot contains fewer entries. */
export function checkedWeekRewards(rows: { id: string; expected?: RewardValues | null; actual?: RewardValues | null }[], checks: PlayRewardBlock["you"] = []) {
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const check of checks) {
    const previous = byId.get(check.id);
    byId.set(check.id, { ...previous, id: check.id, actual: check.rewards ?? previous?.actual });
  }
  return weekRewards([...byId.values()]);
}

/** A replay may differ from the recommendation whose exact lineups were checked. */
export function planForRewards(current: Plan | null | undefined, retained: Plan[], checks: PlayRewardBlock | null): Plan | null {
  const signatures = new Set(checks?.sofix?.map(row => row.signature));
  const matches = (plan: Plan | null) => plan?.lineups.filter(line => signatures.has(rewardSignature(line))).length ?? 0;
  return retained.reduce<Plan | null>((best, candidate) => matches(candidate) > matches(best) ? candidate : best, current ?? null);
}
