import type { MonthLog } from "./missionLog";
import type { MissionPick } from "./missions";
export type MissionEdit = { picks: MissionPick[]; note: string; at: string; revision: number; restored?: boolean; sourcePicks?: MissionPick[] };
export type MissionEdits = { day: string; rarity: string; edits: Record<string, MissionEdit> };
export type EditRequest = { day: string; rarity: string; mission: string; revision: number; picks: MissionPick[]; note: string; restore: boolean; sourcePicks?: MissionPick[]; aliases?: string[] };
export function editMission(before: MissionEdits | null, input: EditRequest, at: string): MissionEdits {
  const old = [input.mission, ...(input.aliases ?? [])].map((key) => before?.edits[key]).find(Boolean);
  if ((old?.revision ?? 0) !== input.revision) throw new Error("Your picks changed in another session. Reload and retry.");
  return { day: input.day, rarity: input.rarity, edits: { ...before?.edits, [input.mission]: { picks: input.picks, note: input.note, at, revision: input.revision + 1, restored: input.restore, sourcePicks: input.sourcePicks } } };
}
export function applyMissionEdits(logs: MonthLog[], edits: MissionEdits[]): MonthLog[] {
  return logs.map((log) => ({ days: Object.fromEntries(Object.entries(log.days).map(([day, rarities]) => [day, Object.fromEntries(Object.entries(rarities).map(([rarity, entry]) => {
    const saved = edits.find((e) => e.day === day && e.rarity === rarity);
    return [rarity, { ...entry, missions: entry.missions.map((m) => {
      const override = [m.key, ...(m.aliases ?? [])].map((key) => saved?.edits[key]).find(Boolean);
      return { ...m, override: override && !override.restored ? override : undefined, editRevision: override?.revision ?? 0 };
    }) }];
  }))])) }));
}
