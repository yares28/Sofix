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
  const target = sort === "points" && data.hindsight?.cases === data.pointsCases ? data.hindsight?.average ?? null : null;
  const max = Math.max(target ?? 0, ...rows.map(r => measure(r) ?? 0), 0);
  const unit = sort === "points" ? "avg points / lineup" : sort === "rewards" ? "lineups rewarded" : sort === "cash" ? "USD / lineup" : `${criterion} / lineup`;
  return <>
    <section className="sd-findings" aria-labelledby="sd-finding-h">
      <h2 id="sd-finding-h">{headline}</h2>
      <p className="sd-scope">{data.pointsCases} shared {data.pointsCases === 1 ? "lineup" : "lineups"} from {data.weeks} {data.weeks === 1 ? "GW" : "GWs"}. All {data.active} strategies checked in the same competitions.</p>
      <div className="sd-overview">
        <article aria-label="Most points"><p className="sd-category">Most points</p>{sort !== "points" ? <h3>{points.length ? names(points) : "Not checked yet"}</h3> : null}
          <p className="sd-big">{value(first?.average)}<span>Avg points / lineup</span></p>
          {first?.key !== "xscore" && first?.delta != null ? <p className="sd-proof">{first.delta > 0 ? "+" : ""}{value(first.delta)} points vs xScore · ahead in {first.winsVsBaseline} of {data.pointsCases}</p> : null}
          {first ? <p className="sd-rule">{first.note}</p> : null}
        </article>
        <figure className="sd-hindsight" aria-label="Hindsight benchmark">
          <figcaption>Best found in hindsight</figcaption>
          {data.hindsight?.cases && data.hindsight.average != null ? <>
            <p className="sd-best-score">{value(data.hindsight.average)} <span>avg points</span></p>
            {first?.hindsight?.share != null ? <>
              <div className="sd-target" role="meter" aria-label={`${first.label}: ${value(first.hindsight.share * 100)}% of hindsight best`} aria-valuemin={0} aria-valuemax={Math.max(100, first.hindsight.share * 100)} aria-valuenow={first.hindsight.share * 100}>
                <span style={{ width: `${Math.min(100, first.hindsight.share * 100)}%` }} />
              </div>
              <p className="sd-best-share"><strong>{value(first.hindsight.share * 100)}%</strong> of your cards’ best replay</p>
              <p className="sd-gap">{first.hindsight.gap >= 0 ? `${value(first.hindsight.gap)} points / lineup left to gain` : `${value(-first.hindsight.gap)} points / lineup above the saved replay`}</p>
            </> : null}
            <p className="sd-scope">{data.hindsight.cases} of {data.pointsCases} lineups have a hindsight comparison</p>
          </> : <p className="sd-scope">Hindsight comparison pending</p>}
          <details><summary>What is this target?<span aria-hidden="true">+</span></summary><p>The best lineup found by replaying your saved eligible cards and rules after results. It includes card bonuses and captaincy. It was not known before the games and is not guaranteed to be the mathematical maximum.</p></details>
        </figure>
      </div>
      <div className="sd-reward-leaders">
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
    <section className="sd-comparison sd-chart" aria-labelledby="sd-comparison-h"><h2 id="sd-comparison-h">The overall ranking</h2>
      <p className="sd-scope">Same {data.pointsCases} scored lineups each · {data.rewardCases} prize checks · {data.amountCases} amount checks. Rewards are what the saved picks would have earned.</p>
      <div className="sd-axis"><span>0</span><span>{target != null && target === max ? `Best replay · ${value(target)} avg points` : `${value(max)} ${unit}${target != null ? ` · best replay ${value(target)}` : ""}`}</span></div>
      <ol aria-label="Strategy comparison">
        {rows.map((row, index) => { const rank = index > 0 && measure(row) === measure(rows[index - 1]!) ? rows.findIndex(r => measure(r) === measure(row)) + 1 : index + 1;
          const metric = measure(row);
          return <li key={row.key} className={rank === 1 && metric !== null ? "sd-leading" : undefined}>
            <div className="sd-row-chart">
              <div className="sd-row-head"><div className="sd-identity"><span className="sd-rank">{metric !== null ? rank : "-"}</span><h3>{row.label}</h3></div><strong>{sort === "cash" ? cash(metric) : value(metric)} <small>{unit}</small></strong></div>
              {metric !== null ? <div className="sd-track" role="meter" aria-label={`${row.label}: ${value(metric)} ${unit}`} aria-valuemin={0} aria-valuemax={Math.max(max, 1)} aria-valuenow={metric}><span style={{ width: `${max > 0 ? metric / max * 100 : 0}%` }} />{target != null && max > 0 ? <i aria-hidden="true" style={{ left: `${target / max * 100}%` }} /> : null}</div> : null}
              <p className="sd-row-gap">{row.hindsight?.share != null ? `${value(row.hindsight.share * 100)}% of best replay · ${value(Math.abs(row.hindsight.gap))} points ${row.hindsight.gap < 0 ? "above best replay" : "left to gain"}${data.hindsight?.cases !== data.pointsCases ? ` · ${data.hindsight?.cases} paired lineups` : ""}` : row.delta != null ? `${row.delta > 0 ? "+" : ""}${value(row.delta)} points vs xScore` : "Hindsight comparison pending"}</p>
            </div>
            <div className="sd-row-rewards"><span>Lineups rewarded <b>{data.rewardCases ? `${row.rewardWins} / ${data.rewardCases}` : "-"}</b></span>
              {Object.entries(row.essence).map(([rarity, e]) => <span key={rarity}>Avg {rarityName(rarity)} essence / lineup <b>{value(e.average)}</b></span>)}
              {sort !== "points" ? <span>Avg points / lineup <b>{value(row.average)}</b></span> : null}
              {showCash ? <span>Avg cash / lineup <b>{cash(row.cashAverage)}</b></span> : null}
            </div>
            <details><summary>Why & reward breakdown<span aria-hidden="true">+</span></summary><p>{row.note}</p>{!data.rewardCases ? <p>Prize checks pending</p> : <p>{row.won.essence} essence · {row.won.cash} cash · {row.won.card} card · {row.won.xp} XP only · {row.won.none} nothing. Each lineup counts once by its best prize.</p>}</details>
          </li>;
        })}
      </ol>
      {!showCash && data.amountCases > 0 ? <p className="sd-scope">No cash reached in these comparisons. XP alone does not count as a reward.</p> : null}
    </section>
  </>;
}
