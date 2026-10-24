"use client";

import { useState, useSyncExternalStore } from "react";
import type { StrategyDecision, StrategyDecisionRow } from "../../lib/audit";
import type { SourceAverage } from "../../lib/strategyCharts";
import { criterion, rankedRows, rankingTiers, rewardKinds, value, rarityName } from "../../lib/strategyCharts";

const ordinal = (n: number) => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
const money = (n: number | null) => n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const percent = (n: number) => `${value(n)}%`;
const shortName = (r: StrategyDecisionRow) => ({ "keeper-defender": "Keeper + defender", favourites: "Favourites", xscore: "xScore", "no-clash": "No clash", ceiling: "Ceiling", scorers: "Scorers", "club-stack": "Club stack", sorare: "Sorare", usual: "Usual", surest: "Sure starters" } as Record<string, string>)[r.key] ?? r.label;
type Select = (key: string) => void;
const subscribe = () => () => {};

function Podium({ data, sort, select }: { data: StrategyDecision; sort: string; select: Select }) {
  const tiers = rankingTiers(data, sort);
  const unit = sort === "rewards" ? "lineups rewarded" : sort === "cash" ? "USD / lineup" : sort.startsWith("essence:") ? `${criterion(sort)} / lineup` : "avg points / lineup";
  return <section className="sc-podium" aria-labelledby="sc-best-h">
    <div className="sc-section-head"><h2 id="sc-best-h">Best strategies</h2><p>{data.pointsCases} comparable lineups · {data.weeks} {data.weeks === 1 ? "GW" : "GWs"} · ranked by {criterion(sort)}</p></div>
    {tiers.length ? <div className={`sc-places sc-places-${tiers.length}`} role="group" aria-label="Best strategies podium">
      {tiers.map(tier => <article key={tier.rank} className={`sc-place sc-place-${tier.rank}`}>
        <div className="sc-medal" aria-hidden="true"><svg viewBox="0 0 60 60"><path d="M17 8 9 19l8 8M43 8l8 11-8 8" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="30" cy="30" r="23" fill="none" stroke="currentColor"/><text x="30" y="38" textAnchor="middle">{tier.rank}</text></svg></div>
        <p className="sc-place-name">{tier.rows.length > 1 ? "Shared " : ""}{ordinal(tier.rank)}</p>
        <div className="sc-podium-names">{tier.rows.length <= 2 ? tier.rows.map(row => <button className="sc-podium-name" key={row.key} onClick={() => select(row.key)}>{row.label}</button>) : <details><summary>{tier.rows.length} strategies tied<span aria-hidden="true">+</span></summary>{tier.rows.map(row => <button key={row.key} className="sc-podium-name" onClick={() => select(row.key)}>{row.label}</button>)}</details>}</div>
        <p className="sc-podium-value">{sort === "cash" ? money(tier.value) : sort === "rewards" ? percent(tier.value) : value(tier.value)}<span>{unit}</span></p>
        <div className="sc-plinth" aria-hidden="true" />
      </article>)}
    </div> : <p className="sc-empty">{sort === "rewards" || sort === "cash" || sort.startsWith("essence:") ? "Prize checks pending" : "Waiting for comparable results"}</p>}
  </section>;
}

function ReferenceRows({ references, x }: { references: SourceAverage[]; x: (n: number) => number }) {
  return <div className="sc-references"><h3>Your entries &amp; whole plans</h3><p className="sc-caption">Different saved coverage · unranked references</p>{references.map(r => <div key={r.key} className="sc-score-row sc-reference" role="img" aria-label={`${r.label}: ${value(r.average)} average points from ${r.cases} checked lineups`}><span className="sc-score-name">{r.label}<small>{r.cases} checked · {value(r.average)} pts</small></span><span className="sc-score-plot" aria-hidden="true"><i className="sc-grid-mid"/>{r.average != null ? <i className="sc-score-dot" style={{ left: `${x(r.average)}%` }}/> : <span className="sc-pending-dot">No saved scores</span>}</span></div>)}</div>;
}

export function SourceAverages({ references }: { references: SourceAverage[] }) {
  const scores = references.map(r => r.average).filter((n): n is number => n != null);
  const low = Math.floor(Math.min(...scores, 0) / 50) * 50;
  const high = Math.max(low + 50, Math.ceil(Math.max(...scores, 0) / 50) * 50);
  return <section className="sc-panel sc-source-only" aria-label="Saved source averages"><div className="sc-score-axis"><span>{value(low)}</span><span>{value((low + high) / 2)}</span><span>{value(high)} pts</span></div><ReferenceRows references={references} x={n => (n - low) / (high - low) * 100}/></section>;
}

function Scores({ data, rows, selected, select, references }: { data: StrategyDecision; rows: StrategyDecisionRow[]; selected: StrategyDecisionRow; select: Select; references: SourceAverage[] }) {
  const best = data.hindsight?.cases ? data.hindsight.average : null;
  const scores = [...references.map(r => r.average), ...rows.flatMap(r => [r.hindsight?.average ?? r.average, r.hindsight ? best : null])].filter((n): n is number => n != null);
  const low = scores.length ? Math.floor(Math.min(...scores) / 50) * 50 : 0;
  const high = Math.max(low + 50, Math.ceil(Math.max(...scores, 0) / 50) * 50);
  const x = (n: number) => (n - low) / (high - low) * 100;
  const paired = selected.hindsight;
  return <section className="sc-scores sc-panel" aria-labelledby="sc-scores-h" data-chart="dumbbell">
    <p className="sc-kicker">01 / The score gap</p><h2 id="sc-scores-h">How close to your best lineup?</h2>
    <p className="sc-caption">{best != null ? `${data.hindsight?.cases} of ${data.pointsCases} lineups · matched average points` : "Hindsight comparison pending · recorded average points"}</p>
    <div className="sc-score-legend"><span><i className="sc-dot-key" />Strategy</span><span><i className="sc-best-key" />Best found in hindsight</span></div>
    <div className="sc-score-axis"><span>{value(low)}</span><span>{value((low + high) / 2)}</span><span>{value(high)} pts</span></div>
    <div className="sc-score-rows" role="list" aria-label="Strategy scores versus hindsight">
      {rows.map(row => { const score = row.hindsight?.average ?? row.average; const target = row.hindsight ? best : null;
        return <div role="listitem" key={row.key}><button className={`sc-score-row${row.key === selected.key ? " selected" : ""}`} aria-pressed={row.key === selected.key} onClick={() => select(row.key)} aria-label={`${row.label}: ${value(score)} average points${target != null ? `; best found ${value(target)}` : "; hindsight pending"}`}>
          <span className="sc-score-name">{row.label}</span><span className="sc-score-plot" aria-hidden="true"><i className="sc-grid-mid" />
            {score != null && target != null ? <i className="sc-gap-line" style={{ left: `${x(Math.min(score, target))}%`, width: `${Math.abs(x(score) - x(target))}%` }} /> : null}
            {target != null ? <i className="sc-score-best" style={{ left: `${x(target)}%` }} /> : null}
            {score != null ? <i className="sc-score-dot" style={{ left: `${x(score)}%` }} /> : <span className="sc-pending-dot">Pending</span>}
          </span>
        </button></div>;
      })}
    </div>
    <p className="sc-gap-answer"><span>{selected.label}</span>{paired ? <><strong>{value(Math.abs(paired.gap))} points {paired.gap < 0 ? "above the saved replay" : "left to gain"}</strong><span>{value(paired.average)} vs {value(best)} per lineup{paired.share != null ? ` · ${percent(paired.share * 100)} of best` : ""}</span></> : <span>Hindsight comparison pending</span>}</p>
    <details className="sc-method"><summary>What is the best lineup?<span aria-hidden="true">+</span></summary><p>The best feasible lineup found by replaying your saved eligible cards and rules after results, including bonuses and captaincy. It is a saved replay, not a guaranteed mathematical maximum. Missing replay evidence stays unknown.</p></details>
    {references.some(r => r.cases) ? <ReferenceRows references={references} x={x}/> : null}
  </section>;
}

function Tradeoffs({ data, selected, select, sort }: { data: StrategyDecision; selected: StrategyDecisionRow; select: Select; sort: string }) {
  const rarity = sort.startsWith("essence:") ? sort.slice(8) : data.rows.some(r => r.essence.limited) ? "limited" : Object.keys(data.essenceLeaders).sort()[0];
  const mode = sort === "cash" ? "cash" : sort === "rewards" || !rarity ? "frequency" : "essence";
  const yValue = (r: StrategyDecisionRow) => mode === "cash" ? r.cashAverage : mode === "frequency" ? data.rewardCases ? r.rewardWins / data.rewardCases * 100 : null : r.essence[rarity!]?.average ?? null;
  const unit = mode === "cash" ? "USD / lineup" : mode === "frequency" ? "% lineups rewarded" : `${rarityName(rarity!)} essence / lineup`;
  const known = data.rows.filter(r => r.average != null && yValue(r) != null);
  const checks = mode === "frequency" ? data.rewardCases : mode === "essence" ? known[0]?.essence[rarity!]?.cases ?? 0 : data.amountCases;
  const min = known.length ? Math.floor(Math.min(...known.map(r => r.average!)) / 50) * 50 : 0;
  const max = Math.max(min + 50, Math.ceil(Math.max(...known.map(r => r.average!), 0) / 50) * 50);
  const highest = Math.max(1, ...known.map(r => yValue(r)!));
  const top = mode === "frequency" ? 100 : highest <= 5 ? Math.ceil(highest * 1.15 * 2) / 2 : Math.ceil(highest * 1.15 / 50) * 50;
  const groups = new Map<string, StrategyDecisionRow[]>();
  known.forEach(r => { const key = `${r.average}:${yValue(r)}`; groups.set(key, [...groups.get(key) ?? [], r]); });
  return <section className="sc-tradeoffs sc-panel" aria-labelledby="sc-tradeoffs-h" data-chart="scatter">
    <p className="sc-kicker">02 / The tradeoff</p><h2 id="sc-tradeoffs-h">Points or rewards?</h2><p className="sc-caption">Upper right earns more of both.</p>
    {known.length ? <><p className="sc-y-label">{unit} · {checks} checks ↑</p><svg className="sc-scatter" viewBox="0 0 430 255" role="group" aria-label={`Strategy scatter plot: average points horizontally, ${unit} vertically`}>
      {[0, .5, 1].map(t => <g key={t}><line x1="55" x2="390" y1={215 - t * 175} y2={215 - t * 175} className="sc-grid"/><text x="42" y={219 - t * 175} textAnchor="end">{value(top * t)}</text></g>)}
      {[0, .5, 1].map(t => <text key={t} x={55 + t * 335} y="243" textAnchor="middle">{value(min + t * (max - min))}</text>)}
      {[...groups].map(([key, group]) => { const r = group.find(r => r.key === selected.key) ?? group[0]!; const cx = 55 + (r.average! - min) / (max - min) * 335; const cy = 215 - yValue(r)! / top * 175; const active = group.some(r => r.key === selected.key);
        return <g key={key} tabIndex={0} role="button" aria-label={`${group.map(r => r.label).join(" and ")}: ${value(r.average)} points, ${value(yValue(r))} ${unit}`} aria-pressed={active} className={`sc-point${active ? " active" : ""}`} onClick={() => select(r.key)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(r.key); } }}>
          <title>{`${group.map(r => r.label).join(" / ")} · ${value(r.average)} points · ${value(yValue(r))} ${unit}`}</title>
          <circle cx={cx} cy={cy} r="29" fill="transparent"/><circle cx={cx} cy={cy} r={group.length > 1 ? 10 : active ? 8 : 5} className="sc-point-mark"/>
          {yValue(r) === Math.max(...known.map(r => yValue(r)!)) ? <text x={cx} y={cy - 19} textAnchor="middle" className="sc-point-label">{group.map(shortName).join(" / ")}</text> : r.average === Math.max(...known.map(r => r.average!)) ? <text x={400} y={cy + 25} textAnchor="end" className="sc-point-label">Most points</text> : null}
          {group.length > 1 ? <text x={cx} y={cy + 4} textAnchor="middle" className="sc-cluster-count">{group.length}</text> : null}
        </g>;
      })}
    </svg><p className="sc-x-label">Average points / lineup →</p><p className="sc-selected-answer"><strong>{selected.label}</strong><span>{value(selected.average)} points · {value(yValue(selected))} {unit}</span></p></> : <p className="sc-empty">Prize checks pending</p>}
  </section>;
}

function Rewards({ data, selected }: { data: StrategyDecision; selected: StrategyDecisionRow }) {
  const pending = Math.max(0, data.pointsCases - data.rewardCases);
  const parts = [...rewardKinds.map(k => ({ ...k, count: selected.won[k.key] })), { key: "pending", label: "Pending", colour: "var(--track)", count: pending }].filter(p => p.count > 0);
  const total = parts.reduce((n, p) => n + p.count, 0);
  let offset = 0;
  return <section className="sc-rewards sc-panel" aria-labelledby="sc-rewards-h" data-chart="donut">
    <p className="sc-kicker">03 / The outcome</p><h2 id="sc-rewards-h">What did it win?</h2><p className="sc-caption">{selected.label} · {data.rewardCases} prize checks</p>
    <div className="sc-donut-layout"><div className="sc-donut-wrap"><svg key={selected.key} viewBox="0 0 200 200" className="sc-donut" role="img" aria-label={`${selected.label} reward mix: ${selected.rewardWins} of ${data.rewardCases} checked lineups rewarded; ${pending} pending`}>
      <circle cx="100" cy="100" r="73" fill="none" stroke="var(--track)" strokeWidth="22"/>
      {parts.map(p => { const share = total ? p.count / total * 100 : 0; const start = offset; offset += share;
        return <circle key={p.key} cx="100" cy="100" r="73" fill="none" pathLength="100" stroke={p.colour} strokeWidth="22" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 100 100)" aria-label={`${p.label}: ${p.count} lineups`}><title>{`${p.label}: ${p.count} lineups`}</title></circle>;
      })}
    </svg><p className="sc-donut-centre">{data.rewardCases ? <><strong>{percent(selected.rewardWins / data.rewardCases * 100)}</strong><span>rewarded</span></> : <span>Pending</span>}</p></div>
    <ul className="sc-reward-key" aria-label="Reward outcomes">{parts.map(p => <li key={p.key}><i style={{ background: p.colour }} /><span>{p.label}</span><b>{p.count}</b></li>)}</ul></div>
    {!data.rewardCases ? <p className="sc-caption">Prize checks pending</p> : <p className="sc-caption">{percent(selected.rewardWins / data.rewardCases * 100)} rewarded · {selected.rewardWins} of {data.rewardCases} checked. XP alone is not a reward.</p>}
    <p className="sc-return">{Object.entries(selected.essence).map(([rarity, e]) => <span key={rarity}><strong>{value(e.average)}</strong> {rarityName(rarity)} essence / lineup{e.cases !== data.amountCases ? ` · ${e.cases} checked` : ""}</span>)}{selected.cashAverage != null && selected.cashAverage > 0 ? <span><strong>{money(selected.cashAverage)}</strong> cash / lineup</span> : null}</p>
  </section>;
}

export default function StrategyCharts({ data, sort, references = [] }: { data: StrategyDecision; sort: string; references?: SourceAverage[] }) {
  const rows = rankedRows(data, sort);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [selectedKey, select] = useState<string | null>(null);
  const selected = rows.find(r => r.key === selectedKey) ?? rows[0]!;
  return <div className="sc-dashboard">
    <Podium data={data} sort={sort} select={select} />
    <div className="sc-inspect"><div><label htmlFor="sc-strategy">Inspect strategy</label><select id="sc-strategy" name="strategy" autoComplete="off" disabled={!ready} value={selected.key} onChange={e => select(e.target.value)}>{rows.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></div><p aria-live="polite"><span className="visually-hidden">{selected.label}. </span>{selected.note}{selected.delta != null && selected.key !== "xscore" ? <span>{selected.delta >= 0 ? "+" : ""}{value(selected.delta)} points vs xScore · ahead in {selected.winsVsBaseline} of {data.pointsCases}</span> : <span>{selected.key === "xscore" ? "xScore baseline" : "Baseline comparison pending"}</span>}</p></div>
    <div className="sc-charts"><Scores data={data} rows={rows} selected={selected} select={select} references={references}/><div className="sc-right"><Tradeoffs data={data} selected={selected} select={select} sort={sort}/><Rewards data={data} selected={selected}/></div></div>
  </div>;
}
