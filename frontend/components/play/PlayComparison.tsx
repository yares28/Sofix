import type { ReactNode } from "react";
import type { Portfolio } from "../../lib/playPortfolio";
import CardArt from "../cards/CardArt";

export type PlayComparisonProps = { heading: ReactNode; recommendation: Portfolio; action?: ReactNode; early?: boolean; played?: boolean };
const number = (n: number, digits = 1) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(n);
const chance = (n: number) => n > 0 && n < .005 ? "<1%" : n < 1 && n > .995 ? ">99%" : `${Math.round(n * 100)}%`;
const paid = (n: number) => n > 0 && n < .05 ? "<0.1" : number(n);
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

function Side({ label, portfolio: p, loading, own, state, action }: { label: string; portfolio: Portfolio; loading?: boolean; own?: boolean; state?: string; action?: ReactNode }) {
  const unknown = !loading && p.noReward === null;
  return <section className={`pc-side ${own ? "pc-you" : "pc-sofix"}${loading ? " pc-loading" : ""}`} aria-label={`${label} lineup forecast`} aria-busy={loading || undefined}>
    <div className="pc-side-head"><div><h2>{label}</h2><span>{loading ? "Checking your lineups…" : own ? p.lineups ? `${p.lineups} entered · ${state === "saved" ? "saved read" : "on Sorare"}` : state === "early" ? "Sorare has not opened this GW" : state === "unavailable" ? "Entries unavailable" : "No entered lineups" : p.lineups ? `${p.lineups} recommended lineups` : "Plan unavailable"}</span></div>{action ? <div className="pc-action">{action}</div> : null}</div>
    <div className="pc-figures" aria-live="polite"><div className="pc-potential"><span>Expected paid lineups</span><strong>{loading ? <i className="pc-skeleton"/> : p.expectedPaid === null ? "—" : paid(p.expectedPaid)}{!loading && p.expectedPaid !== null ? <small>/{p.lineups}</small> : null}</strong></div><div className="pc-risk"><span>No-reward risk <small>/ lineup</small></span><strong>{loading ? <i className="pc-skeleton"/> : p.noReward === null ? "—" : chance(p.noReward)}</strong></div></div>
    <div className={`pc-risk-track${unknown ? " pc-unknown" : ""}`} role="img" aria-label={loading ? `${label}: forecast loading` : p.noReward === null ? `${label}: reward risk unavailable` : `${label}: average paid reward chance ${chance(1 - p.noReward)}, no-reward risk ${chance(p.noReward)}`}><i style={{ transform: `scaleX(${p.noReward === null ? 0 : 1 - p.noReward})` }}/></div>
    <div className="pc-side-foot"><div className="pc-fan" aria-label={`${label} card preview`}>{loading ? Array.from({ length: 5 }, (_,i) => <span className="pc-fan-skeleton" key={i}/>) : p.cards.map(c => <span className="pc-preview-card" key={c.slug} title={c.name}><CardArt src={c.pic} name={c.name}/></span>)}</div><div className="pc-points"><strong>{loading ? <i className="pc-skeleton"/> : p.averagePoints === null ? "—" : number(p.averagePoints,0)}</strong><span>projected pts / lineup{p.estimated ? <small>Estimated from this GW</small> : null}</span></div></div>
    <div className="pc-detail">{loading ? <span className="pc-skeleton pc-detail-skeleton"/> : unknown && p.lineups ? <span>{p.rated}/{p.lineups} lineups have reward forecasts</span> : own ? <span>{p.lineups ? "Your entered starters, captains & bench" : "Your entries appear here for the selected GW"}</span> : <>{p.pAny !== undefined ? <span><b>{chance(p.pAny)}</b> chance of any plan reward</span> : null}{p.essence !== undefined ? <span>Expected <b>{number(p.essence,0)} essence</b>{p.cash !== undefined && p.cash > 0 ? <> · <b>{money(p.cash)} cash</b></> : null}</span> : null}{p.fees ? <span>{number(p.fees,0)} essence in entry fees</span> : null}</>}</div>
  </section>;
}

export default function PlayComparison({ heading, recommendation, action, early, played, yours, state = "loading" }: PlayComparisonProps & { yours: Portfolio; state?: "loading" | "ready" | "saved" | "unavailable" | "early" }) {
  const diff = yours.expectedPaid !== null && recommendation.expectedPaid !== null ? recommendation.expectedPaid - yours.expectedPaid : null;
  return <section className="pc-hero" aria-label="Your lineups compared with Sofix">
    <div className="pc-heading">{heading}<span className="pc-context">{early ? "Early projections" : played ? "Recorded before kickoff" : "Before-kickoff forecast"}</span></div>
    <div className="pc-matchup"><Side label="You" portfolio={yours} own loading={state === "loading"} state={state} action={early ? undefined : <a className="pc-entered-link" href="#entered-lineups-title">Your lineups<span aria-hidden="true">↓</span></a>}/><Side label="Sofix" portfolio={recommendation} action={action}/></div>
    <div className="pc-verdict">{diff !== null ? <p>{Math.abs(diff) < .05 ? <>Both plans expect a similar number of paid lineups.</> : <><strong>+{number(Math.abs(diff))}</strong> expected paid lineups with {diff > 0 ? "Sofix" : "your entries"}</>}</p> : <p>{state === "loading" ? "Loading your selected-GW comparison…" : early ? "This GW is not open for entry yet." : "The comparison appears when your entered lineups have forecasts."}</p>}<details><summary>How risk is measured</summary><p>Paid means cash, essence or a card; XP is separate. Expected paid lineups add each lineup&rsquo;s reward chance. Risk is the average chance that a lineup receives no paid reward. It is not the chance the entire plan wins nothing. Projections use the selected GW&rsquo;s saved forecasts; estimated custom lineups retain that label.</p></details></div>
  </section>;
}
