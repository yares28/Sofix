import type { Lineup } from "./play";

export type RewardValues = Record<string, number | null>;
export type PlayRewardBlock = {
  slug:string; state:"watching"|"pending"|"checked"; checkedAt?:string; nextCheckAt?:string|null;
  you?:{id:string;rewards:RewardValues|null}[];
  sofix?:{signature:string;rewards:RewardValues|null;unavailable?:boolean}[]; planRank?:number|null;
};
export type EnteredRewardCheck=Pick<PlayRewardBlock,"you"|"checkedAt"|"nextCheckAt">;
export const REWARD_BASE = ["cash:USD","card","xp:FOOTBALL_XP"];
const known = (n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n)&&n>=0;

export function projectedRewards(line:Lineup):RewardValues|undefined {
  if (![line.eCash,line.eEss,line.pCard].some(known)) return undefined;
  return {"cash:USD":known(line.eCash)?line.eCash:null,[`essence:${line.rarity??"unknown"}:${line.kind??"unknown"}`]:known(line.eEss)?line.eEss:null,
    card:known(line.pCard)?line.pCard:null,"xp:FOOTBALL_XP":line.tiers?.length&&line.tiers.every(t=>known(t.p))?line.tiers.reduce((n,t)=>n+t.p*(t.xp??0),0):null};
}

export function rewardTotal(rows:(RewardValues|null|undefined)[],key:string,projection:boolean):number|null {
  if (!rows.length || rows.some(r=>!r)) return null;
  let sum=0;
  for (const row of rows) {
    const r=row!;
    const keys=key==="card"?Object.keys(r).filter(k=>k==="card"||k.startsWith("card:")):key==="xp:FOOTBALL_XP"?Object.keys(r).filter(k=>k.startsWith("xp:")):[key];
    if (keys.some(k=>r[k]===null)) return null;
    if (projection && !keys.some(k=>known(r[k])) && (!key.startsWith("essence:") || !Object.keys(r).some(k=>k.startsWith("essence:")&&known(r[k])))) return null;
    sum+=keys.reduce((n,k)=>n+(r[k]??0),0);
  }
  return sum;
}

export function rewardKeys(rows:(RewardValues|null|undefined)[]):string[] {
  const keys=[...new Set([...REWARD_BASE,...rows.flatMap(r=>Object.keys(r??{}).filter(k=>k!=="card"&&!k.startsWith("card:")&&!k.startsWith("xp:")))])];
  if (!keys.some(k=>k.startsWith("essence:"))) keys.push("essence:unknown:unknown");
  const placeholder=keys.indexOf("essence:unknown:unknown");
  if (placeholder>=0&&keys.some(k=>k.startsWith("essence:")&&k!=="essence:unknown:unknown")&&!rows.some(r=>typeof r?.["essence:unknown:unknown"]==="number")) keys.splice(placeholder,1);
  const order=(key:string)=>["cash","essence","card","xp","coin"].indexOf(key.split(":")[0]!);
  return keys.sort((a,b)=>order(a)-order(b)||a.localeCompare(b));
}

export function rewardForecast(rows:(RewardValues|null|undefined)[]):RewardValues {
  return Object.fromEntries(rewardKeys(rows).map(k=>[k,rewardTotal(rows.filter(r=>r&&rewardTotal([r],k,true)!==null),k,true)]));
}
export const rewardCoverage=(rows:(RewardValues|null|undefined)[])=>Object.fromEntries(rewardKeys(rows).map(k=>[k,rows.filter(r=>r&&rewardTotal([r],k,true)!==null).length]));
export function actualRewards(rows:(RewardValues|null|undefined)[]) {
  const checked=rows.filter((r):r is RewardValues=>r!=null);
  return {checked:checked.length,total:rows.length,values:Object.fromEntries(rewardKeys(rows).map(k=>[k,rewardTotal(checked,k,false)]))};
}
export function rewardSignature(line:Pick<Lineup,"board"|"starters"|"subs">):string {
  return [line.board,...[...line.starters,...line.subs].map(c=>`${c.slug}:${Number(Boolean(c.captain))}`)].join("|");
}
