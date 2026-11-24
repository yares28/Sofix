"use client";

import { useEffect, useState, type ReactNode } from "react";
import replay from "../../lib/data/sofix_v1_replay.json";
import { percent, type Versus, type VersusSide } from "../../lib/audit";
import { DEFAULT_XS, replayRates, shownXs, starterRates, XS_ABOUT, XS_KEY, XS_VERSIONS, type Band, type XsVersion } from "../../lib/xs";
import VersusAudit from "./VersusAudit";

const BANDS: Band[] = [7, 10, 15];
const latest = replay.phases.at(-1)!;
// Starters: the replay file and the research's side-by-side replay at every width; substitutes: the replay file, ±7 only.
const REPLAY = { starts: latest.start.cases, games: latest.bench.cases };
const replayRate = (version: XsVersion, role: "start" | "bench", band: Band) =>
  (role === "start" ? starterRates(band, latest.start) : band === 7 ? replayRates(latest.bench) : {})[version];
const count = (n: number) => n.toLocaleString("en-GB");
const within = (side: VersusSide, band: Band) => (band === 7 ? side.within : band === 10 ? side.within10 : side.within15) ?? null;

/**
 * Audit · xS (plans/xscore-versions.md step 4): every version against the real score, live (saved before each lock) and on the
 * replay, starters and substitutes, within ±7, ±10 or ±15; the one the switch shows is marked. Picking a version (a row or the
 * menu) fills the section under it with that version's own numbers.
 */
export default function XsAudit({ versions, fallback, updated }: { versions: Partial<Record<XsVersion, Versus>>; fallback: Versus; updated: ReactNode }) {
  const [band, setBand] = useState<Band>(7);
  const [inUse, setInUse] = useState<XsVersion>(DEFAULT_XS);
  const [chosen, setChosen] = useState<XsVersion>(DEFAULT_XS);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(XS_KEY);
    } catch {}
    setInUse(shownXs(saved));
    setChosen(shownXs(saved));
  }, []);

  const live = (version: XsVersion, role: "all" | "subs") => {
    const figures = versions[version]?.[role];
    const rate = figures ? within(figures.sofix, band) : null;
    const n = figures?.starts ?? 0;
    return n && rate !== null ? { n: percent(rate), sub: `${count(n)} ${role === "all" ? "starts" : "games"}` } : { n: "—", sub: "Awaiting results" };
  };
  const replayed = (version: XsVersion, role: "start" | "bench") => {
    const rate = replayRate(version, role, band);
    return rate === undefined ? { n: "—", sub: "Being measured" } : { n: percent(rate), sub: `of ${count(role === "start" ? REPLAY.starts : REPLAY.games)}` };
  };

  return (
    <>
      <section className="au-w xa-card" aria-labelledby="xa-title">
        <div className="xa-head">
          <div>
            <h1 id="xa-title">Every xS version</h1>
            <p className="ax-sub">Against the real score: saved before each lock, and on the Jan–Oct 2026 replay</p>
          </div>
          <div className="xs-switch-bands" role="group" aria-label="Hit window">
            {BANDS.map((n) => <button key={n} type="button" aria-pressed={n === band} onClick={() => setBand(n)}>±{n}</button>)}
          </div>
        </div>
        <table className="xa-table">
          <caption className="visually-hidden">Each xS version within {band} points of the real score</caption>
          <thead>
            <tr><th scope="col">Version</th><th scope="col">Starters · live</th><th scope="col">Starters · replay</th><th scope="col">Subs · live</th><th scope="col">Subs · replay</th></tr>
          </thead>
          <tbody>
            {XS_VERSIONS.map((v) => (
              <tr key={v} aria-current={v === chosen ? "true" : undefined}>
                <th scope="row">
                  <button type="button" className="xa-pick" onClick={() => setChosen(v)} aria-pressed={v === chosen}>
                    <b>Sofix {v}{v === inUse ? <span className="xa-use">In use</span> : null}</b>
                    <small>{XS_ABOUT[v]}</small>
                  </button>
                </th>
                {[live(v, "all"), replayed(v, "start"), live(v, "subs"), replayed(v, "bench")].map((cell, i) => (
                  <td key={i}><b className={cell.n === "—" ? "xa-none" : undefined}>{cell.n}</b><small>{cell.sub}</small></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="xa-pickrow">
        <label>
          <span>Version</span>
          <select value={chosen} onChange={(e) => setChosen(e.target.value as XsVersion)}>
            {XS_VERSIONS.map((v) => <option key={v} value={v}>Sofix {v}</option>)}
          </select>
        </label>
      </div>
      <VersusAudit versus={versions[chosen] ?? fallback} updated={updated} label={versions[chosen] ? `Sofix ${chosen}` : "Sofix"} />
    </>
  );
}
