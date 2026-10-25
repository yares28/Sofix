import { expect, it } from "vitest";
import { projectedRewards, rewardTotal, rewardSignature, rewardForecast, rewardCoverage, projectedPrize, prizeOptions, type RewardValues } from "./playRewards";
import type { Lineup } from "./play";

it("shows the attainable prize at the forecast score instead of a probability-weighted payout",()=>{
  const line={x:320,rarity:"limited",kind:"laliga",eCash:.21,eEss:29,tiers:[{need:400,p:.02,cash:5},{need:300,p:.14,essence:250},{need:0,p:.84,xp:200}]} as Lineup;
  expect(projectedPrize(line)).toEqual({"essence:limited:laliga":250});
  expect(prizeOptions(line)).toEqual(expect.arrayContaining([expect.objectContaining({p:.14,values:{"essence:limited:laliga":250}}),expect.objectContaining({p:.02,values:{"cash:USD":5}})]));
  expect(projectedPrize({...line,x:280})).toEqual({"xp:FOOTBALL_XP":200});
  expect(projectedPrize({...line,x:0,tiers:[{need:300,p:.14,essence:250}]})).toEqual({});
  expect(projectedPrize({...line,tiers:[{p:.14,essence:250}]})).toBeNull();
});

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
