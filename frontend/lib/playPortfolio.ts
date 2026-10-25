import type { GameweekLineup } from "./entered";
import type { enteredScore } from "./lineupScores";
import type { Plan } from "./play";
import { actualRewards, projectedRewards, projectedPrize, prizeOptions, rewardSignature, type PlayRewardBlock, type EnteredRewardCheck, type PrizeOption } from "./playRewards";

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
};
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
    prizeProjection:actualRewards(forecasts.map(f=>f.atScore)),prizeLines:[],
    estimated: forecasts.some(f => f.estimated), cards: preview(cards) };
}

export function enteredPortfolio(lineups: GameweekLineup[], forecasts: Map<string, Forecast>, rewards?:EnteredRewardCheck|null): Portfolio {
  const entered = lineups.filter(l => !l.draft);
  const result=summary(entered.map(l => forecasts.get(l.id) ?? { value: null, estimated: false }), entered.flatMap(l => l.cards.map(c => ({ slug: c.slug, name: c.name, pic: c.picture ?? "" }))));
  return {...result,prizeLines:entered.map((l,i)=>({name:`${l.competition} ${i+1}`,score:forecasts.get(l.id)?.value??null,options:forecasts.get(l.id)?.prizes??[]})),checkedAt:rewards?.checkedAt,nextCheckAt:rewards?.nextCheckAt,rewardActual:actualRewards((rewards?.you??entered.map(l=>({id:l.id,rewards:null}))).map(l=>l.rewards))};
}

export function planPortfolio(plan: Plan | null | undefined,rewards?:PlayRewardBlock|null): Portfolio {
  const result = summary((plan?.lineups ?? []).map(l => ({ value: l.x, chance: l.pReturn, estimated: false,rewards:projectedRewards(l),atScore:projectedPrize(l),prizes:prizeOptions(l) })), (plan?.lineups ?? []).flatMap(l => l.starters.map(c => ({ slug: c.slug, name: c.name, pic: c.pic }))));
  return plan ? { ...result,prizeLines:plan.lineups.map((l,i)=>({name:`${l.comp} ${i+1}`,score:l.x,options:prizeOptions(l)})), pAny: validChance(plan.pAny) ? plan.pAny : undefined, fees: plan.fees,checkedAt:rewards?.checkedAt,nextCheckAt:rewards?.nextCheckAt,
    rewardActual:actualRewards(plan.lineups.map(l=>rewards?.sofix?.find(r=>r.signature===rewardSignature(l))?.rewards)),unavailable:plan.lineups.filter(l=>rewards?.sofix?.find(r=>r.signature===rewardSignature(l))?.unavailable).length } : result;
}
