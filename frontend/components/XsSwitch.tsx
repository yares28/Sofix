"use client";

import { useEffect, useRef, useState } from "react";
import replay from "../lib/data/sofix_v1_replay.json";
import { DEFAULT_XS, shownXs, starterRates, XS_ABOUT, XS_KEY, XS_VERSIONS, type Band, type XsVersion } from "../lib/xs";
import ThemeSwitch from "./ThemeSwitch";
import { askExtension } from "../lib/extension";


// Starters within ±7, ±10 and ±15 on the same replayed LaLiga starts (Jan-Oct 2026, lib/xs.ts starterRates); a version the
// replay has no figure for says "being measured" (v0 at ±10 and ±15).
const latest = replay.phases.at(-1)!.start;
const RATES: Record<Band, Partial<Record<XsVersion, number>>> = { 7: starterRates(7, latest), 10: starterRates(10, latest), 15: starterRates(15, latest) };
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
    void askExtension({ type: "xs-version", version: shownXs(saved) }, 1000); // the sorare.com overlay draws the same version
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
    if (next === DEFAULT_XS) delete document.documentElement.dataset.xs;
    else document.documentElement.dataset.xs = next;
    try {
      localStorage.setItem(XS_KEY, next);
    } catch {}
    setVersion(next);
    setOpen(false);
    void askExtension({ type: "xs-version", version: next }, 1000);
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
      <button type="button" className="xs-switch-btn" aria-haspopup="dialog" aria-expanded={open} aria-label={`xS version: ${version ?? DEFAULT_XS}`} onClick={() => setOpen((o) => !o)}>
        <span className="xs-switch-word">xS </span><b>{version ?? DEFAULT_XS}</b>
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
                <span className="xs-switch-name"><b>Sofix {v}</b><small>{XS_ABOUT[v]}</small></span>
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
