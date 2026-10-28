"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import BoardPagination from "../BoardPagination";
import SegmentedControl from "../SegmentedControl";
import {
  at, GROUPS, lanes, placeLabel, PREFS_KEY, prizeLabel, readPrefs, scaleOf, toggle,
  type BarCompetition, type Prefs, type RewardBars, type Unread,
} from "../../lib/rewardBars";

// Pins and hidden competitions live in this browser; a blocked storage keeps them for the visit.
let memory: string | null = null;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === PREFS_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
function snapshot(): string | null {
  try { return localStorage.getItem(PREFS_KEY) ?? memory; } catch { return memory; }
}
function usePrefs(): [Prefs, (next: Prefs) => void] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const prefs = useMemo(() => readPrefs(raw), [raw]);
  const save = (next: Prefs) => {
    memory = JSON.stringify(next);
    try { localStorage.setItem(PREFS_KEY, memory); } catch { /* blocked: kept for this visit */ }
    listeners.forEach((listener) => listener());
  };
  return [prefs, save];
}

const points = (value: number) => Math.round(value).toString();
const rarityName = (rarity: string | null) => (rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : null);
const PAGE = 10;

function PinIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6z" /><path d="M12 15v6" strokeLinecap="round" />
    </svg>
  );
}

function HideIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.6 7.6A16.6 16.6 0 0 0 3 12s4 6 9 6a8.7 8.7 0 0 0 4.4-1.2" />
    </svg>
  );
}

/** Every competition on one score scale: a dot each, the pinned ones raised on a flag. Tapping a dot pins it. */
function Ruler({ comps, pinned, onPin }: { comps: BarCompetition[]; pinned: Set<string>; onPin: (key: string) => void }) {
  const measured = comps.filter((c): c is BarCompetition & { bar: number } => c.bar !== null);
  const scale = scaleOf(measured.map((c) => c.bar));
  const placed = measured.map((c) => ({ c, at: at(c.bar, scale) }));
  const flags = placed.filter(({ c }) => pinned.has(c.key));
  const wide = lanes(flags.map(({ c, at }) => ({ key: c.key, at })), 15);
  const narrow = lanes(flags.map(({ c, at }) => ({ key: c.key, at })), 56);
  const swarm = lanes(placed.map(({ c, at }) => ({ key: c.key, at })), 1.4);
  const rows = (map: Map<string, number>) => (map.size ? Math.max(...map.values()) + 1 : 0);
  const style = { "--flags": rows(wide), "--flags-sm": rows(narrow), "--swarm": rows(swarm) } as CSSProperties;
  return (
    <figure className="tg-ruler" style={style} aria-label="Every competition's average bar on one scale of points">
      <div className="tg-flags">
        {flags.map(({ c, at: x }) => (
          <div key={c.key} className="tg-flag" data-rarity={c.rarity ?? undefined} data-edge={x > 72 ? "end" : x < 28 ? "start" : undefined}
            style={{ "--x": `${x}%`, "--lane": wide.get(c.key), "--lane-sm": narrow.get(c.key) } as CSSProperties}>
            <span className="tg-flag-name">{c.name}{c.rarity === "rare" ? " Rare" : ""}</span>
            <b>{points(c.bar)}</b>
          </div>
        ))}
      </div>
      <div className="tg-swarm">
        {placed.map(({ c, at: x }, i) => (
          <button key={c.key} type="button" className="tg-dot" data-rarity={c.rarity ?? undefined} aria-pressed={pinned.has(c.key)}
            aria-label={`${c.name}${c.rarity ? ` ${c.rarity}` : ""}: ${points(c.bar)} points. ${pinned.has(c.key) ? "Unpin" : "Pin"}`}
            data-tip={`${c.name} ${points(c.bar)}`} onClick={() => onPin(c.key)}
            style={{ "--x": `${x}%`, "--row": swarm.get(c.key), "--i": i } as CSSProperties} />
        ))}
      </div>
      <div className="tg-axis">
        {scale.ticks.map((t) => <span key={t} style={{ "--x": `${at(t, scale)}%` } as CSSProperties}>{t}</span>)}
      </div>
    </figure>
  );
}

/** The bar week by week: one column per finished gameweek, the latest in ink. */
function Weeks({ c }: { c: BarCompetition }) {
  const scores = c.byWeek.filter((w): w is { week: string; score: number } => w.score !== null);
  if (scores.length < 2 || c.low === null || c.high === null) return null;
  const span = c.high - c.low || 1;
  return (
    <div className="tg-weeks">
      <div className="tg-cols" role="img" aria-label={`Week by week: ${scores.map((w) => `${w.week} ${points(w.score)}`).join(", ")}`}>
        {scores.map((w, i) => (
          <span key={w.week} title={`${w.week}: ${points(w.score)}`} data-last={i === scores.length - 1 || undefined}
            style={{ "--h": `${24 + (76 * (w.score - c.low!)) / span}%` } as CSSProperties} />
        ))}
      </div>
      <p>{scores.length} weeks · {points(c.low)}–{points(c.high)}</p>
    </div>
  );
}

function why(c: BarCompetition): string {
  if (c.paidTo === null && c.kind !== "target") return "Reward table not read yet";
  return "No finished week read yet";
}

function Tile({ c, onPin }: { c: BarCompetition; onPin: () => void }) {
  const id = `tg-${c.key.replace(/\W+/g, "-")}`;
  const place = placeLabel(c);
  const prize = prizeLabel(c.reward);
  return (
    <article className="tg-tile" data-rarity={c.rarity ?? undefined} aria-labelledby={id}>
      <header>
        <h3 id={id}>{c.name}</h3>
        {c.rarity ? <span className="tg-rar">{rarityName(c.rarity)}</span> : null}
        <button type="button" className="tg-icon" aria-pressed aria-label={`Unpin ${c.name}`} onClick={onPin}><PinIcon on /></button>
      </header>
      {c.bar !== null ? (
        <p className="tg-num"><b>{points(c.bar)}</b><span>pts</span></p>
      ) : (
        <p className="tg-num tg-none"><b>–</b><span>{why(c)}</span></p>
      )}
      {place || prize ? <p className="tg-paid">{[place, prize].filter(Boolean).join(" · ")}</p> : null}
      <Weeks c={c} />
      {c.ladder.length > 1 ? (
        <details className="tg-ladder">
          <summary>{c.kind === "target" ? "Every step" : "Every level"}</summary>
          <ol>
            {c.ladder.map((l) => (
              <li key={`${l.lo}-${l.hi}`}>
                <span>{c.kind === "target" ? `Step ${l.lo}` : c.kind === "room" ? `${l.hi}${["st", "nd", "rd"][l.hi - 1] ?? "th"}` : `Top ${l.hi.toLocaleString("en-GB")}`}</span>
                <span>{prizeLabel(l)}</span>
                <b>{l.bar !== null ? points(l.bar) : "–"}</b>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </article>
  );
}

function Row({ c, scale, pinned, onPin, onHide }: {
  c: BarCompetition; scale: { lo: number; hi: number }; pinned: boolean; onPin: () => void; onHide: () => void;
}) {
  const place = placeLabel(c);
  const range = c.low !== null && c.high !== null ? { left: at(c.low, scale), right: 100 - at(c.high, scale) } : null;
  return (
    <li className="tg-row" data-rarity={c.rarity ?? undefined}>
      <span className="tg-row-name">
        <b>{c.name}</b>
        <small>{[rarityName(c.rarity), place].filter(Boolean).join(" · ") || " "}</small>
      </span>
      <span className="tg-row-scale" aria-hidden>
        {range ? <i className="tg-range" style={{ left: `${range.left}%`, right: `${range.right}%` }} /> : null}
        {c.bar !== null ? <i className="tg-mark" style={{ left: `${at(c.bar, scale)}%` }} /> : null}
      </span>
      <span className="tg-row-num">{c.bar !== null ? points(c.bar) : <span className="tg-wait">{why(c)}</span>}</span>
      <span className="tg-row-tools">
        <button type="button" className="tg-icon" aria-pressed={pinned} aria-label={`${pinned ? "Unpin" : "Pin"} ${c.name}${c.rarity ? ` ${c.rarity}` : ""}`} onClick={onPin}><PinIcon on={pinned} /></button>
        <button type="button" className="tg-icon" aria-label={`Hide ${c.name}${c.rarity ? ` ${c.rarity}` : ""}`} onClick={onHide}><HideIcon /></button>
      </span>
    </li>
  );
}

function UnreadRow({ u }: { u: Unread }) {
  return (
    <li className="tg-row tg-unread">
      <span className="tg-row-name"><b>{u.name}</b><small>{rarityName(u.rarity) ?? " "}</small></span>
      <span className="tg-row-scale" aria-hidden />
      <span className="tg-row-num"><span className="tg-wait">{u.why === "no cards in this league" ? "No cards in this league" : "Not read"}</span></span>
      <span className="tg-row-tools" />
    </li>
  );
}

type Tab = (typeof GROUPS)[number]["value"] | "Unread";

export default function TargetsView({ data }: { data: RewardBars | null }) {
  const [prefs, save] = usePrefs();
  const [tab, setTab] = useState<Tab>("In-season");
  const [page, setPage] = useState(0);
  if (!data) {
    return (
      <main className="tg">
        <header className="tg-head"><h1>What wins something</h1><p className="tg-meta">Waiting for the first refresh to record the cut-offs</p></header>
      </main>
    );
  }
  const hidden = new Set(prefs.hidden);
  const pinned = new Set(prefs.pinned);
  const shown = data.competitions.filter((c) => !hidden.has(c.key));
  const measured = shown.filter((c) => c.bar !== null).map((c) => c.bar!);
  const scale = scaleOf(measured);
  const pins = prefs.pinned.map((key) => shown.find((c) => c.key === key)).filter((c): c is BarCompetition => !!c);
  const waiting = shown.filter((c) => !GROUPS.some((g) => g.value === c.group)); // no reward table read yet: no group to file it under
  const tabs = [...GROUPS.filter((g) => shown.some((c) => c.group === g.value)), ...(data.unread.length || waiting.length ? [{ value: "Unread" as const, label: "Not read" }] : [])];
  const active = tabs.some((t) => t.value === tab) ? tab : (tabs[0]?.value ?? "In-season");
  const rows: (BarCompetition | Unread)[] = active === "Unread" ? [...waiting, ...data.unread] : shown.filter((c) => c.group === active);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE) - 1));
  const pin = (key: string) => save(toggle(prefs, key, "pin"));
  const hide = (key: string) => save(toggle(prefs, key, "hide"));
  const hiddenComps = data.competitions.filter((c) => hidden.has(c.key));

  return (
    <main className="tg">
      <header className="tg-head">
        <h1>What wins something</h1>
        <p className="tg-meta">Average over {data.weeks.length} finished gameweeks{data.latest ? `, latest ${data.latest}` : ""}</p>
      </header>
      <Ruler comps={shown} pinned={pinned} onPin={pin} />

      {pins.length ? (
        <section className="tg-pinned" aria-label="Pinned">
          {pins.map((c) => <Tile key={c.key} c={c} onPin={() => pin(c.key)} />)}
        </section>
      ) : null}

      <section className="tg-all" aria-labelledby="tg-all-title">
        <div className="tg-all-head">
          <h2 id="tg-all-title">All competitions</h2>
          {tabs.length > 1 ? (
            <SegmentedControl options={tabs.map((t) => ({ value: t.value, label: t.label }))} value={active} label="Kind of competition"
              onChange={(value) => { setTab(value); setPage(0); }} />
          ) : null}
        </div>
        <ul className="tg-list">
          {rows.slice(current * PAGE, (current + 1) * PAGE).map((c) => "why" in c
            ? <UnreadRow key={c.key} u={c} />
            : <Row key={c.key} c={c} scale={scale} pinned={pinned.has(c.key)} onPin={() => pin(c.key)} onHide={() => hide(c.key)} />)}
        </ul>
        <BoardPagination page={current} total={rows.length} onPage={setPage} label="Competition pages" />
        {hiddenComps.length ? (
          <details className="tg-hidden">
            <summary>Hidden ({hiddenComps.length})</summary>
            <ul>
              {hiddenComps.map((c) => (
                <li key={c.key}>
                  <button type="button" onClick={() => hide(c.key)} aria-label={`Show ${c.name}${c.rarity ? ` ${c.rarity}` : ""}`}>
                    {c.name}{c.rarity ? <small>{rarityName(c.rarity)}</small> : null}<span aria-hidden>Show</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </main>
  );
}
