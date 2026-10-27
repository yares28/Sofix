import { actualRewards, rewardCoverage, rewardForecast, type RewardValues } from "./playRewards";

export function weekRewards(rows: { expected?: RewardValues | null; actual?: RewardValues | null }[]) {
  const forecasts = rows.map(row => row.expected);
  return { total: rows.length, expected: rewardForecast(forecasts), coverage: rewardCoverage(forecasts), actual: actualRewards(rows.map(row => row.actual)) };
}
export type WeekRewards = ReturnType<typeof weekRewards>;
