"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import BoardPagination from "../BoardPagination";
import SegmentedControl from "../SegmentedControl";
import {
  firstPaid, GROUPS, leagueArt, pinnedKeys, PREFS_KEY, prizeKind, prizeLabel, rankLabel, readPrefs, rungs, share, toggle, worldOf,
  type BarCompetition, type BarLevel, type Prefs, type RewardBars, type Unread,
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
const fullName = (c: { name: string; rarity: string | null }) => `${c.name}${c.rarity ? ` ${c.rarity}` : ""}`;
const PAGE = 10;
// Sorare's wordmarks at the height drawn (their own proportions), so nothing moves when they arrive.
const LOGO_SIZE = { laliga: { width: 99, height: 22 }, champion: { width: 93, height: 22 }, europe: { width: 108, height: 48 } } as const;

function PinIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6z" /><path d="M12 15v6" strokeLinecap="round" />
    </svg>
  );
}

function HideIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.6 7.6A16.6 16.6 0 0 0 3 12s4 6 9 6a8.7 8.7 0 0 0 4.4-1.2" />
    </svg>
  );
}

/** A league's own icon on its colour; its initials while Sorare has none for it. */
function LeagueIcon({ c, size = 44 }: { c: Pick<BarCompetition, "key" | "name">; size?: number }) {
  const art = leagueArt(c.key);
  return (
    <span className="tg-ico" style={{ "--ico": `${size}px`, background: art?.colour } as CSSProperties} data-plain={art ? undefined : true}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Sorare's league icon, hot-linked */}
      {art ? <img src={art.icon} alt="" width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} loading="lazy" />
        : c.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
    </span>
  );
}

function why(c: BarCompetition): string {
  if (!c.ladder.length) return "Reward table not read yet";
  return "No finished week read yet";
}

function levelCount(levels: BarLevel[]): string {
  const xp = levels.filter((l) => prizeKind(l) === "xp").length;
  const paid = levels.length - xp;
  return `${paid} ${paid === 1 ? "level" : "levels"}${xp ? ` + ${xp} XP` : ""}`;
}

/** One pinned competition: every level from the best down, the average score it took, XP-only levels under a line. */
function Ladder({ c, onPin }: { c: BarCompetition; onPin: () => void }) {
  const world = worldOf(c);
  const art = leagueArt(c.key);
  const levels = rungs(c);
  const first = firstPaid(levels);
  const xp = levels.filter((l) => prizeKind(l) === "xp");
  const lastXp = xp.at(-1);
  const top = levels.at(-1);
  const sub = c.kind === "target" ? "Fixed steps" : c.kind === "room" ? `Room of ${c.size ?? 10}` : top ? `Top ${top.hi.toLocaleString("en-GB")} rewarded` : null;
  return (
    <article className="tg-lad" data-world={world} aria-label={fullName(c)} style={{ "--league": art?.colour } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Sorare's league icon as a watermark (the others' icons carry lettering) */}
      {art && (world === "laliga" || world === "league") ? <img className="tg-wm" src={art.icon} alt="" aria-hidden loading="lazy" /> : null}
      <header className="tg-lad-top">
        {world === "laliga" || world === "champion" || world === "europe" ? (
          // eslint-disable-next-line @next/next/no-img-element -- Sorare's competition wordmark
          <img className="tg-logo" src={art!.logo} alt={c.name} {...LOGO_SIZE[world]} />
        ) : (
          <span className="tg-lad-name"><LeagueIcon c={c} size={40} /><b>{c.kind === "target" ? c.name.replace(/( ·)? Pro( Rare)?$/, "") : c.name}</b>{c.kind === "target" ? <span className="tg-pro">{/Rare$/.test(c.key) ? "PRO RARE" : "PRO"}</span> : null}</span>
        )}
        <button type="button" className="tg-pin" aria-pressed aria-label={`Unpin ${fullName(c)}`} onClick={onPin}><PinIcon on /></button>
      </header>
      <p className="tg-lad-sub">
        {c.rarity && c.kind !== "target" ? <span className="tg-rar" data-rarity={c.rarity}>{rarityName(c.rarity)}</span> : null}
        {sub ? <span>{sub}</span> : null}
      </p>
      {levels.length ? (
        <ol className="tg-rungs">
          {levels.map((l, i) => {
            const kind = prizeKind(l);
            return [
              kind === "xp" && (i === 0 || prizeKind(levels[i - 1]!) !== "xp") ? <li key="xp" className="tg-xpline" aria-hidden>XP only</li> : null,
              <li key={`${l.lo}-${l.hi}`} className="tg-rung" data-first={i === first || undefined} style={{ "--w": share(l.bar ?? 0), "--i": i } as CSSProperties}>
                <span className="tg-rk">{rankLabel(c.kind, l)}</span>
                <span className="tg-mid"><i aria-hidden /><span data-kind={kind}>{prizeLabel(l)}</span></span>
                <b>{l.bar !== null ? points(l.bar) : "–"}</b>
              </li>,
            ];
          })}
        </ol>
      ) : <p className="tg-lad-none">{why(c)}</p>}
      <footer className="tg-lad-foot">
        <span>{c.kind === "target" ? "Sorare sets each step" : c.samples ? `${c.byWeek.length} ${c.byWeek.length === 1 ? "week" : "weeks"}${c.latest !== null ? ` · latest ${points(c.latest)}` : ""}` : why(c)}</span>
        {first >= 0 && levels[first]!.bar !== null ? (
          <span>Paid from <b>{points(levels[first]!.bar!)}</b>{lastXp?.bar != null ? <> · XP from <b>{points(lastXp.bar)}</b></> : null}</span>
        ) : null}
      </footer>
    </article>
  );
}

/** Every level side by side, lowest on the left, each column as tall as its score. */
function Staircase({ c, id }: { c: BarCompetition; id: string }) {
  const levels = rungs(c);
  const first = firstPaid(levels);
  const scores = levels.map((l) => l.bar).filter((b): b is number => b !== null);
  const lo = Math.min(...scores), hi = Math.max(...scores), span = hi - lo || 1;
  const up = levels.map((l, i) => ({ l, i })).reverse();
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- it scrolls sideways on a phone, so the keyboard must reach it
    <div className="tg-stair" id={id} role="img" tabIndex={0}
      aria-label={`Every level of ${fullName(c)}, lowest first: ${up.map(({ l }) => `${rankLabel(c.kind, l)} ${prizeLabel(l)} at ${l.bar !== null ? points(l.bar) : "no score yet"}`).join(", ")}`}>
      {up.map(({ l, i }, n) => (
        <div key={`${l.lo}-${l.hi}`} className="tg-st" data-first={i === first || undefined} data-kind={prizeKind(l)}
          style={{ "--h": l.bar !== null ? 0.12 + (0.88 * (l.bar - lo)) / span : 0.06, "--i": n } as CSSProperties}>
          <span className="tg-st-pz">{prizeLabel(l)}</span>
          <i aria-hidden />
          <b>{l.bar !== null ? points(l.bar) : "–"}</b>
          <span className="tg-st-rk">{rankLabel(c.kind, l)}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ c, pinned, open, onPin, onHide, onOpen }: {
  c: BarCompetition; pinned: boolean; open: boolean; onPin: () => void; onHide: () => void; onOpen: () => void;
}) {
  const levels = rungs(c);
  const first = firstPaid(levels);
  const scores = levels.map((l) => l.bar).filter((b): b is number => b !== null);
  const lo = Math.min(...scores), hi = Math.max(...scores), span = hi - lo || 1;
  const id = `tg-open-${c.key.replace(/\W+/g, "-")}`;
  const best = levels[0]?.bar ?? null;
  const from = first >= 0 ? levels[first]!.bar : null;
  return (
    <li className="tg-item" data-open={open || undefined}>
      <div className="tg-row">
        <LeagueIcon c={c} />
        <span className="tg-row-name">
          <b>{c.name}</b>
          <small>{c.rarity ? <i className="tg-dot" data-rarity={c.rarity} aria-hidden /> : null}{[rarityName(c.rarity), levels.length ? levelCount(levels) : null].filter(Boolean).join(" · ") || why(c)}</small>
        </span>
        <span className="tg-mini" aria-hidden>
          {[...levels].reverse().map((l) => (
            <i key={`${l.lo}-${l.hi}`} data-kind={prizeKind(l)} style={{ "--h": l.bar !== null ? 0.18 + (0.82 * (l.bar - lo)) / span : 0.1 } as CSSProperties} />
          ))}
        </span>
        <span className="tg-row-num">
          {from !== null ? <><b>{points(from)}</b><small>{best !== null && best !== from ? `to ${points(best)}` : "paid from"}</small></> : <span className="tg-wait">{why(c)}</span>}
        </span>
        <span className="tg-row-tools">
          <button type="button" className="tg-icon" aria-pressed={pinned} aria-label={`${pinned ? "Unpin" : "Pin"} ${fullName(c)}`} onClick={onPin}><PinIcon on={pinned} /></button>
          <button type="button" className="tg-icon" aria-label={`Hide ${fullName(c)}`} onClick={onHide}><HideIcon /></button>
          {levels.length && scores.length ? (
            <button type="button" className="tg-icon tg-chev" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={`Every level of ${fullName(c)}`} onClick={onOpen}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
            </button>
          ) : <span className="tg-icon" aria-hidden />}
        </span>
      </div>
      {open ? <Staircase c={c} id={id} /> : null}
    </li>
  );
}

function UnreadRow({ u }: { u: Unread }) {
  return (
    <li className="tg-item tg-unread">
      <div className="tg-row">
        <LeagueIcon c={u} />
        <span className="tg-row-name"><b>{u.name}</b><small>{rarityName(u.rarity) ?? " "}</small></span>
        <span className="tg-mini" aria-hidden />
        <span className="tg-row-num"><span className="tg-wait">{u.why === "no cards in this league" ? "No cards in this league" : "Not read"}</span></span>
        <span className="tg-row-tools" />
      </div>
    </li>
  );
}

type Tab = (typeof GROUPS)[number]["value"] | "Unread";

export default function TargetsView({ data }: { data: RewardBars | null }) {
  const [prefs, save] = usePrefs();
  const [tab, setTab] = useState<Tab>("In-season");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) {
    return (
      <main className="tg">
        <header className="tg-head"><h1>What each reward takes</h1><p className="tg-meta">Waiting for the first refresh to record the cut-offs</p></header>
      </main>
    );
  }
  const hidden = new Set(prefs.hidden);
  const shown = data.competitions.filter((c) => !hidden.has(c.key));
  const pinnedList = pinnedKeys(prefs, data.played);
  const pinned = new Set(pinnedList);
  const pins = pinnedList.map((key) => shown.find((c) => c.key === key)).filter((c): c is BarCompetition => !!c);
  const waiting = shown.filter((c) => !GROUPS.some((g) => g.value === c.group)); // no reward table read yet: no group to file it under
  const tabs = [...GROUPS.filter((g) => shown.some((c) => c.group === g.value)), ...(data.unread.length || waiting.length ? [{ value: "Unread" as const, label: "Not read" }] : [])];
  const active = tabs.some((t) => t.value === tab) ? tab : (tabs[0]?.value ?? "In-season");
  const rows: (BarCompetition | Unread)[] = active === "Unread" ? [...waiting, ...data.unread] : shown.filter((c) => c.group === active);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE) - 1));
  const pin = (key: string) => save(toggle(prefs, key, "pin", data.played));
  const hide = (key: string) => save(toggle(prefs, key, "hide", data.played));
  const hiddenComps = data.competitions.filter((c) => hidden.has(c.key));

  return (
    <main className="tg">
      <header className="tg-head">
        <div>
          <h1>What each reward takes</h1>
          <p className="tg-meta">Average of {data.weeks.length} finished gameweeks{data.latest ? `, latest ${data.latest}` : ""}</p>
        </div>
        <ul className="tg-key" aria-label="Kinds of reward">
          <li data-kind="cash">Cash</li><li data-kind="essence">Essence</li><li data-kind="card">Card</li><li data-kind="xp">XP</li>
        </ul>
      </header>

      {pins.length ? (
        <section className="tg-ladders" aria-label="Pinned" style={{ "--pins": Math.min(pins.length, 4) } as CSSProperties}>
          {pins.map((c) => <Ladder key={c.key} c={c} onPin={() => pin(c.key)} />)}
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
            : <Row key={c.key} c={c} pinned={pinned.has(c.key)} open={open === c.key} onPin={() => pin(c.key)} onHide={() => hide(c.key)}
                onOpen={() => setOpen(open === c.key ? null : c.key)} />)}
        </ul>
        <BoardPagination page={current} total={rows.length} onPage={setPage} label="Competition pages" />
        {hiddenComps.length ? (
          <details className="tg-hidden">
            <summary>Hidden ({hiddenComps.length})</summary>
            <ul>
              {hiddenComps.map((c) => (
                <li key={c.key}>
                  <button type="button" onClick={() => hide(c.key)} aria-label={`Show ${fullName(c)}`}>
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
