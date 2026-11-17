"use client";

import { useEffect, useRef, useState } from "react";
import replay from "../lib/data/sofix_v1_replay.json";
import { shownXs, XS_KEY, XS_VERSIONS, type XsVersion } from "../lib/xs";
import ThemeSwitch from "./ThemeSwitch";

/** What each version is, in the owner's words (plans/xscore-versions.md). */
const ABOUT: Record<XsVersion, string> = {
  v0: "Before 12 Nov: normal and decisive score mixed",
  v1: "Expected points · the default",
  v2: "The most likely final score",
};

// Within 7 points on the same replayed LaLiga starters (Jan-Oct 2026): v0 is the previous model, v1 its expected points,
// v2 its most likely score. ±10 and ±15 per version wait for the research's replay (plans/xscore-versions.md step 4).
const latest = replay.phases.at(-1)!.start;
const RATES: Record<7 | 10 | 15, Partial<Record<XsVersion, number>>> = {
  7: { v0: latest.previousHits / latest.cases, v1: latest.meanHits / latest.cases, v2: latest.hits / latest.cases },
  10: {},
  15: {},
};
const BANDS = [7, 10, 15] as const;
const rate = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Which xS every card shows, top right beside the theme: one choice for the whole app, kept in this browser. */
export default function XsSwitch() {
  const [version, setVersion] = useState<XsVersion | null>(null); // unknown until the browser says, so the server renders no guess
  const [open, setOpen] = useState(false);
  const [band, setBand] = useState<(typeof BANDS)[number]>(7);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(XS_KEY);
    } catch {}
    setVersion(shownXs(saved));
  }, []);

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector<HTMLElement>(".xs-switch-btn")?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const pick = (next: XsVersion) => {
    if (next === "v1") delete document.documentElement.dataset.xs;
    else document.documentElement.dataset.xs = next;
    try {
      localStorage.setItem(XS_KEY, next);
    } catch {}
    setVersion(next);
    setOpen(false);
  };

  const key = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="xs-switch" ref={box}>
      <button type="button" className="xs-switch-btn" aria-haspopup="dialog" aria-expanded={open} aria-label={`xS version: ${version ?? "v1"}`} onClick={() => setOpen((o) => !o)}>
        <span className="xs-switch-word">xS </span><b>{version ?? "v1"}</b>
        <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open ? (
        <div className="xs-switch-pop" role="dialog" aria-label="xS version">
          <div className="xs-switch-head">
            <span>Hits within</span>
            <span className="xs-switch-bands" role="group" aria-label="Hit window">
              {BANDS.map((n) => <button key={n} type="button" aria-pressed={n === band} onClick={() => setBand(n)}>±{n}</button>)}
            </span>
          </div>
          <div role="radiogroup" aria-label="Version" tabIndex={-1} onKeyDown={key}>
          {XS_VERSIONS.map((v) => {
            const hit = RATES[band][v];
            return (
              <button key={v} type="button" role="radio" aria-checked={v === version} className="xs-switch-opt" onClick={() => pick(v)}>
                <span className="xs-switch-tick" aria-hidden="true">{v === version ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : null}</span>
                <span className="xs-switch-name"><b>Sofix {v}</b><small>{ABOUT[v]}</small></span>
                <span className="xs-switch-rate"><b>{hit === undefined ? "—" : rate.format(hit)}</b><small>{hit === undefined ? "being measured" : `±${band} · replay`}</small></span>
              </button>
            );
          })}
          </div>
          {/* A phone's bar has no room for both: there the theme lives here (home.css hides the bar's own). */}
          <div className="xs-switch-theme"><span>Theme</span><ThemeSwitch /></div>
        </div>
      ) : null}
    </div>
  );
}
