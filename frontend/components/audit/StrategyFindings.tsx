import type { StrategyDecision } from "../../lib/audit";
import type { SourceAverage } from "../../lib/strategyCharts";
import StrategyCharts, { SourceAverages } from "./StrategyCharts";
export { value, rarityName } from "../../lib/strategyCharts";

export default function StrategyFindings({ data, sort = "points", references = [] }: { data?: StrategyDecision; sort?: string; references?: SourceAverage[] }) {
 if (!data?.rows.length) return <><section className="sd-empty" aria-label="Strategy findings"><h2>Best strategies</h2><p>No strategy comparison yet. The next automatic check adds saved results.</p></section>{references.some(r => r.cases) ? <SourceAverages references={references}/> : null}</>;
 return <StrategyCharts data={data} sort={sort} references={references} />;
}
