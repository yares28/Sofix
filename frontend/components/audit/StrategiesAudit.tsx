import type { ReactNode } from "react";
import type { StrategiesAudit as Strategies } from "../../lib/audit";
import WeekComparison from "./WeekComparison";
import StrategyWeekPicker from "./StrategyWeekPicker";
import StrategyFindings, { rarityName } from "./StrategyFindings";

export default function StrategiesAudit({ strategies: data, pics, updated, selected, sort = "points" }: { strategies: Strategies; pics: Record<string, string>; updated?: ReactNode; selected?: string; sort?: string }) {
 const week = data.weeks.find(w => w.slug === selected) ?? data.weeks[0];
 const period = data.weeks.some(w => w.slug === selected) ? selected! : "all";
 const decision = period === "all" ? data.decision : week?.decision;
 const scope = period === "all" ? data : week;
 const references = ([["you", "You"], ["sofix", "Sofix plan 1"], ["sorare", "Sorare plan 1"]] as const).map(([key, label]) => {
   const tally = scope?.[key];
   return { key, label, average: tally?.scored ? tally.points / tally.scored : null, cases: tally?.scored ?? 0 };
 });
 const options: [string, string][] = [["points", "Average points"], ["rewards", "Reward frequency"], ...Object.keys(decision?.essenceLeaders ?? {}).map(r => [`essence:${r}`, `Average ${rarityName(r)} essence`] as [string, string])];
 if (decision?.rows.some(r => (r.cashAverage ?? 0) > 0)) options.push(["cash", "Average cash"]);
 const rankedBy = options.some(([key]) => key === sort) ? sort : "points";
 return <div className="st-board sc-page">
   <header className="st-header"><div><p className="ws-eyebrow">AUDIT / STRATEGIES</p><h1>Strategies</h1></div><div className="ws-updated">{updated}</div></header>
   <StrategyWeekPicker weeks={data.weeks} selected={period} sort={rankedBy} options={options}/>
   <StrategyFindings key={`${period}:${rankedBy}`} data={decision} sort={rankedBy} references={references}/>
   {week ? <section className="sd-evidence" aria-labelledby="sd-evidence-h"><h2 id="sd-evidence-h">Lineup evidence</h2><details className="st-lineups"><summary>Lineups & cards · GW{week.number}<span aria-hidden="true">+</span></summary><WeekComparison boards={week.boards} pics={pics}/></details></section> : null}
   <details className="sc-method"><summary>How the comparison works<span aria-hidden="true">+</span></summary><p>The podium compares the same competition/GW lineups for every recorded strategy. It ranks the selected criterion and keeps ties. Pending results stay unknown; genuine zero scores count from the first case.</p><p>Rewards show what the saved picks would have earned against actual saved cutoffs. Cash and each essence rarity remain separate. The saved lineups keep your entries, Sofix plan 1 and Sorare plan 1 alongside the individual strategies.</p></details>
 </div>;
}
