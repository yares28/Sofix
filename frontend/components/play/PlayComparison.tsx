import type { ReactNode } from "react";
import type { Portfolio } from "../../lib/playPortfolio";
import CardArt from "../cards/CardArt";
import { essenceName } from "../../lib/play";
import { rewardKeys, type EnteredRewardCheck } from "../../lib/playRewards";

export type PlayComparisonProps = { heading: ReactNode; recommendation: Portfolio; action?: ReactNode; early?: boolean; played?: boolean; rewards?:EnteredRewardCheck|null };
const number = (n: number, digits = 1) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(n);
const chance = (n: number) => n > 0 && n < .005 ? "<1%" : n < 1 && n > .995 ? ">99%" : `${Math.round(n * 100)}%`;
const paid = (n: number) => n > 0 && n < .05 ? "<0.1" : number(n);
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const rewardName=(key:string)=>{const [type,rarity,kind]=key.split(":");return type==="cash"?"Cash":type==="card"?"Cards":type==="xp"?"XP":type==="essence"?`${essenceName(kind==="unknown"?undefined:kind)||"Unspecified"} essence · ${rarity?.replaceAll("_"," ")}`:`${rarity??""} coins`;};
const rewardNumber=(key:string,n:number|null|undefined)=>n==null?"—":key.startsWith("cash:")?money(n):n>0&&n<.05?"<0.1":number(n,key==="card"?1:0);
const projectedNumber=(key:string,p:Portfolio)=>{const n=p.rewardForecast?.[key],partial=(p.rewardCoverage?.[key]??0)>0&&(p.rewardCoverage?.[key]??0)<p.lineups;return partial&&n!=null?(n>0&&n<.05?">0":`≥${rewardNumber(key,n)}`):rewardNumber(key,n);};

function Rewards({portfolio:p,own,keys,loading}:{portfolio:Portfolio;own?:boolean;keys:string[];loading?:boolean}) {
  const actual=p.rewardActual,partial=Boolean(actual?.checked&&actual.checked<actual.total);
  return <section className="pc-rewards" aria-label={`${own?"You":"Sofix"} projected and actual rewards`} aria-busy={loading||undefined}>
    <div className="pc-reward-head"><span>Rewards</span><span>Projected</span><span>{own?"Won":"Would have won"}</span></div>
    <dl>{keys.map(key=><div key={key} data-reward={key}><dt>{rewardName(key)}</dt><dd title={`${p.rewardCoverage?.[key]??0}/${p.lineups} lineup forecasts`}>{loading?<i className="pc-skeleton"/>:projectedNumber(key,p)}</dd><dd>{rewardNumber(key,actual?.values[key]??(actual?.checked?0:null))}{partial&&actual?.checked?<small>+</small>:null}</dd></div>)}</dl>
    <p className="pc-reward-coverage">{actual?.total?`${actual.checked}/${actual.total} lineups checked${partial?" · known rewards so far":""}`:"Rewards pending"}{p.unavailable?<span>{p.unavailable} without a comparable result</span>:null}{p.nextCheckAt?<span>Next check <time dateTime={p.nextCheckAt}>{new Intl.DateTimeFormat("en-GB",{weekday:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Madrid"}).format(new Date(p.nextCheckAt))}</time></span>:p.checkedAt?<span>Checked <time dateTime={p.checkedAt}>{new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Madrid"}).format(new Date(p.checkedAt))}</time></span>:null}</p>
  </section>;
}

function Side({ label, portfolio: p, loading, own, state, action,keys }: { label: string; portfolio: Portfolio; loading?: boolean; own?: boolean; state?: string; action?: ReactNode;keys:string[] }) {
  const unknown = !loading && p.noReward === null;
  return <section className={`pc-side ${own ? "pc-you" : "pc-sofix"}${loading ? " pc-loading" : ""}`} aria-label={`${label} lineup forecast`} aria-busy={loading || undefined}>
    <div className="pc-side-head"><div><h2>{label}</h2><span>{loading ? "Checking your lineups…" : own ? p.lineups ? `${p.lineups} entered · ${state === "saved" ? "saved read" : "on Sorare"}` : state === "early" ? "Sorare has not opened this GW" : state === "unavailable" ? "Entries unavailable" : "No entered lineups" : p.lineups ? `${p.lineups} recommended lineups` : "Plan unavailable"}</span></div>{action ? <div className="pc-action">{action}</div> : null}</div>
    <div className="pc-figures" aria-live="polite"><div className="pc-potential"><span>Expected paid lineups</span><strong>{loading ? <i className="pc-skeleton"/> : p.expectedPaid === null ? "—" : paid(p.expectedPaid)}{!loading && p.expectedPaid !== null ? <small>/{p.lineups}</small> : null}</strong></div><div className="pc-risk"><span>No-reward risk <small>/ lineup</small></span><strong>{loading ? <i className="pc-skeleton"/> : p.noReward === null ? "—" : chance(p.noReward)}</strong></div></div>
    <div className={`pc-risk-track${unknown ? " pc-unknown" : ""}`} role="img" aria-label={loading ? `${label}: forecast loading` : p.noReward === null ? `${label}: reward risk unavailable` : `${label}: average paid reward chance ${chance(1 - p.noReward)}, no-reward risk ${chance(p.noReward)}`}><i style={{ transform: `scaleX(${p.noReward === null ? 0 : 1 - p.noReward})` }}/></div>
    <div className="pc-side-foot"><div className="pc-fan" aria-label={`${label} card preview`}>{loading ? Array.from({ length: 5 }, (_,i) => <span className="pc-fan-skeleton" key={i}/>) : p.cards.map(c => <span className="pc-preview-card" key={c.slug} title={c.name}><CardArt src={c.pic} name={c.name}/></span>)}</div><div className="pc-points"><strong>{loading ? <i className="pc-skeleton"/> : p.averagePoints === null ? "—" : number(p.averagePoints,0)}</strong><span>projected pts / lineup{p.estimated ? <small>Estimated from this GW</small> : null}</span></div></div>
    <div className="pc-detail">{unknown&&p.lineups?<span>{p.rated}/{p.lineups} lineups have reward forecasts</span>:null}{!own&&p.pAny!==undefined?<span><b>{chance(p.pAny)}</b> chance of any plan reward</span>:null}{p.fees?<span>{number(p.fees,0)} essence in entry fees</span>:null}</div>
    <Rewards portfolio={p} own={own} keys={keys} loading={loading}/>
  </section>;
}

export default function PlayComparison({ heading, recommendation, action, early, played, yours, state = "loading" }: PlayComparisonProps & { yours: Portfolio; state?: "loading" | "ready" | "saved" | "unavailable" | "early" }) {
  const keys=rewardKeys([yours.rewardForecast,recommendation.rewardForecast,yours.rewardActual?.values,recommendation.rewardActual?.values]);
  return <section className="pc-hero" aria-label="Your lineups compared with Sofix">
    <div className="pc-heading">{heading}<span className="pc-context">{early ? "Early projections" : played ? "Recorded before kickoff" : "Before-kickoff forecast"}</span></div>
    <div className="pc-matchup"><Side label="You" portfolio={yours} own keys={keys} loading={state === "loading"} state={state} action={early ? undefined : <a className="pc-entered-link" href="#entered-lineups-title">Your lineups<span aria-hidden="true">↓</span></a>}/><Side label="Sofix" portfolio={recommendation} action={action} keys={keys}/></div>
  </section>;
}
