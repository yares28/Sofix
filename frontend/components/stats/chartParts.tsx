"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { STAT_GROUPS } from "../../lib/statLeaders";
import { AVG, chartLabel, type ChartPlayer, type ChartWindow, type Position, type WindowKey } from "../../lib/statCharts";
import CardArt from "../cards/CardArt";
import Link from "../navigation/NavigationLink";
import SorareImage from "../play/SorareImage";

export const POS_COLOR: Record<Position, string> = { GK: "#a86a00", DEF: "#1a7a4e", MID: "#0071e3", FWD: "#d6452f" };
export const PICK_COLORS = ["#0071e3", "#e07a10", "#6e44c9"];

// One answer per window per visit: the route is cached for an hour, so a second look at a window costs nothing.
const asked = new Map<WindowKey, Promise<ChartWindow>>();
function ask(window: WindowKey): Promise<ChartWindow> {
  let answer = asked.get(window);
  if (!answer) {
    answer = fetch(`/api/stat-charts?w=${window}`).then((res) => (res.ok ? (res.json() as Promise<ChartWindow>) : Promise.reject(new Error(String(res.status)))));
    answer.catch(() => asked.delete(window));
    asked.set(window, answer);
  }
  return answer;
}

/** The window's players; the last window shown stays up (dimmed by the caller) while the next one arrives. */
export function useChartWindow(window: WindowKey): { data: ChartWindow | null; loading: boolean; failed: boolean } {
  const [state, setState] = useState<{ data: ChartWindow | null; failed: boolean }>({ data: null, failed: false });
  useEffect(() => {
    let live = true;
    ask(window).then((data) => live && setState({ data, failed: false }), () => live && setState((s) => ({ ...s, failed: true })));
    return () => { live = false; };
  }, [window]);
  return { data: state.data, loading: state.data?.window !== window && !state.failed, failed: state.failed };
}

/** True while the page shows its dark theme (components/ThemeSwitch.tsx writes data-theme on <html>). */
export function useDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const read = () => setDark(html.dataset.theme === "dark");
    read();
    const watch = new MutationObserver(read);
    watch.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return dark;
}

/** An element's size, kept up to date. */
export function useSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const watch = new ResizeObserver(([entry]) => entry && setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    watch.observe(el);
    return () => watch.disconnect();
  }, [el]);
  return [setEl, size];
}

/** True on a phone-sized screen, where a chart needs smaller margins. */
export function useNarrow(px = 600): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${px}px)`);
    const read = () => setNarrow(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, [px]);
  return narrow;
}

/** Every stat the window has, in the stat sheet's groups, with the average score first. */
export function statOptions(keys: string[]): { name: string; options: { key: string; label: string }[] }[] {
  const have = new Set(keys);
  const known = new Set(STAT_GROUPS.flatMap((g) => g.keys));
  return [
    { name: "Score", options: [{ key: AVG, label: chartLabel(AVG) }] },
    ...STAT_GROUPS.map((g) => ({ name: g.name, options: g.keys.filter((k) => have.has(k)).map((key) => ({ key, label: chartLabel(key) })) })),
    { name: "Other", options: keys.filter((k) => !known.has(k)).map((key) => ({ key, label: chartLabel(key) })) },
  ].filter((g) => g.options.length);
}

export function StatSelect({ value, onChange, keys, label, className = "sc-select", withAverage = true }: {
  value: string; onChange: (key: string) => void; keys: string[]; label: string; className?: string; withAverage?: boolean;
}) {
  const groups = statOptions(keys).filter((g) => withAverage || g.name !== "Score");
  return (
    <select className={className} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map((g) => (
        <optgroup key={g.name} label={g.name}>
          {g.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** One button that opens the list of leagues, "All leagues" first when `all` is on. */
export function LeagueMenu({ value, onChange, counts, all = true }: { value: string; onChange: (league: string) => void; counts: Record<string, number>; all?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const names = Object.keys(counts).filter((k) => all || k !== "ALL");
  const shown = (k: string) => (k === "ALL" ? "All leagues" : k);
  return (
    <div className="sc-menu" ref={box}>
      <button type="button" className="sc-menu-button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        {shown(value)}<span className="sc-n">{counts[value] ?? 0}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </button>
      {open ? (
        <div className="sc-menu-list" role="menu">
          {names.map((k) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={k === value} className={k === "ALL" ? "sc-all" : undefined}
              onClick={() => { onChange(k); setOpen(false); }}>
              {shown(k)}<span className="sc-n">{counts[k]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Crest({ src, size = 18 }: { src: string | null; size?: number }) {
  return src ? <SorareImage className="sc-crest" src={src} width={size} height={size} /> : <span className="sc-crest sc-shield" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** A player's real card, with the club, the name and the lines the chart wants to say about him. */
export function PlayerPop({ player, lines, style, pinned, onClose, width = 140 }: {
  player: ChartPlayer;
  lines: { big: string; label: string; sub?: string; bar?: number }[];
  style: CSSProperties;
  pinned?: boolean;
  onClose?: () => void;
  width?: number;
}) {
  const color = POS_COLOR[player.pos];
  return (
    <div className={`sc-pop${pinned ? " pinned" : ""}`} style={style} role={pinned ? "dialog" : undefined} aria-label={pinned ? player.name : undefined}>
      {pinned && onClose ? <button type="button" className="sc-x" aria-label="Close" onClick={onClose}>×</button> : null}
      <Link className="sc-pop-card" href={`/players/${player.slug}`} prefetch={false} style={{ width, height: Math.round(width * 1.62) }} tabIndex={pinned ? 0 : -1} aria-label={`${player.name}: open his page`}>
        <CardArt src={player.card} name={player.name} skeleton={<span className="sc-sk" />} />
      </Link>
      <div className="sc-pop-text">
        <span className="sc-pop-club"><Crest src={player.crest} />{player.club}</span>
        <b className="sc-pop-name">{player.name}{player.mine ? <span className="sc-yours">Yours</span> : null}</b>
        <span className="sc-pop-pos"><i style={{ background: color }} />{player.pos} · {player.league}</span>
        {lines.map((line) => (
          <span key={line.label} className="sc-pop-line">
            <span><b>{line.big}</b> {line.label}</span>
            {line.bar !== undefined ? <span className="sc-bar"><span style={{ width: `${Math.round(line.bar * 100)}%`, background: color }} /></span> : null}
            {line.sub ? <small>{line.sub}</small> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
