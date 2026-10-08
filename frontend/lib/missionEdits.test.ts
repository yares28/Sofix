import { expect, it } from "vitest";
import { applyMissionEdits, editMission } from "./missionEdits";
import { DAILY_PICKER, missionHistory, nextDay } from "./missionLog";
it("keeps an explicit no-picks correction across source imports and can restore the source", () => {
  const day = "2026-10-06", rarity = "limited";
  const source = nextDay(undefined, [{ ...DAILY_PICKER, appearances: [{ player: "a", game: "g", rarity, status: "SUCCESS" }] }], [], {}, rarity, new Date(`${day}T12:00:00Z`));
  const logs = [{ days: { [day]: { [rarity]: source } } }];
  const data = editMission(null, { day, rarity, mission: DAILY_PICKER.id, revision: 0, picks: [], note: "I made no picks", restore: false }, "now");
  expect(applyMissionEdits(logs, [data])[0]!.days[day]![rarity]!.missions[0]!.override?.picks).toEqual([]);
  expect(() => editMission(data, { day, rarity, mission: DAILY_PICKER.id, revision: 0, picks: [], note: "", restore: false }, "later")).toThrow(/changed/);
  const restored = editMission(data, { day, rarity, mission: DAILY_PICKER.id, revision: 1, picks: [], note: "", restore: true }, "later");
  expect(applyMissionEdits(logs, [restored])[0]!.days[day]![rarity]!.missions[0]!.override).toBeUndefined();
});
it("retains Sorare's official verdict for an unchanged card in a manual correction", () => {
  const day = "2026-10-06", rarity = "limited";
  const pick = { player: "a", card: "card-a", game: "g", rarity, status: "SUCCESS" };
  const source = nextDay(undefined, [{ ...DAILY_PICKER, appearances: [pick] }], [], {}, rarity, new Date(`${day}T12:00:00Z`));
  const data = editMission(null, { day, rarity, mission: DAILY_PICKER.id, revision: 0, picks: [{ ...pick, status: null }], note: "", restore: false }, "now");
  const logs = applyMissionEdits([{ days: { [day]: { [rarity]: source } } }], [data]);
  expect(missionHistory(logs, rarity, new Map())[0]!.yours[0]!.state).toBe("did");
});
it("keeps a correction when an assumed mission is reconciled to Sorare's task ID", () => {
  const day = "2026-10-06", rarity = "limited";
  const old = nextDay(undefined, null, [], {}, rarity, new Date(`${day}T12:00:00Z`));
  const imported = nextDay(old, [{ ...DAILY_PICKER, id: "source-task" }], [], {}, rarity, new Date(`${day}T13:00:00Z`));
  const edits = editMission(null, { day, rarity, mission: DAILY_PICKER.id, revision: 0, picks: [], note: "My correction", restore: false }, "2026-10-06T12:30:00Z");
  const mission = applyMissionEdits([{ days: { [day]: { [rarity]: imported } } }], [edits])[0]!.days[day]![rarity]!.missions[0]!;
  expect(mission.override?.note).toBe("My correction");
});
