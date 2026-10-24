"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { lockDay, percent, SOURCES, NO_ELEVENS, type ElevenSources, type StartFix } from "../../lib/audit";
import { casesLabel, CHARTS, COMPETITIONS, emptyScope, selection, SOURCE_NAMES, type StartSelection, type StartsBoard } from "../../lib/startsBoard";
import SourceMark from "../SourceMark";
import Shield from "../lineups/Shield";

const PAGE = 12;
const range = (band: StartFix) => band.from === band.to ? percent(band.from) : `${percent(band.from)}–${percent(band.to)}`;
const evidence = (band: StartFix) => `${percent(band.said)} predicted · ${percent(band.was)} started · ${casesLabel(band.n)}`;

function Tabs({ label, options, value, onChange, panel }: { label: string; options: readonly (readonly [string, string])[]; value: string; onChange: (value: string) => void; panel: string }) {
  const id = useId();
  return <div className="ws-tabs" role="tablist" aria-label={label}>
    {options.map(([key, name], index) => <button key={key} type="button" role="tab" id={`${id}-${key}`} aria-controls={panel} aria-selected={value === key} tabIndex={value === key ? 0 : -1}
      onClick={() => onChange(key)} onKeyDown={event => {
        const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : offset ? (index + offset + options.length) % options.length : null;
        if (next === null) return;
        const option = options[next];
        if (!option) return;
        event.preventDefault(); onChange(option[0]);
        document.getElementById(`${id}-${option[0]}`)?.focus();
      }}>{name}</button>)}
  </div>;
}

function Pager({ page, total, change, label }: { page: number; total: number; change: (page: number) => void; label: string }) {
  if (total <= PAGE) return null;
  return <nav className="ws-pages" aria-label={label}>
    <button type="button" disabled={page === 0} onClick={() => change(page - 1)}>Previous</button>
    <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
    <button type="button" disabled={(page + 1) * PAGE >= total} onClick={() => change(page + 1)}>Next</button>
  </nav>;
}

function Bands({ bands, chart, page, onPage }: { bands: StartFix[]; chart: string; page: number; onPage: (page: number) => void }) {
  const [focused, setFocused] = useState(0);
  if (!bands.length) return <p className="ws-empty">No checked games for this source yet.</p>;
  const current = (bands[focused] ?? bands[0])!;
  const currentPage = Math.min(page, Math.floor((bands.length - 1) / PAGE));
  return <>
    <div className="ws-chart-key"><span><i className="ws-predicted" />Predicted</span><span><i className="ws-observed" />Started</span></div>
    {chart === "B" ? <div className="ws-reliability">
      <div className="ws-plot-label">Actually started</div>
      <div className="ws-plot" role="group" aria-label="Predicted chance against actual starts">
        <span className="ws-axis-top">100%</span><span className="ws-axis-zero">0%</span><span className="ws-axis-end">100%</span>
        <div className="ws-plot-inner">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 100L100 0" /></svg>
          {bands.map((band, index) => <button type="button" key={band.from} className="ws-point" aria-label={evidence(band)} aria-pressed={focused === index}
            style={{ left: `${band.said * 100}%`, bottom: `${band.was * 100}%`, "--point": `${Math.min(17, 7 + Math.sqrt(band.n) / 2)}px` } as CSSProperties}
            onFocus={() => setFocused(index)} onClick={() => setFocused(index)}><i /></button>)}
        </div>
      </div>
      <div className="ws-plot-label ws-plot-x">Predicted chance</div>
      <p className="ws-diagonal">On the line = prediction matched reality</p>
      <label className="ws-band-select">Chance range <select value={Math.min(focused, bands.length - 1)} onChange={event => setFocused(Number(event.target.value))}>
        {bands.map((band, index) => <option key={band.from} value={index}>{range(band)} · {casesLabel(band.n)}</option>)}
      </select></label>
      <p className="ws-evidence" aria-live="polite">{evidence(current)}</p>
    </div> : <>
      <ol className={`ws-band-list ws-chart-${chart}`} aria-label={chart === "A" ? "Connected probability dots" : "Paired probability bars"}>
        {bands.slice(currentPage * PAGE, (currentPage + 1) * PAGE).map(band => <li key={band.from}>
          <div className="ws-band-label"><strong>{range(band)}</strong><span>{casesLabel(band.n)}</span></div>
          {chart === "A" ? <div className="ws-dot-track" aria-hidden="true">
            <i className="ws-connection" style={{ left: `${Math.min(band.said, band.was) * 100}%`, width: `${Math.abs(band.was - band.said) * 100}%` }} />
            <i className="ws-dot ws-dot-before" style={{ left: `${band.said * 100}%` }} /><i className="ws-dot ws-dot-after" style={{ left: `${band.was * 100}%` }} />
          </div> : <div className="ws-pair-tracks" aria-hidden="true"><i style={{ width: `${band.said * 100}%` }} /><i style={{ width: `${band.was * 100}%` }} /></div>}
          <p className="ws-band-values"><span>{percent(band.said)} predicted</span><b>{percent(band.was)} started</b></p>
        </li>)}
      </ol>
      <Pager page={currentPage} total={bands.length} change={onPage} label="Probability ranges" />
    </>}
  </>;
}

function ElevenLine({ sources }: { sources: ElevenSources }) {
  return <div className="ws-eleven-sources">{SOURCES.map(source => {
    const cell = sources[source];
    const rate = cell.checked ? cell.started / cell.checked : null;
    return <div key={source} className="ws-eleven-source"><span><SourceMark source={source} />{SOURCE_NAMES[source]}</span>
      <b>{percent(rate)}</b><small>{cell.started} of {cell.checked} started<span>{cell.picked} picked</span></small>
      <div className="ws-result-track" aria-hidden="true"><i style={{ width: `${(rate ?? 0) * 100}%` }} /></div>
    </div>;
  })}</div>;
}

export default function StartsAudit({ board, updated, initial = selection(), history }: { board: StartsBoard | null; updated: string; initial?: StartSelection; history?: ReactNode }) {
  const [chosen, setChosen] = useState(initial);
  useEffect(() => {
    const restore = () => setChosen(selection(Object.fromEntries(new URLSearchParams(window.location.search))));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function change(patch: Partial<StartSelection>) {
    const next = { ...chosen, ...patch };
    setChosen(next);
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      const stored = key.endsWith("Page") ? String(Number(value) + 1) : String(value);
      if (value === selection()[key as keyof StartSelection]) url.searchParams.delete(key);
      else url.searchParams.set(key, stored);
    }
    window.history.pushState(null, "", url);
  }
  const slice = (chosen.competition === "all" ? board?.all : board?.competitions[chosen.competition]) ?? emptyScope();
  const bands = slice.bands[chosen.source] ?? [];
  const elevens = slice.elevens ?? NO_ELEVENS;
  const groups = chosen.eleven === "weeks" ? elevens.weeks.map(week => ({ name: `GW${week.week}`, sources: week.sources, crest: null }))
    : chosen.eleven === "clubs" ? elevens.clubs.map(club => ({ name: club.club, sources: club.sources, crest: club.crest }))
    : [{ name: "All games", sources: elevens.all, crest: null }];
  const elevenPage = Math.min(chosen.elevenPage, Math.max(0, Math.ceil(groups.length / PAGE) - 1));
  const competitionRows = chosen.competition === "all" ? COMPETITIONS : COMPETITIONS.filter(([slug]) => slug === chosen.competition);
  return <div className="ws-board">
    <header className="ws-header"><div><p className="ws-eyebrow">AUDIT / STARTS</p><h1>Who starts</h1></div><p className="ws-updated">{updated}</p></header>
    <div className="ws-scope"><label htmlFor="ws-competition">Competition</label><select id="ws-competition" value={chosen.competition} onChange={event => change({ competition: event.target.value, chartPage: 0, elevenPage: 0 })}>
      <option value="all">All 7 competitions</option>{COMPETITIONS.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
    </select><span>Predictions saved before the lock</span></div>
    <section className="ws-summary" aria-label="Who starts?">{SOURCES.map(source => {
      const live = slice.sources[source];
      const high = live.buckets?.find(band => band.from === 0.8);
      return <article className="au-src ws-source" key={source} aria-label={SOURCE_NAMES[source]} data-state={live.state}>
        <h2><SourceMark source={source} />{SOURCE_NAMES[source]}</h2>
        <p className="au-src-main figure ws-accuracy">{percent(live.right)}<span>right</span></p>
        <p className="ws-checked">{live.settled ? `${casesLabel(live.settled)} checked` : "Waiting for results"}</p>
        <dl><div><dt>Probability error</dt><dd>{live.brier === null ? "–" : live.brier.toFixed(2)}</dd></div><div><dt>80%+ picks</dt><dd>{high ? `${percent(high.was)} started` : "–"}</dd></div></dl>
        {high ? <span className="ws-sample">{casesLabel(high.n)}</span> : null}
      </article>;
    })}</section>
    <section className="ws-section ws-competitions" aria-labelledby="ws-competition-h"><div className="ws-section-head"><h2 id="ws-competition-h">By competition</h2><span>Accuracy · games checked</span></div>
      <ol>{competitionRows.map(([slug, name], index) => <li key={slug}><h3><span>{String(index + 1).padStart(2, "0")}</span>{name}</h3>
        <div className="ws-competition-values">{SOURCES.map(source => {
          const result = board?.competitions[slug]?.sources[source];
          return <div key={source}><span><SourceMark source={source} />{SOURCE_NAMES[source]}</span><strong>{percent(result?.right)}</strong><small>{result?.recorded ? `${result.settled.toLocaleString("en-GB")} / ${result.recorded.toLocaleString("en-GB")} checked` : "No prediction"}</small></div>;
        })}</div>
      </li>)}</ol>
    </section>
    <section className="ws-section ws-corrections" aria-labelledby="ws-correction-h"><div className="ws-section-head"><h2 id="ws-correction-h">Predicted vs actual</h2><span>Every checked game counts</span></div>
      <div className="ws-chart-controls"><Tabs label="Prediction source" options={SOURCES.map(source => [source, SOURCE_NAMES[source]])} value={chosen.source} panel="ws-calibration" onChange={source => change({ source: source as StartSelection["source"], chartPage: 0 })} />
        <Tabs label="Chart style" options={CHARTS} value={chosen.chart} panel="ws-calibration" onChange={chart => change({ chart })} /></div>
      <div id="ws-calibration" role="tabpanel" aria-label={`${SOURCE_NAMES[chosen.source]} ${CHARTS.find(([key]) => key === chosen.chart)?.[1]}`} className="ws-chart" key={`${chosen.competition}-${chosen.source}-${chosen.chart}`}>
        <Bands bands={bands} chart={chosen.chart} page={chosen.chartPage} onPage={chartPage => change({ chartPage })} />
      </div>
    </section>
    <section className="ws-section ws-log" id="written" aria-labelledby="ws-written-h"><div className="ws-section-head"><h2 id="ws-written-h">Written down so far</h2><span>Checked as each game&apos;s result arrives.</span></div>
      {slice.weeks.length ? <ol aria-label="Games written down before each lock">{slice.weeks.map(week => <li key={week.slug}><details>
        <summary><time dateTime={week.lock ?? undefined}>{lockDay(week.lock)}</time><span className="ws-result-track" aria-hidden="true"><i style={{ width: `${week.games ? week.settled / week.games * 100 : 0}%` }} /></span>
        <strong>{week.settled.toLocaleString("en-GB")}<small> / {week.games.toLocaleString("en-GB")} checked</small></strong><span className="ws-disclosure" aria-hidden="true" /></summary>
        <dl aria-label="Forecasts saved before the lock">{SOURCES.map(source => <div key={source}><dt><SourceMark source={source} />{SOURCE_NAMES[source]}</dt><dd>{casesLabel(week.sources[source] ?? 0)} saved</dd></div>)}</dl>
      </details>
      </li>)}</ol> : <p className="ws-empty">No predictions recorded for these competitions yet.</p>}
    </section>
    <section className="ws-section" aria-labelledby="ws-eleven-h"><div className="ws-section-head"><h2 id="ws-eleven-h">Predicted elevens</h2><Tabs label="Eleven breakdown" options={[["all", "All games"], ["weeks", "Gameweek"], ["clubs", "Club"]]} value={chosen.eleven} panel="ws-elevens" onChange={eleven => change({ eleven, elevenPage: 0 })} /></div>
      <div id="ws-elevens" role="tabpanel" aria-label="Predicted eleven results" className="ws-eleven-groups">{groups.slice(elevenPage * PAGE, (elevenPage + 1) * PAGE).map(group => <section key={group.name} aria-label={group.name}>
        {chosen.eleven !== "all" ? <h3>{group.crest ? <Shield crest={group.crest} code={group.name} width={22} /> : null}{group.name}</h3> : null}<ElevenLine sources={group.sources} />
      </section>)}{!groups.length ? <p className="ws-empty">No predicted elevens kept for this competition yet.</p> : null}</div>
      <Pager page={elevenPage} total={groups.length} change={elevenPage => change({ elevenPage })} label="Predicted eleven groups" />
    </section>
    {history ? <details className="ws-history"><summary>Historical Sofix replay</summary>{history}</details> : null}
  </div>;
}
