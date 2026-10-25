import { missionOutcomeSummary, settledMission, type MissionOutcome, type OutcomeKind } from "../../lib/missionOutcomes";
import { RARITY_NAME } from "../../lib/missions";
import CardArt from "../cards/CardArt";

const num = (n: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(n);
const date = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const KINDS: [OutcomeKind, string][] = [["miss", "Missed"], ["essence", "Essence hits"], ["xp", "XP hits"], ["clues", "Clue hits"], ["unknown", "Other hits"]];

function Race({ rows }: { rows: MissionOutcome[] }) {
  const paired = rows.filter(r => !r.reconstructed && settledMission(r.you) && settledMission(r.sofix));
  const dates = [...new Set(paired.map(r => r.day))].sort();
  const points = [{ day: dates[0] ?? "", you: 0, sofix: 0 }];
  for (const day of dates) {
    const same = paired.filter(r => r.day === day), before = points.at(-1)!;
    points.push({ day, you: before.you + same.filter(r => r.you.some(p => p.state === "did")).length, sofix: before.sofix + same.filter(r => r.sofix.some(p => p.state === "did")).length });
  }
  const top = Math.max(1, ...points.map(p => Math.max(p.you, p.sofix)));
  const line = (who: "you" | "sofix") => points.map((p, i) => `${32 + (i ? (Date.parse(p.day) - Date.parse(dates[0]!) + 86400_000) / Math.max(86400_000, Date.parse(dates.at(-1)!) - Date.parse(dates[0]!) + 86400_000) : 0) * 516},${146 - p[who] / top * 116}`).join(" ");
  return <figure className="mo-race ma-chart" aria-label="Missions won over time on shared missions">
    <figcaption><h3>The same missions, over time</h3><span>{paired.length} shared checked missions</span></figcaption>
    {paired.length ? <><svg viewBox="0 0 600 180" role="img" aria-label={`Cumulative missions with a hit: you ${points.at(-1)!.you}, Sofix ${points.at(-1)!.sofix}`}>
      {[...new Set([0, Math.ceil(top / 2), top])].map(n => <g key={n}><line x1="32" x2="548" y1={146 - n / top * 116} y2={146 - n / top * 116} className="mo-grid"/><text x="22" y={150 - n / top * 116} textAnchor="end">{num(n)}</text></g>)}
      <polyline className="mo-line mo-you" points={line("you")}/><polyline className="mo-line mo-sofix" points={line("sofix")}/>
      {(["you", "sofix"] as const).map(who => <circle key={who} className={`mo-dot mo-${who}`} cx="548" cy={146 - points.at(-1)![who] / top * 116} r="5"/>)}
      <text x="32" y="174">{date(dates[0]!)}</text><text x="548" y="174" textAnchor="end">{date(dates.at(-1)!)}</text>
    </svg><div className="mo-line-key"><span className="mo-you">You <b>{points.at(-1)!.you}</b></span><span className="mo-sofix">Sofix <b>{points.at(-1)!.sofix}</b></span></div></> : <p className="mo-empty">The race starts when both sides have checked picks in the same mission. Their independent results appear below.</p>}
  </figure>;
}

export default function MissionOutcomeCharts({ rows, target, evidencePage, choose }: { rows: MissionOutcome[]; target: string; evidencePage: number; choose: (values: Record<string,string>) => void }) {
  const all = missionOutcomeSummary(rows);
  const selected = target && rows.some(r => r.target === target) ? rows.filter(r => r.target === target) : rows;
  const s = missionOutcomeSummary(selected);
  const diff = all.paired.you - all.paired.sofix;
  const verdict = !all.paired.missions ? "Your mission results" : !diff ? "You and Sofix are level" : `${diff > 0 ? "You" : "Sofix"} won ${Math.abs(diff)} more ${Math.abs(diff) === 1 ? "mission" : "missions"}`;
  const evidence = selected.filter(r => r.you.length || r.sofix.length).sort((a, b) => Number([...b.you, ...b.sofix].some(p => p.state === "did" || p.state === "didnt")) - Number([...a.you, ...a.sofix].some(p => p.state === "did" || p.state === "didnt")));
  const pages = Math.max(1, Math.ceil(evidence.length / 12)), page = Math.min(pages, Math.max(1, evidencePage));
  return <div className="mo-outcomes">
    <header className="mo-head"><div><p className="au-label">Missions with at least one successful pick</p><h2 aria-live="polite">{verdict}</h2><p>{all.paired.missions ? `On the same ${all.paired.missions} checked missions` : "Each side counts as soon as its selected players are checked."}</p></div><div className="mo-scoreboard">
      {([ ["you", "You"], ["sofix", "Sofix"] ] as const).map(([who,label]) => <div key={who} className={`mo-score mo-${who}`}><span>{label}</span><strong>{all.paired.missions ? all.paired[who] : all[who].missions ? all[who].hits : "—"}<small>/{all.paired.missions || all[who].missions}</small></strong><span>{all.paired.missions ? "shared missions hit" : "missions hit"}</span></div>)}
    </div></header>
    <div className="mo-charts"><Race rows={rows}/><figure className="mo-targets" aria-label="Missions hit by action"><figcaption><h3>What each side got right</h3><span>You <i/> Sofix</span></figcaption>
      {all.targets.length ? all.targets.filter(t => t.you.missions || t.sofix.missions).map(t => <button key={t.target} type="button" className="mo-target" aria-pressed={target === t.target} onClick={() => choose({ mt: target === t.target ? "all" : t.target, me: "1" })} aria-label={`${t.target}: you hit ${t.you.hits} of ${t.you.missions} checked missions; Sofix hit ${t.sofix.hits} of ${t.sofix.missions} checked missions`}>
        <span className="mo-target-side mo-you"><b>{t.you.missions ? `${t.you.hits}/${t.you.missions}` : "—"}</b><span><i style={{ transform: `scaleX(${t.you.missions ? t.you.hits / t.you.missions : 0})` }}/></span></span>
        <span className="mo-target-name">{t.target}</span>
        <span className="mo-target-side mo-sofix"><span><i style={{ transform: `scaleX(${t.sofix.missions ? t.sofix.hits / t.sofix.missions : 0})` }}/></span><b>{t.sofix.missions ? `${t.sofix.hits}/${t.sofix.missions}` : "—"}</b></span>
      </button>) : <p className="mo-empty">No selections are saved yet.</p>}
      <p className="mo-caption">Hits / checked missions. Select an action to see its picks.</p>
    </figure></div>
    <section className="mo-distribution" aria-labelledby="mo-outcome-h"><div className="mo-section-heading"><h3 id="mo-outcome-h">{target ? `${target} · pick outcomes` : "Every checked pick"}</h3>{target ? <button type="button" className="mo-clear" onClick={() => choose({ mt: "all", me: "1" })}>All actions</button> : <span>One segment per result</span>}</div>
      {([ ["you", "You"], ["sofix", "Sofix"] ] as const).map(([who,label]) => {
        const side = s[who], count = side.picks.hit + side.picks.miss;
        return <div className={`mo-storage mo-${who}`} key={who}><div className="mo-storage-head"><h4>{label}</h4><p><strong>{side.picks.hit}</strong> hits <span>·</span> {side.picks.miss} missed</p></div>
          <div className="mo-storage-track" role="img" aria-label={`${label} pick outcomes: ${KINDS.map(([kind, name]) => `${side.segments[kind]} ${name.toLowerCase()}`).join(", ")}`}>
            {count ? KINDS.filter(([kind]) => side.segments[kind]).map(([kind,name]) => <span className={`mo-segment mo-${kind}`} key={kind} style={{ flex: side.segments[kind] }} title={`${side.segments[kind]} ${name.toLowerCase()}`}>{side.segments[kind] / count > .1 ? side.segments[kind] : ""}</span>) : <span className="mo-no-results">No checked picks</span>}
          </div><ul className="mo-storage-key">{KINDS.filter(([kind]) => kind !== "unknown" || side.segments[kind]).map(([kind,name]) => <li key={kind}><i className={`mo-${kind}`}/>{name}<b>{side.segments[kind]}</b></li>)}</ul>
          <p className="mo-caption"><b>{side.hits}/{side.missions} missions hit</b> · {side.picks.pending} picks waiting · {side.picks.void} void · {side.unknown} missions without selections</p>
          {side.rewards.some(r => r.amount > 0) ? <div className="mo-reward-totals">{side.rewards.filter(r => r.amount > 0).map(r => <span key={`${r.rarity}:${r.unit}`}><b>{num(r.amount)}</b> {r.unit}<small>{RARITY_NAME[r.rarity] ?? r.rarity}</small></span>)}</div> : null}
        </div>;
      })}<p className="mo-caption">Reward equivalents follow saved mission terms; they are not confirmed receipts. A hit with unknown terms stays “Other hits”. Pending and void picks are outside the bars.</p>
    </section>
    <section className="mo-evidence" aria-labelledby="mo-evidence-h"><div className="mo-section-heading"><h3 id="mo-evidence-h">{target ? `The ${target.toLowerCase()} picks` : "Which picks got it right"}</h3><span>{evidence.length} missions with selections</span></div>
      <ol>{evidence.slice((page - 1) * 12, page * 12).map(r => <li key={r.id}><div className="mo-evidence-title"><span>{date(r.day)} · {RARITY_NAME[r.rarity] ?? r.rarity}</span><h4>{r.mission}</h4>{r.reconstructed ? <small>Reconstructed picks</small> : r.corrected ? <small>Corrected by you</small> : null}</div><div className="mo-pick-sides">{([ ["you", "You"], ["sofix", "Sofix"] ] as const).map(([who,label]) => <div key={who}><span className={`mo-pick-label mo-${who}`}>{label}</span>{r[who].length ? <ul aria-label={`${label} · ${r.mission} · ${r.day}`}>{r[who].map((p,i) => <li key={`${p.slug}:${i}`} className={`mo-pick mo-pick-${p.state}`}><div className="mo-pick-art"><CardArt src={p.pic} name={p.name}/><span aria-hidden="true">{p.state === "did" ? "✓" : p.state === "didnt" ? "×" : p.state === "void" ? "—" : "…"}</span></div><span>{p.name}</span><small>{p.state === "did" ? "Hit" : p.state === "didnt" ? "Missed" : p.state === "void" ? "Void" : "Waiting"}</small></li>)}</ul> : <p className="mo-caption">No selections saved</p>}</div>)}</div></li>)}</ol>
      {!evidence.length ? <p className="mo-empty">Saved picks and their actual results appear here automatically.</p> : null}
      {pages > 1 ? <nav className="ma-pagination" aria-label="Mission outcome pages"><button type="button" disabled={page <= 1} onClick={() => choose({ me: String(page - 1) })}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => choose({ me: String(page + 1) })}>Next</button></nav> : null}
    </section>
    {all.reconstructed ? <p className="mo-caption">{all.reconstructed} reconstructed records are labelled in the evidence and excluded from the shared-mission race.</p> : null}
  </div>;
}
