import type { CSSProperties, ReactNode } from "react";
import type { Portfolio } from "../../lib/playPortfolio";
import CardArt from "../cards/CardArt";
import DetailTip from "../ui/DetailTip";
import PrizeDetails from "./PrizeDetails";
import { rewardKeys, rewardName, rewardNumber, type EnteredRewardCheck } from "../../lib/playRewards";

export type PlayComparisonProps = { heading: ReactNode; recommendation: Portfolio; action?: ReactNode; early?: boolean; played?: boolean; rewards?:EnteredRewardCheck|null };
const number = (n: number, digits = 1) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(n);
const chance = (n: number) => n > 0 && n < .005 ? "<1%" : n < 1 && n > .995 ? ">99%" : `${Math.round(n * 100)}%`;
const paid = (n: number) => n > 0 && n < .05 ? "<0.1" : number(n);

function Rewards({portfolio:p,own,loading}:{portfolio:Portfolio;own?:boolean;loading?:boolean}) {
  // Before every lineup is checked, a locked GW's "won" is the prize each score so far reaches.
  const soFar=p.rewardLive;
  const actual=p.rewardActual,projection=p.prizeProjection;
  const keys=rewardKeys([projection.values,actual?.values]).filter(k=>(projection.values[k]??0)>0||(actual?.values[k]??0)>0);
  const partial=Boolean(actual?.checked&&actual.checked<actual.total);
  return <section className="pc-rewards" aria-label={`${own?"You":"Sofix"} projected and actual rewards`} aria-busy={loading||undefined}>
    <div className="pc-reward-head"><span>Rewards</span><span>Projected</span><span>{soFar?"So far":own?"Won":"Would have won"}</span></div>
    <dl>{keys.map(key=><div key={key} data-reward={key}><dt>{rewardName(key)}</dt><dd>{loading?<i className="pc-skeleton"/>:(projection.values[key]??0)>0?<DetailTip className="pc-prize-trigger" label={`${own?"You":"Sofix"} ${rewardName(key)} prize possibilities`} interactive content={<PrizeDetails portfolio={p} reward={key}/>}>{rewardNumber(key,projection.values[key]!)}</DetailTip>:null}</dd><dd>{(actual?.values[key]??0)>0?rewardNumber(key,actual!.values[key]!):null}{partial&&(actual?.values[key]??0)>0?<small>+</small>:null}</dd></div>)}</dl>
    {!keys.length?<p className="pc-no-prize">{loading?"Checking projections…":projection.checked?"No prize at projected scores":"Prize forecast unavailable"}</p>:null}
    <DetailTip className="pc-other-prizes" label={`${own?"You":"Sofix"} other prize possibilities`} interactive content={<PrizeDetails portfolio={p}/>}>Other prize possibilities <span aria-hidden="true">↗</span></DetailTip>
    <p className="pc-reward-coverage">{projection.checked<projection.total?<span>Prizes from {projection.checked}/{projection.total} projected lineups</span>:null}{soFar?"Prizes at scores so far":actual?.total?actual.checked===actual.total?"All lineups checked":`${actual.checked}/${actual.total} lineups checked`:"Rewards pending"}{p.unavailable?<span>{p.unavailable} without a comparable result</span>:null}{p.nextCheckAt?<span>Next check <time dateTime={p.nextCheckAt}>{new Intl.DateTimeFormat("en-GB",{weekday:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Madrid"}).format(new Date(p.nextCheckAt))}</time></span>:null}</p>
  </section>;
}

/** Before the lock the projection; after it the points so far, with the projection kept beneath. */
function Points({ portfolio: p, loading, played }: { portfolio: Portfolio; loading?: boolean; played?: boolean }) {
  const projected = p.averagePoints === null ? "—" : number(p.averagePoints, 0);
  if (!p.live) return <div className="pc-points"><strong>{loading ? <i className="pc-skeleton"/> : projected}</strong><span>projected pts / lineup{p.pointRated<p.lineups?<small>{p.pointRated}/{p.lineups} lineups</small>:null}{p.estimated ? <small>Estimated from this GW</small> : null}</span></div>;
  return <div className="pc-points"><strong>{loading ? <i className="pc-skeleton"/> : p.actualPoints === null ? "—" : number(p.actualPoints, 0)}</strong><span>{played ? "pts / lineup" : "pts / lineup so far"}{p.actualPoints!==null&&p.actualRated<p.lineups?<small>{p.actualRated}/{p.lineups} lineups</small>:null}<small>{projected} projected</small></span></div>;
}

function Side({ label, portfolio: p, loading, own, state, action, played }: { label: string; portfolio: Portfolio; loading?: boolean; own?: boolean; state?: string; action?: ReactNode; played?: boolean }) {
  const unknown = !loading && p.noReward === null;
  return <section className={`pc-side ${own ? "pc-you" : "pc-sofix"}${loading ? " pc-loading" : ""}`} aria-label={`${label} lineup forecast`} aria-busy={loading || undefined}>
    <div className="pc-side-head"><div><h2>{label}</h2><span>{loading ? "Checking your lineups…" : own ? p.lineups ? `${p.lineups} entered · ${state === "saved" ? "saved read" : "on Sorare"}` : state === "early" ? "Sorare has not opened this GW" : state === "unavailable" ? "Entries unavailable" : "No entered lineups" : p.lineups ? `${p.lineups} recommended lineups` : "Plan unavailable"}</span></div>{action ? <div className="pc-action">{action}</div> : null}</div>
    <div className="pc-figures" aria-live="polite">{p.live ? <div className="pc-potential"><span>{played ? "Paid" : "Paid so far"}</span><strong>{loading ? <i className="pc-skeleton"/> : p.paidSoFar === null ? "—" : p.paidSoFar}{!loading && p.paidSoFar !== null ? <small>/{p.lineups}</small> : null}</strong></div> : <div className="pc-potential"><span>Expected paid lineups</span><strong>{loading ? <i className="pc-skeleton"/> : p.expectedPaid === null ? "—" : paid(p.expectedPaid)}{!loading && p.expectedPaid !== null ? <small>/{p.rated}</small> : null}</strong></div>}<div className="pc-risk"><span>Essence or better <small>/ {p.rated<p.lineups?"rated ":""}lineup</small></span><strong>{loading ? <i className="pc-skeleton"/> : p.noReward === null ? "—" : chance(1 - p.noReward)}</strong></div></div>
    <div className={`pc-risk-track${unknown ? " pc-unknown" : ""}`} role="img" aria-label={loading ? `${label}: forecast loading` : p.noReward === null ? `${label}: reward chance unavailable` : `${label}: ${chance(1 - p.noReward)} chance of essence or better per lineup`}><i style={{ transform: `scaleX(${p.noReward === null ? 0 : 1 - p.noReward})` }}/></div>
    <div className="pc-side-foot"><div className="pc-fan" role="group" aria-label={`${label}: best lineup's cards`} data-many={p.cards.length > 5 || undefined}>{loading ? Array.from({ length: 5 }, (_,i) => <span className="pc-fan-skeleton" key={i}/>) : p.cards.map((c, i, all) => <span className="pc-preview-card" key={c.slug} title={c.name} style={{ "--r": `${all.length > 1 ? -8 + 16 * i / (all.length - 1) : 0}deg` } as CSSProperties}><CardArt src={c.pic} name={c.name}/></span>)}</div><Points portfolio={p} loading={loading} played={played}/></div>
    <div className="pc-detail">{p.rated<p.lineups&&p.lineups?<span>{p.rated}/{p.lineups} lineups have reward forecasts</span>:null}{!own&&p.pAny!==undefined?<span><b>{chance(p.pAny)}</b> chance of any plan reward</span>:null}{p.fees?<span>{number(p.fees,0)} essence in entry fees</span>:null}</div>
    <Rewards portfolio={p} own={own} loading={loading}/>
  </section>;
}

export default function PlayComparison({ heading, recommendation, action, early, played, yours, state = "loading" }: PlayComparisonProps & { yours: Portfolio; state?: "loading" | "ready" | "saved" | "unavailable" | "early" }) {
  return <section className="pc-hero" aria-label="Your lineups compared with Sofix">
    <div className="pc-heading">{heading}<span className="pc-context">{early ? "Early projections" : played ? "Recorded before kickoff" : "Before-kickoff forecast"}</span></div>
    <div className="pc-matchup"><Side label="You" portfolio={yours} own loading={state === "loading"} state={state} played={played} action={early ? undefined : <a className="pc-entered-link" href="#entered-lineups-title">Your lineups<span aria-hidden="true">↓</span></a>}/><Side label="Sofix" portfolio={recommendation} action={action} played={played}/></div>
  </section>;
}
