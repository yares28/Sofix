import { essenceName, type Lineup, type Tier } from "./play";

export type RewardValues = Record<string, number | null>;
export type PlayRewardBlock = {
  slug:string; state:"watching"|"pending"|"checked"; checkedAt?:string; nextCheckAt?:string|null;
  you?:{id:string;rewards:RewardValues|null}[];
  sofix?:{signature:string;rewards:RewardValues|null;unavailable?:boolean}[]; planRank?:number|null;
};
export type EnteredRewardCheck=Pick<PlayRewardBlock,"you"|"checkedAt"|"nextCheckAt">;
export const REWARD_BASE = ["cash:USD","card","xp:FOOTBALL_XP"];
const known = (n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n)&&n>=0;

export type PrizeOption={values:RewardValues;p:number;need:number|null;label?:string};
function tierPrize(line:Pick<Lineup,"rarity"|"kind"|"pro">,tier:Tier):RewardValues {
  const boost=line.pro?.boost??1;
  return Object.fromEntries(Object.entries({"cash:USD":(tier.cash??0)*boost,[`essence:${line.rarity??"unknown"}:${line.kind??"unknown"}`]:(tier.essence??0)*boost,
    card:Number(Boolean(tier.card)),"xp:FOOTBALL_XP":tier.xp??0}).filter(([,n])=>known(n)&&n>0));
}
export function prizeOptions(line:Pick<Lineup,"tiers"|"rarity"|"kind"|"pro">):PrizeOption[] {
  if(line.pro&&!known(line.pro.boost))return [];
  return (line.tiers??[]).filter(t=>known(t.p)&&t.p>0).map(t=>({values:tierPrize(line,t),p:t.p,need:t.need??null,...(t.label?{label:t.label}:{})})).filter(t=>Object.keys(t.values).length);
}
/** A real prize reached by the point forecast; never an expected-value payout or an invented Room ranking. */
export function projectedPrize(line:Pick<Lineup,"x"|"tiers"|"rarity"|"kind"|"pro"|"group">):RewardValues|null {
  if (!Number.isFinite(line.x)||line.group==="Room"||!line.tiers?.length||line.tiers.some(t=>!known(t.need))||line.pro&&!known(line.pro.boost)) return null;
  const tier=[...line.tiers].sort((a,b)=>b.need!-a.need!).find(t=>line.x>=t.need!);
  return tier?tierPrize(line,tier):{};
}

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

export const rewardName=(key:string)=>{const [type,rarity,kind]=key.split(":");return type==="cash"?"Cash":type==="card"?"Cards":type==="xp"?"XP":type==="essence"?`${essenceName(kind==="unknown"?undefined:kind)||"Unspecified"} essence · ${rarity?.replaceAll("_"," ")}`:`${rarity??""} coins`;};
export const rewardNumber=(key:string,n:number)=>key.startsWith("cash:")?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n):new Intl.NumberFormat("en-GB",{maximumFractionDigits:2}).format(n);
