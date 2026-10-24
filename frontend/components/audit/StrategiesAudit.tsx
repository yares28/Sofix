import type { ReactNode } from "react";
import { NO_TALLY, percent, type StrategiesAudit as Strategies, type StrategyTally } from "../../lib/audit";
import { real, share } from "../../lib/lineupsAudit";
import WeekComparison from "./WeekComparison";
import StrategyWeekPicker from "./StrategyWeekPicker";

const average = (t: StrategyTally): number | null => t.scored ? t.points / t.scored : null;
const points = (value: number | null) => value === null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const count = (n: number, name: string) => `${n.toLocaleString("en-GB")} ${name}${n === 1 ? "" : "s"}`;
const waiting = (t: StrategyTally) => t.pending ?? Math.max(0, t.lineups - t.scored - (t.unavailable ?? 0));

function Coverage({ tally: t }: { tally: StrategyTally }) {
  return <span className="st-coverage">{count(t.scored, "checked lineup")}
    {waiting(t) ? <span> · {waiting(t)} pending</span> : null}
    {t.unavailable ? <span> · {t.unavailable} unavailable</span> : null}
  </span>;
}

function Sources({ you, sofix, sorare }: { you: StrategyTally | null; sofix: StrategyTally | null; sorare?: StrategyTally | null }) {
  const sources: [string, StrategyTally | null | undefined][] = [["You", you], ["Sofix plan 1", sofix], ["Sorare plan 1", sorare]];
  return <div className="st-sources">{sources.map(([name, value]) => {
    const t = value ?? NO_TALLY;
    return <article key={name} aria-label={name}><h3>{name}</h3><p className="st-number">{points(average(t))}</p><Coverage tally={t} />
      {!t.lineups ? <span className="st-muted">No saved lineups</span> : null}
    </article>;
  })}</div>;
}

function Ranking({ rows, detail = false }: { rows: (StrategyTally & { key: string; label: string; note?: string })[]; detail?: boolean }) {
  const ranked = [...rows].sort((a, b) => (average(b) ?? -1) - (average(a) ?? -1));
  const max = Math.max(1, ...ranked.map(row => average(row) ?? 0));
  return <ol className="st-ranking" aria-label={detail ? "Season strategies" : "Weekly strategy averages"}>
    {ranked.map(row => <li key={row.key}>
      <div className="st-rank-name"><strong>{row.label}</strong><Coverage tally={row} /></div>
      <span className="st-bar" aria-hidden="true"><i style={{ transform: `scaleX(${(average(row) ?? 0) / max})` }} /></span>
      <b className="st-rank-points">{points(average(row))}</b>
      {detail ? <details className="st-detail"><summary>Prize & score detail<span aria-hidden="true">+</span></summary>
        {row.note ? <p>{row.note}</p> : null}<dl>
          <div><dt>Of the best in hindsight</dt><dd>{percent(share(row.pointsVs, row.best))} <small>{count(row.against, "comparison")}</small></dd></div>
          <div><dt>Essence or better</dt><dd>{percent(share(real(row.won), row.judged))} <small>{count(row.judged, "judged lineup")}</small></dd></div>
          <div><dt>Nothing won</dt><dd>{percent(share(row.won.none, row.judged))}</dd></div>
          <div><dt>Above its expected range</dt><dd>{row.verdicts.lucky} <small>{count(Object.values(row.verdicts).reduce((n, v) => n + v, 0), "saved range")}</small></dd></div>
        </dl>{row.rewardPending ? <p>{count(row.rewardPending, "prize check")} pending</p> : null}
      </details> : null}
    </li>)}
  </ol>;
}

export default function StrategiesAudit({ strategies: data, pics, updated, selected }: { strategies: Strategies; pics: Record<string, string>; updated?: ReactNode; selected?: string }) {
  const plans = [
    { key: "you", label: "You", ...data.you }, { key: "sofix-plan", label: "Sofix plan 1", ...data.sofix },
    { key: "sorare-plan", label: "Sorare plan 1", ...(data.sorare ?? NO_TALLY) },
  ];
  const week = data.weeks.find(w => w.slug === selected) ?? data.weeks[0];
  const weekly = data.strategies.map(row => ({ key: row.key, label: row.label, ...(week?.strategies[row.key] ?? NO_TALLY) }));
  return <div className="st-board">
    <header className="st-header"><div><p className="ws-eyebrow">AUDIT / STRATEGIES</p><h1>Strategies</h1></div><div className="ws-updated">{updated}</div></header>
    <section className="st-season" aria-labelledby="st-season-h">
      <div className="st-section-head"><h2 id="st-season-h">Season so far</h2><span>{count(data.weeks.length, "saved GW")}</span></div>
      <p className="st-caption">Average points per checked lineup · each source’s saved weeks</p>
      <Sources you={data.you} sofix={data.sofix} sorare={data.sorare} />
      <details className="st-plan-detail"><summary>Plan & entry detail<span aria-hidden="true">+</span></summary><Ranking rows={plans} detail /></details>
    </section>
    <section className="st-week" aria-labelledby="st-week-h">
      <div className="st-section-head"><h2 id="st-week-h">Week by week</h2>{week ? <StrategyWeekPicker weeks={data.weeks} selected={week.slug} /> : null}</div>
      {week ? <><p className="st-caption">GW{week.number} · {week.final ? "Checked" : "Still being checked"} · average points per checked lineup</p>
        <Sources you={week.you} sofix={week.sofix} sorare={week.sorare} />
        {Object.keys(week.strategies).length ? <Ranking rows={weekly} /> : <p className="st-empty">No strategy lineups saved for this GW.</p>}
        <details className="st-lineups"><summary>Lineups & cards<span aria-hidden="true">+</span></summary><WeekComparison boards={week.boards} pics={pics} /></details>
      </> : <p className="st-empty">No completed gameweeks saved yet.</p>}
    </section>
    <section className="st-season-strategies" aria-labelledby="st-strategies-h">
      <div className="st-section-head"><h2 id="st-strategies-h">Strategies over the season</h2><span>Average points per checked lineup</span></div>
      <Ranking rows={data.strategies} detail />
      <details className="st-method"><summary>How the comparison works</summary><p>Points are divided by checked lineups, including genuine zero scores. Pending results and unavailable historical rules stay outside the average. Each source can cover different competitions and weeks; counts are shown alongside every average.</p><p>Sofix plan 1 and Sorare plan 1 are the whole plans saved before the lock. “Sorare’s projection” is a separate strategy, built competition by competition. Each uses its own saved choices, games, bonuses and substitution rules.</p><p>Scheduled checks update saved results automatically. Scores remain provisional through the review window; missing results never become zero or stop being checked because they are old.</p></details>
    </section>
  </div>;
}
