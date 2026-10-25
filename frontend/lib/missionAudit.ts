import type { Missions } from "./audit";

export type MissionAuditRow = {
  id: string; day: string; rarity: string; mission: string;
  state: "checked" | "pending" | "incomplete" | "unrecorded" | "unsupported" | "reconstructed";
  slots: number; sofix: number | null; yours: number | null; best: number | null;
  replay: boolean; corrected: boolean;
  reward: { unit: string; each: number; full: number } | null;
};
export type MissionOverview = { rows: MissionAuditRow[]; emptyDays: number };
export type MissionReward = { unit: string; rarity: string; cases: number; yours: number | null; sofix: number; best: number };
export const MISSION_STATE: Record<MissionAuditRow["state"], string> = { checked: "Checked", pending: "Results pending", incomplete: "Eligibility incomplete", unrecorded: "Forecast not captured", unsupported: "Target not rated", reconstructed: "Reconstructed" };

/** Older published payloads stay readable until the automatic refresh publishes the overview. */
export function auditMissionRows(missions: Missions): MissionAuditRow[] {
  return missions.overview?.rows ?? missions.days.map((d, i) => ({ id: `${d.day}:${d.rarity}:${i}`, day: d.day, rarity: d.rarity, mission: d.mission, state: "checked", slots: Math.max(d.best, d.picks.length), sofix: d.got, yours: d.yours ?? null, best: d.best, replay: false, corrected: false, reward: null }));
}

export function missionSummary(rows: MissionAuditRow[], mode: "paired" | "sofix") {
  const compared = rows.filter(r => r.state === "checked" && r.best != null && r.sofix != null && (mode !== "paired" || r.yours != null));
  const own = rows.filter(r => r.yours != null);
  const reward = (r: MissionAuditRow, hits: number) => hits >= r.slots ? r.reward!.full : hits * r.reward!.each;
  const groups = new Map<string, MissionReward>();
  for (const r of compared) {
    if (!r.reward) continue;
    const key = `${r.rarity}:${r.reward.unit}`;
    const group = groups.get(key) ?? { rarity: r.rarity, unit: r.reward.unit, cases: 0, yours: mode === "paired" ? 0 : null, sofix: 0, best: 0 };
    group.cases++;
    group.sofix += reward(r, r.sofix!);
    group.best += reward(r, r.best!);
    if (group.yours != null) group.yours += reward(r, r.yours!);
    groups.set(key, group);
  }
  return {
    cases: compared.length, opportunities: compared.filter(r => r.best! > 0).length,
    best: compared.reduce((n, r) => n + r.best!, 0), sofix: compared.reduce((n, r) => n + r.sofix!, 0),
    yours: mode === "paired" ? compared.reduce((n, r) => n + r.yours!, 0) : null,
    perfect: { yours: compared.filter(r => r.best! > 0 && r.yours != null && r.yours >= r.best!).length, sofix: compared.filter(r => r.best! > 0 && r.sofix! >= r.best!).length },
    own: { cases: own.length, hits: own.reduce((n, r) => n + r.yours!, 0) },
    rewards: [...groups.values()], rewardUnknown: compared.filter(r => !r.reward).length,
  };
}
