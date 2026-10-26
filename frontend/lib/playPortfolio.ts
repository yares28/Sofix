import type { GameweekLineup } from "./entered";
import { lineupActual, type ActualScores, type enteredScore } from "./lineupScores";
import type { Lineup, Plan } from "./play";
import { actualRewards, type RewardValues, projectedRewards, projectedPrize, prizeOptions, rewardSignature, type PlayRewardBlock, type EnteredRewardCheck, type PrizeOption } from "./playRewards";

export type PortfolioCard = { slug: string; name: string; pic: string };
export type Portfolio = {
  lineups: number; rated: number; expectedPaid: number | null; noReward: number | null;
  averagePoints: number | null; estimated: boolean; cards: PortfolioCard[];
  pAny?: number; essence?: number; cash?: number; fees?: number;
  rewardActual?:ReturnType<typeof actualRewards>;
  checkedAt?:string;
  nextCheckAt?:string|null;
  unavailable?:number;
  pointRated:number;
  prizeProjection:ReturnType<typeof actualRewards>;
  prizeLines:{name:string;score:number|null;options:PrizeOption[]}[];
  /** Once the GW locks: the points scored so far per scored lineup, beside the projection that stays. */
  live:boolean; actualPoints:number|null; actualRated:number;
  /** Some "won" figures are the prize the score so far reaches, not yet a checked reward. */
  rewardLive:boolean;
};
type PrizeLine=Pick<Lineup,"tiers"|"rarity"|"kind"|"pro"|"group">;
const mean=(xs:(number|null|undefined)[])=>{const known=xs.filter((n):n is number=>typeof n==="number"&&Number.isFinite(n));return {value:known.length?known.reduce((a,b)=>a+b,0)/known.length:null,rated:known.length};};
/** Each lineup's checked reward, else (once locked) the prize its score so far reaches. */
function wonSoFar(rows:{checked:RewardValues|null|undefined;score:number|null;line:PrizeLine|undefined}[],live:boolean){
  let rewardLive=false;
  const values=rows.map(r=>{
    if(r.checked||!live||r.score===null||!r.line)return r.checked;
    const atScore=projectedPrize({...r.line,x:r.score});
    if(atScore)rewardLive=true;
    return atScore;
  });
  return {rewardActual:actualRewards(values),rewardLive};
}
type Forecast = ReturnType<typeof enteredScore>;
const validChance = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
const preview = (cards: PortfolioCard[]) => cards.filter((c,i) => cards.findIndex(p => p.slug === c.slug) === i).slice(0,5);

/** Expected paid lineups add marginal chances; average lineup risk needs no portfolio-independence assumption. */
function summary(forecasts: Forecast[], cards: PortfolioCard[]): Portfolio {
  const chances = forecasts.map(f => f.chance).filter(validChance);
  const scores = forecasts.map(f => f.value).filter((n): n is number => n !== null && Number.isFinite(n));
  const expected = chances.length ? chances.reduce((sum,p) => sum + p, 0) : null;
  return { lineups: forecasts.length, rated: chances.length, expectedPaid: expected,
    noReward: expected === null ? null : 1 - expected / chances.length,
    averagePoints: scores.length ? scores.reduce((sum,x) => sum + x, 0) / scores.length : null,pointRated:scores.length,
    prizeProjection:actualRewards(forecasts.map(f=>f.atScore)),prizeLines:[],live:false,actualPoints:null,actualRated:0,rewardLive:false,
    estimated: forecasts.some(f => f.estimated), cards: preview(cards) };
}

export function enteredPortfolio(lineups: GameweekLineup[], forecasts: Map<string, Forecast>, rewards?:EnteredRewardCheck|null, live=false): Portfolio {
  const entered = lineups.filter(l => !l.draft);
  const result=summary(entered.map(l => forecasts.get(l.id) ?? { value: null, estimated: false }), entered.flatMap(l => l.cards.map(c => ({ slug: c.slug, name: c.name, pic: c.picture ?? "" }))));
  const scores=entered.map(l=>live?l.result?.score??null:null),actual=mean(scores);
  const won=wonSoFar(entered.map((l,i)=>({checked:rewards?.you?.find(r=>r.id===l.id)?.rewards,score:scores[i]!,line:forecasts.get(l.id)?.prizeLine})),live);
  return {...result,...won,live,actualPoints:actual.value,actualRated:actual.rated,prizeLines:entered.map((l,i)=>({name:`${l.competition} ${i+1}`,score:forecasts.get(l.id)?.value??null,options:forecasts.get(l.id)?.prizes??[]})),checkedAt:rewards?.checkedAt,nextCheckAt:rewards?.nextCheckAt};
}

/** `scores`: the GW's scores once it locks (lib/planScoresData.ts); absent before the lock. */
export function planPortfolio(plan: Plan | null | undefined,rewards?:PlayRewardBlock|null,scores?:ActualScores): Portfolio {
  const result = summary((plan?.lineups ?? []).map(l => ({ value: l.x, chance: l.pReturn, estimated: false,rewards:projectedRewards(l),atScore:projectedPrize(l),prizes:prizeOptions(l) })), (plan?.lineups ?? []).flatMap(l => l.starters.map(c => ({ slug: c.slug, name: c.name, pic: c.pic }))));
  if(!plan)return result;
  const live=scores!==undefined,checked=(l:Lineup)=>rewards?.sofix?.find(r=>r.signature===rewardSignature(l));
  const points=plan.lineups.map(l=>live?lineupActual(l,scores).value:null),actual=mean(points);
  const won=wonSoFar(plan.lineups.map((l,i)=>({checked:checked(l)?.rewards,score:points[i]!,line:l})),live);
  return { ...result,...won,live,actualPoints:actual.value,actualRated:actual.rated,prizeLines:plan.lineups.map((l,i)=>({name:`${l.comp} ${i+1}`,score:l.x,options:prizeOptions(l)})), pAny: validChance(plan.pAny) ? plan.pAny : undefined, fees: plan.fees,checkedAt:rewards?.checkedAt,nextCheckAt:rewards?.nextCheckAt,
    unavailable:plan.lineups.filter(l=>checked(l)?.unavailable).length };
}
