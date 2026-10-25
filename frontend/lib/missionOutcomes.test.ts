import { describe, expect, it } from "vitest";
import type { HistoryDay } from "./missionLog";
import { missionOutcomes, missionOutcomeSummary, missionRace, missionSegment } from "./missionOutcomes";

const pick = (state: "did" | "didnt" | "waiting" | "void", slug: string = state) => ({ slug, name: slug, pic: "", state });
const day = (extra: Partial<HistoryDay> = {}): HistoryDay => ({ day: "2026-10-18", key: "goals", mission: "Goal - All Matches", loaded: true,
  yours: [pick("did", "you")], sofix: [pick("didnt", "sofix")], missed: [], score: null, evidence: "incomplete", yourPicks: "recorded", ...extra });
const rows = (days: HistoryDay[]) => missionOutcomes([{ rarity: "limited", days }]);

describe("mission outcomes use the same settled selections as history", () => {
  it("gives segment details distinct mission counts, full-house amounts and only successful rarities",()=>{
    const data=missionOutcomes([{rarity:"limited",days:[day({source:{picks:2,description:"Win 50 All-Star Essence per correct choice. Win up to 200 All-Star Essence if all picks are successful.",rule:{kind:"goal"}} as HistoryDay["source"],yours:[pick("did","a"),pick("did","b")]})]},
      {rarity:"rare",days:[day({yours:[pick("didnt")],source:{picks:1,description:"Win 50 All-Star Essence per correct choice.",rule:{kind:"goal"}} as HistoryDay["source"]})]}]);
    expect(missionSegment(data,"you","essence")).toMatchObject({picks:2,missions:1,checked:2,rarities:[{rarity:"limited",hits:2,missions:1}],rewards:[{rarity:"limited",unit:"All-Star Essence",amount:200}]});
    expect(missionSegment(data,"you","miss")).toMatchObject({picks:1,missions:1,rewards:[]});
    expect(missionSegment(data,"sofix","essence").picks).toBe(0);
  });
  it("compares reward categories on the same fully checked missions and retains zero hits", () => {
    const data=rows([day(),day({key:"xp",yours:[pick("didnt")],sofix:[pick("did")]}),day({key:"waiting",yours:[pick("waiting")]})]);
    data[0]!.category="essence"; data[1]!.category="xp";
    expect(missionRace(data,"xp")).toMatchObject({missions:1,points:[{you:0,sofix:0},{you:0,sofix:1}]});
    expect(missionRace(data,"essence")).toMatchObject({missions:1,points:[{you:0,sofix:0},{you:1,sofix:0}]});
    expect(missionRace(data,"clues").missions).toBe(0);
  });
  it("includes known picks when the eligible-card ceiling is incomplete or other candidates are pending", () => {
    const s = missionOutcomeSummary(rows([day(), day({ key: "passes", mission: "Pass", evidence: "pending" })]));
    expect(s.you).toMatchObject({ missions: 2, hits: 2, picks: { hit: 2, miss: 0, pending: 0 } });
    expect(s.sofix).toMatchObject({ missions: 2, hits: 0, picks: { hit: 0, miss: 2 } });
    expect(s.paired).toMatchObject({ missions: 2, you: 2, sofix: 0 });
  });
  it("settles each side independently, excludes void games and leaves empty selections unknown", () => {
    const s = missionOutcomeSummary(rows([day({ yours: [pick("did"), pick("waiting")] }), day({ key: "other", yours: [], sofix: [pick("void")] })]));
    expect(s.you.missions).toBe(0);
    expect(s.you.picks).toMatchObject({ hit: 1, pending: 1 });
    expect(s.sofix.missions).toBe(1);
    expect(s.paired.missions).toBe(0);
  });
  it("counts a mission hit once, while the outcome bar counts every successful and missed pick", () => {
    const s = missionOutcomeSummary(rows([day({ yours: [pick("did", "a"), pick("did", "b"), pick("didnt", "c")] })]));
    expect(s.you).toMatchObject({ missions: 1, hits: 1, picks: { hit: 2, miss: 1 } });
    expect(s.targets[0]!.you).toEqual({ hits: 1, missions: 1 });
  });
  it("retains reconstruction provenance without counting it as a captured paired comparison", () => {
    const s = missionOutcomeSummary(rows([day({ reconstructed: true })]));
    expect(s.you.hits).toBe(1);
    expect(s.sofix.missions).toBe(1);
    expect(s.paired.missions).toBe(0);
    expect(s.reconstructed).toBe(1);
  });
  it("separates reward units and rarity, applies full-house terms, and never invents unknown rewards", () => {
    const withReward = (description: string, extra: Partial<HistoryDay> = {}) => day({ ...extra, source: { picks: 3, description, rule: { kind: "goal", label: "a goal" } } as HistoryDay["source"] });
    const outcomes = missionOutcomes([
      { rarity: "limited", days: [withReward("Win 50 All-Star Essence per correct choice. Win up to 500 All-Star Essence if all picks are successful.", { yours: [pick("did", "a"), pick("did", "b"), pick("did", "c")] }), withReward("Earn 200 XP for each player you select.", { key: "xp" }), withReward("Win 1 Nationality Clue per correct choice.", { key: "clue" }), day({ key: "unknown" })] },
      { rarity: "rare", days: [withReward("Win 50 All-Star Essence per correct choice.")] },
    ]);
    const s = missionOutcomeSummary(outcomes);
    expect(s.you.segments).toMatchObject({ essence: 4, xp: 1, clues: 1, unknown: 1 });
    expect(s.you.rewards).toEqual(expect.arrayContaining([{ rarity: "limited", unit: "All-Star Essence", amount: 500 }, { rarity: "rare", unit: "All-Star Essence", amount: 50 }, { rarity: "limited", unit: "Nationality Clues", amount: 1 }]));
    expect(outcomes[0]!.target).toBe("Goals");
  });
  it("keeps all dated missions and uses one identity per day, rarity and task", () => {
    expect(missionOutcomes([{ rarity: "limited", days: [day(), day({ key: "passes" })] }, { rarity: "rare", days: [day()] }])).toHaveLength(3);
    expect(missionOutcomeSummary([]).paired).toEqual({ missions: 0, you: 0, sofix: 0 });
  });
});
