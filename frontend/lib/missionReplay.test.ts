import { expect, it, vi } from "vitest";
vi.mock("./cache",()=>({cache:(fn:unknown)=>fn}));
import { displayMissionLog, missionHistory, restoreMissionBenchmark, type LogRarity } from "./missionLog";
import { missionComparison } from "./missionComparison";
import type { PlayingPlayer } from "./play";

it("shows the reconstructed missing reference and keeps its comparison labelled without replacing recorded forecasts",()=>{
  const mission={key:"pass",title:"Pass",description:"70+ accurate passes",mode:"DECISIVE" as const,
    rule:{kind:"pass" as const,atLeast:70,label:"70+ accurate passes"},stats:["accurate_pass"],picks:1,sofix:[],yours:[{player:"a",game:"g",rarity:"limited",status:"SUCCESS"}]};
  const cand={s:"a",n:"A",pic:"",pos:"MID",g:"g",k:"2026-10-10T19:00:00Z",c:{pass:0.5},r:{did:{pass:true}}};
  const replay:LogRarity={loaded:true,coverage:"snapshot",reconstructed:true,missions:[{...mission,sofix:["a"],bestPicks:[mission.yours[0]!]}],cands:[cand]};
  const original:LogRarity={loaded:true,coverage:"snapshot",missions:[mission],cands:[{...cand,c:{}}],replay};
  const log=[{days:{"2026-10-10":{limited:original}}}];
  const history=missionHistory(displayMissionLog(log),"limited",new Map(),30,"best");
  expect(history[0]).toMatchObject({reconstructed:true,score:{got:1,best:1}});
  expect(missionComparison(history).counted).toBe(1);
  expect(missionHistory(log,"limited",new Map())[0]!.score).toBeNull();
  const source={id:"pass",title:"Pass",description:mission.description,mode:"DECISIVE" as const,picks:1,made:1,period:"DAILY",state:null,stats:mission.stats};
  const shown=restoreMissionBenchmark([source],original,[],{},"limited",new Date("2026-10-10T23:00:00Z"),"best");
  expect(shown[0]!.picks[0]).toMatchObject({slug:"a",reconstructed:true});
  original.replay!.cands[0]!.match = {id:"g",kickoff:cand.k} as PlayingPlayer["games"][number];
  const current = {player:"a",rarity:"limited",games:[{id:"g",kickoff:cand.k,team:"Athletic Club",opponent:"Rayo Vallecano",venue:"H"}]} as PlayingPlayer;
  expect(restoreMissionBenchmark([source],original,[current],{},"limited",new Date("2026-10-10T23:00:00Z"),"best")[0]!.picks[0]).toMatchObject({team:"Athletic Club",opponent:"Rayo Vallecano",venue:"H",chance:0.5});
  expect(original.missions[0]!.sofix).toEqual([]);

  replay.missions[0]!.source = {...source,eligibilityComplete:false};
  original.missions[0]!.source = {...source,eligibilityComplete:false};
  const provisional = missionHistory(displayMissionLog(log),"limited",new Map(),30,"best");
  expect(provisional[0]).toMatchObject({provisional:true,evidence:"settled",score:{got:1,best:1}});
  expect(missionComparison(provisional).counted).toBe(1);
  expect(missionHistory(log,"limited",new Map())[0]!.score).toBeNull();
  original.missions[0]!.source = {...source,eligibilityComplete:true};
  expect(missionHistory(displayMissionLog(log),"limited",new Map(),30,"best")[0]!.provisional).toBe(true);

  // A later Sorare import replaces a legacy task key. The reconstructed reference and latest own picks survive.
  original.missions[0] = {...mission,key:"source-pass",aliases:["pass"]};
  const reconciled = missionHistory(displayMissionLog(log),"limited",new Map(),30,"best");
  expect(reconciled[0]).toMatchObject({key:"source-pass",score:{got:1,best:1},yours:[{slug:"a",state:"did"}]});
  expect(restoreMissionBenchmark([{...source,id:"source-pass"}],original,[],{},"limited",new Date("2026-10-10T23:00:00Z"),"best")[0]!.picks[0]).toMatchObject({slug:"a",reconstructed:true});
});
