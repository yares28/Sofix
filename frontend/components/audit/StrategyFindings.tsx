import type { StrategyDecision, StrategyDecisionRow } from "../../lib/audit";

export const value = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
export const rarityName = (rarity: string) => ({ limited: "Limited", rare: "Rare", super_rare: "Super Rare", unique: "Unique", common: "Common" } as Record<string, string>)[rarity] ?? rarity;
const names = (rows: StrategyDecisionRow[]) => rows.map(r => r.label).join(" & ");
const cash = (n: number | null) => n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const leaders = (d: StrategyDecision, keys: string[]) => keys.map(key => d.rows.find(r => r.key === key)).filter((r): r is StrategyDecisionRow => !!r);

export default function StrategyFindings({ data, sort = "points" }: { data?: StrategyDecision; sort?: string }) {
  if (!data?.rows.length) return <section className="sd-empty" aria-label="Strategy findings"><h2>No strategy comparison yet</h2><p>The next automatic check will add the saved strategy results here.</p></section>;
  const points = leaders(data, data.pointLeaders);
  const rewarding = leaders(data, data.rewardLeaders);
  const essence = Object.entries(data.essenceLeaders).filter(([, keys]) => keys.length);
  const first = points[0];
  const cashWinners = leaders(data, data.cashLeaders);
  const showCash = data.rows.some(r => (r.cashAverage ?? 0) > 0);
  const criterion = sort === "rewards" ? "reward frequency" : sort === "cash" ? "cash" : sort.startsWith("essence:") ? `${rarityName(sort.slice(8))} essence` : "points";
  const chosen = leaders(data, sort === "rewards" ? data.rewardLeaders : sort === "cash" ? data.cashLeaders : sort.startsWith("essence:") ? data.essenceLeaders[sort.slice(8)] ?? [] : data.pointLeaders);
  const headline = data.active < 2 ? "Only one strategy has a saved lineup" : !data.pointsCases ? "Waiting for comparable results" : chosen.length === 1 ? `${chosen[0]!.label} leads on ${criterion}` : chosen.length > 1 ? `A shared lead on ${criterion}` : `No checked ${criterion} leader yet`;
  const measure = (r: StrategyDecisionRow): number | null => sort === "rewards" ? data.rewardCases ? r.rewardWins : null : sort === "cash" ? r.cashAverage : sort.startsWith("essence:") ? r.essence[sort.slice(8)]?.average ?? null : r.average;
  const rows = [...data.rows].sort((a, b) => (measure(b) ?? -1) - (measure(a) ?? -1));
  return <>
    <section className="sd-findings" aria-labelledby="sd-finding-h">
      <h2 id="sd-finding-h">{headline}</h2>
      <p className="sd-scope">{data.pointsCases} shared {data.pointsCases === 1 ? "lineup" : "lineups"} from {data.weeks} {data.weeks === 1 ? "GW" : "GWs"}. All {data.active} strategies checked in the same competitions.</p>
      <div className="sd-winners">
        <article aria-label="Most points"><p className="sd-category">Most points</p><h3>{points.length ? names(points) : "Not checked yet"}</h3>
          <p className="sd-big">{value(first?.average)}<span>avg points / lineup</span></p>
          {first?.key !== "xscore" && first?.delta != null ? <p className="sd-proof">{first.delta > 0 ? "+" : ""}{value(first.delta)} points vs xScore · ahead in {first.winsVsBaseline} of {data.pointsCases}</p> : null}
          {first ? <p className="sd-rule">{first.note}</p> : null}
        </article>
        {essence.map(([rarity, keys]) => { const winners = leaders(data, keys); const row = winners[0]!;
          return <article key={rarity} aria-label={`Most ${rarityName(rarity)} essence`}><p className="sd-category">Most {rarityName(rarity)} essence</p><h3>{names(winners)}</h3>
            <p className="sd-big">{value(row.essence[rarity]?.average)}<span>{rarityName(rarity)} essence / lineup</span></p>
            <p className="sd-proof">{row.rewardWins} of {data.rewardCases} lineups reached essence or better{winners.length > 1 ? " · tied" : ""}</p>
            <p className="sd-rule">{row.note}</p>
          </article>;
        })}
        {cashWinners.length ? <article aria-label="Most cash"><p className="sd-category">Most cash</p><h3>{names(cashWinners)}</h3><p className="sd-big">{cash(cashWinners[0]!.cashAverage)}<span>USD / lineup</span></p><p className="sd-rule">{cashWinners[0]!.note}</p></article> : null}
        <article aria-label="Rewards most often"><p className="sd-category">Rewards most often</p><h3>{rewarding.length ? (rewarding[0]?.rewardWins ?? 0) === 0 ? "No strategy reached a reward" : rewarding.length === data.active && data.active > 1 ? "All strategies are tied" : names(rewarding) : "Prize checks pending"}</h3>
          <p className="sd-big">{data.rewardCases ? `${rewarding[0]?.rewardWins ?? 0} / ${data.rewardCases}` : "—"}<span>lineups reached essence, cash or a card</span></p>
          {rewarding[0] ? <p className="sd-rule">{rewarding[0].note}</p> : null}
        </article>
      </div>
      {first && essence.length ? <p className="sd-takeaway">{essence.some(([, keys]) => !keys.includes(first.key)) ? "More points did not mean more essence. " : "The points leader also led on essence. "}
        {essence.map(([rarity, keys]) => { const row = leaders(data, keys)[0]!; const other = first.essence[rarity]?.average;
          return <span key={rarity}>{names(leaders(data, keys))} averaged {value(row.essence[rarity]?.average)} {rarityName(rarity)} essence{!keys.includes(first.key) && other != null ? `, compared with ${value(other)} for ${first.label}` : ""}. </span>;
        })}
      </p> : null}
      {!data.rewardCases ? <p className="sd-scope">Reward cutoffs are still pending; no reward winner is claimed.</p> : !essence.length ? <p className="sd-scope">{data.amountCases ? "No essence was reached in these comparisons." : "Reward amounts were not recorded for these comparisons."}</p> : null}
    </section>
    <section className="sd-comparison" aria-labelledby="sd-comparison-h"><h2 id="sd-comparison-h">Compare the strategies</h2>
      <p className="sd-scope">Same {data.pointsCases} scored lineups each · {data.rewardCases} prize checks · {data.amountCases} amount checks. Model rewards are what the saved picks would have earned.</p>
      <ol aria-label="Strategy comparison">
        {rows.map((row, index) => { const rank = index > 0 && measure(row) === measure(rows[index - 1]!) ? rows.findIndex(r => measure(r) === measure(row)) + 1 : index + 1;
          return <li key={row.key}>
            <div className="sd-identity"><span className="sd-rank">{measure(row) !== null ? rank : "—"}</span><div><h3>{row.label}</h3><p>{row.note}</p></div></div>
            <dl><div><dt>Avg points / lineup</dt><dd>{value(row.average)}{row.delta != null && row.key !== "xscore" ? <small>{row.delta > 0 ? "+" : ""}{value(row.delta)} vs xScore</small> : <small>{row.key === "xscore" ? "xScore baseline" : "Baseline unavailable"}</small>}</dd></div>
              <div><dt>Lineups rewarded</dt><dd>{data.rewardCases ? `${row.rewardWins} / ${data.rewardCases}` : "—"}<small>{data.rewardCases ? `${value(row.rewardWins / data.rewardCases * 100)}% · essence or better` : "Prize checks pending"}</small></dd></div>
              {Object.entries(row.essence).map(([rarity, e]) => <div key={rarity}><dt>Avg {rarityName(rarity)} essence / lineup</dt><dd>{value(e.average)}<small>{e.cases} amount {e.cases === 1 ? "check" : "checks"}</small></dd></div>)}
              {showCash ? <div><dt>Avg cash / lineup</dt><dd>{cash(row.cashAverage)}<small>USD · {data.amountCases} amount checks</small></dd></div> : null}
            </dl>
            <details><summary>Reward breakdown</summary>{!data.rewardCases ? <p>Prize checks pending</p> : <p>{row.won.essence} essence · {row.won.cash} cash · {row.won.card} card · {row.won.xp} XP only · {row.won.none} nothing. Each lineup counts once by its best prize.</p>}</details>
          </li>;
        })}
      </ol>
      {!showCash && data.amountCases > 0 ? <p className="sd-scope">No cash reached in these comparisons. XP alone does not count as a reward.</p> : null}
    </section>
  </>;
}
