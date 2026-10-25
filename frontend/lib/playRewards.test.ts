import { expect, it } from "vitest";
import { projectedRewards, rewardTotal, rewardSignature, rewardForecast, rewardCoverage, type RewardValues } from "./playRewards";
import type { Lineup } from "./play";

it("projects cash, essence, cards and XP separately, retaining known zero and absent XP",()=>{
  const line={eCash:0,eEss:50,pCard:.2,rarity:"rare",kind:"laliga",tiers:[{p:.5,xp:1000}]} as Lineup;
  expect(projectedRewards(line)).toEqual({"cash:USD":0,"essence:rare:laliga":50,card:.2,"xp:FOOTBALL_XP":500});
  expect(projectedRewards({...line,tiers:[]})).toMatchObject({"xp:FOOTBALL_XP":null});
  expect(rewardTotal([projectedRewards(line),undefined],"cash:USD",true)).toBeNull();
  expect(rewardForecast([projectedRewards(line),undefined])["essence:rare:laliga"]).toBe(50);
  expect(rewardCoverage([projectedRewards(line),undefined])["essence:rare:laliga"]).toBe(1);
});
it("adds source receipts without mixing essence currencies and counts every card reward",()=>{
  const receipts:RewardValues[]=[{"cash:USD":0,"essence:limited:laliga":100,"card:rare":1},{"essence:rare:champion":20,"xp:RARE_XP":500}];
  expect(rewardTotal(receipts,"card",false)).toBe(1);
  expect(rewardTotal(receipts,"xp:FOOTBALL_XP",false)).toBe(500);
  expect(rewardTotal(receipts,"essence:limited:laliga",false)).toBe(100);
  expect(rewardTotal(receipts,"essence:rare:champion",false)).toBe(20);
  expect(rewardTotal([{}],"cash:USD",false)).toBe(0);
  expect(rewardTotal([null],"cash:USD",false)).toBeNull();
});
it("requires the exact board, order, captain and substitutes for a recommended result",()=>{
  const line={board:"b",starters:[{slug:"one",captain:true}],subs:[{slug:"two"}]} as Lineup;
  expect(rewardSignature(line)).toBe("b|one:1|two:0");
  expect(rewardSignature({...line,board:"other"})).not.toBe(rewardSignature(line));
  expect(rewardSignature({...line,subs:[]})).not.toBe(rewardSignature(line));
});
