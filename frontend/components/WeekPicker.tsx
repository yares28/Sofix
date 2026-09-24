"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { byMonth, weekDates, weekValue, type Week } from "../lib/weeks";

const BOARD = ["/fixtures", "/difficulty", "/table"];

/**
 * What to call a week. LaLiga and Sorare both count in gameweeks and their numbers differ — LaLiga's GW7 is
 * Sorare's GW17 — so the page's own counting leads and the other one is named.
 */
function names(week: Week, play: boolean): { lead: string; also: string | null } {
  const laliga = week.md === null ? null : { lead: `GW${week.md}`, named: `LaLiga GW${week.md}` };
  const sorare = week.gw === null ? null : { lead: `GW${week.number}`, named: `Sorare GW${week.number}` };
  const [mine, theirs] = play ? [sorare, laliga] : [laliga, sorare];
  if (!mine) return { lead: theirs!.named, also: null };
  return { lead: mine.lead, also: theirs?.named ?? null };
}

/**
 * The app's one gameweek control: it picks a **week**, and every page resolves what it holds — the board its
 * LaLiga round, Play its Sorare gameweek. A season is 43 weeks and Sorare only ever opens eight of them, so the
 * panel shows a month at a time. Design: docs/sorare/design/week-selector.html.
 */
export default function WeekPicker({ weeks, current, now }: { weeks: Week[]; current: Week | null; now: Week | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (current ?? now)?.id.slice(0, 7) ?? "");
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Opening on the month you are in, and with the week you are on in view.
  useEffect(() => {
    if (!open) return;
    setMonth((current ?? now)?.id.slice(0, 7) ?? "");
    requestAnimationFrame(() => panel.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: "nearest" }));
  }, [open, current, now]);

  if (!weeks.length || !current) return null;
  const months = byMonth(weeks);
  const shown = months.find((m) => m.key === month) ?? months[0]!;

  const go = (week: Week) => {
    // The address as it really is: the board rewrites its own view into it with history.replaceState, which
    // Next's useSearchParams() does not follow, and a week change must not throw the lens or horizon away.
    const next = new URLSearchParams(window.location.search);
    // Always written, even for the week the app is on: each page has its own idea of "no week asked for" —
    // the board opens on the next LaLiga round — so a week you picked has to be said out loud to be kept.
    next.set("w", week.id);
    next.delete("gw"); // the old per-page gameweek; the week replaces it
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setOpen(false);
  };

  // The arrows step through the weeks *this page* can show: a board page would otherwise walk through a
  // fortnight of Sorare game weeks that hold no LaLiga round, and appear to do nothing.
  const play = pathname === "/play";
  const scoped = BOARD.includes(pathname)
    ? weeks.filter((week) => week.md !== null)
    : play
      ? weeks.filter((week) => week.gw)
      : weeks;
  const here = scoped.findIndex((week) => week.id === current.id);
  const ahead = here >= 0 ? here : scoped.findIndex((week) => week.from > current.from);
  const back = here >= 0 ? scoped[here - 1] : ahead > 0 ? scoped[ahead - 1] : undefined;
  const forward = here >= 0 ? scoped[here + 1] : ahead >= 0 ? scoped[ahead] : undefined;
  const step = (week: Week | undefined) => week && go(week);

  return (
    <div className={`wk${open ? " open" : ""}`} role="group" aria-label="Choose gameweek">
      <button type="button" className="wk-step" aria-label="Previous gameweek" disabled={!back} onClick={() => step(back)}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M7.5 2 3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        ref={trigger}
        type="button"
        className="wk-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((was) => !was)}
      >
        <span className={`wk-dot ${current.state}`} />
        <b>{names(current, play).lead}</b>
        <span className="wk-when">{weekDates(current)}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m2 4.5 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className="wk-step"
        aria-label="Next gameweek"
        disabled={!forward}
        onClick={() => step(forward)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4.5 2 8.5 6l-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="wk-panel" ref={panel} hidden={!open}>
        <div className="wk-months" role="group" aria-label="Month">
          {months.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={entry.key === shown.key}
              onClick={() => setMonth(entry.key)}
            >
              {entry.label}
              {entry.key === now?.id.slice(0, 7) ? <s /> : null}
            </button>
          ))}
        </div>

        <div className="wk-rows" role="radiogroup" aria-label="Week">
          {shown.weeks.map((week, index) => {
            const { value, note } = weekValue(week);
            const { lead, also } = names(week, play);
            return (
              <button
                key={week.id}
                type="button"
                role="radio"
                aria-checked={week.id === current.id}
                className="wk-week"
                style={{ "--i": index } as React.CSSProperties}
                onClick={() => go(week)}
              >
                <s className={week.state} />
                <span className="n">
                  {lead}
                  {also ? <em> · {also}</em> : null}
                </span>
                <span className="mid">
                  <span className="d">{weekDates(week)}</span>
                  {week.cards ? <span className="wk-cards">{week.cards} cards</span> : null}
                </span>
                <span className="val">
                  <b>{value}</b>
                  <span>{note}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="wk-foot">
          {now && now.id !== current.id ? (
            <button type="button" className="wk-now" onClick={() => go(now)}>
              Now
            </button>
          ) : (
            <span />
          )}
          <span>
            {weeks.length} weeks · {weeks.filter((week) => week.gw).length} open on Sorare
          </span>
        </div>
      </div>
    </div>
  );
}
