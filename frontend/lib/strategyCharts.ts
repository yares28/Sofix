import type { StrategyDecision, StrategyDecisionRow } from "./audit";

export const value = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
export const rarityName = (r: string) => ({ limited: "Limited", rare: "Rare", super_rare: "Super Rare", unique: "Unique", common: "Common" } as Record<string, string>)[r] ?? r;
export const criterion = (sort: string) => sort === "rewards" ? "reward frequency" : sort === "cash" ? "cash" : sort.startsWith("essence:") ? `${rarityName(sort.slice(8))} essence` : "points";
export const measure = (r: StrategyDecisionRow, d: StrategyDecision, sort: string): number | null => sort === "rewards" ? d.rewardCases ? r.rewardWins / d.rewardCases * 100 : null : sort === "cash" ? r.cashAverage : sort.startsWith("essence:") ? r.essence[sort.slice(8)]?.average ?? null : r.average;
export const rankedRows = (d: StrategyDecision, sort: string) => [...d.rows].sort((a, b) => (measure(b, d, sort) ?? -Infinity) - (measure(a, d, sort) ?? -Infinity));
export function rankingTiers(d: StrategyDecision, sort: string) {
  const tiers: { rank: number; value: number; rows: StrategyDecisionRow[] }[] = [];
  rankedRows(d, sort).forEach((row, index) => {
    const n = measure(row, d, sort);
    if (n == null) return;
    const previous = tiers.at(-1);
    if (previous?.value === n) previous.rows.push(row);
    else tiers.push({ rank: index + 1, value: n, rows: [row] });
  });
  return tiers.filter(tier => tier.rank <= 3);
}
export const rewardKinds = [
  { key: "card", label: "Card", colour: "#1c7651" }, { key: "cash", label: "Cash", colour: "#536ec2" },
  { key: "essence", label: "Essence", colour: "#b68127" }, { key: "xp", label: "XP only", colour: "#8a9099" },
  { key: "none", label: "Nothing", colour: "#747c87" },
] as const;

export type SourceAverage = { key: string; label: string; average: number | null; cases: number };
