import { actualRewards, rewardKeys, rewardSignature, type PlayRewardBlock, type RewardValues } from "./playRewards";
import type { Plan } from "./play";

type RewardRow = { expected?: RewardValues | null; actual?: RewardValues | null; chance?: number };
export function weekRewards(rows: RewardRow[]) {
  const forecasts = rows.map(row => row.expected), projected = actualRewards(forecasts);
  const chances = rows.map(row => row.chance).filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1);
  return { total: rows.length, chance: chances.length ? chances.reduce((sum, p) => sum + p, 0) / chances.length : null, chanceRated: chances.length, expected: projected.values, forecastChecked: projected.checked, coverage: Object.fromEntries(rewardKeys(forecasts).map(key => [key, projected.checked])), actual: actualRewards(rows.map(row => row.actual)) };
}
export type WeekRewards = ReturnType<typeof weekRewards>;

/**
 * Which side did better on one reward: 0 you, 1 the Sofix plan, -1 neither. Sorare adds your collection bonus to the essence
 * you are paid, and the plan's numbers have none, so an essence gap of up to 10 per paid reward is that bonus, not a better
 * lineup (owner, 12 Nov 2026; cheaper than reading each card's bonus).
 */
export function betterSide(key: string, you: number | null, sofix: number | null, rewards = 1): -1 | 0 | 1 {
  if (you === null || sofix === null) return -1;
  const slack = key.startsWith("essence") ? 10 * rewards : 0;
  return you - sofix > slack ? 0 : sofix - you > slack ? 1 : -1;
}

/** Checked results remain evidence even if a later private snapshot contains fewer entries. */
export function checkedWeekRewards(rows: (RewardRow & { id: string })[], checks: PlayRewardBlock["you"] = []) {
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
