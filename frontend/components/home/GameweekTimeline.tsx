"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { dateRange, type TimelineEntry } from "../../lib/home";

type Props = { entries: TimelineEntry[]; column: number; opening: number };

// Fixed widths, so the server can place the knob and a gameweek change slides it (CSS transition), no measuring.
const ITEM = 108;
const BREAK = 150;
const GAP = 4;
const PAD = 5;

const ARROW = (d: string) => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The gameweek switcher (S0's timeline): every gameweek, played ones grey, the next one blue, LaLiga's breaks
 * hatched. Each gameweek is a link (/?gw=N), so the page is server-rendered for it and the URL can be shared;
 * ← and → move one gameweek.
 */
export default function GameweekTimeline({ entries, column, opening }: Props) {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);

  const gws = entries.filter((e): e is Extract<TimelineEntry, { kind: "gw" }> => e.kind === "gw");
  const at = gws.findIndex((e) => e.column === column);
  const href = (e: Extract<TimelineEntry, { kind: "gw" }>) => (e.column === opening ? "/" : `/?gw=${e.number}`);
  const prev = gws[at - 1];
  const next = gws[at + 1];

  let left = PAD;
  let knob = PAD;
  for (const e of entries) {
    if (e.kind === "gw" && e.column === column) knob = left;
    left += (e.kind === "gw" ? ITEM : BREAK) + GAP;
  }

  // Keep the selected gameweek in the middle of the track (it scrolls sideways on narrow screens), and let the
  // keyboard focus follow it after ← / →.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: knob - (el.clientWidth - ITEM) / 2, behavior: reduce ? "auto" : "smooth" });
    if (el.contains(document.activeElement)) el.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true });
  }, [knob]);

  // ← and → on a focused gameweek move one gameweek (keyboard users skip the arrows).
  const onArrow = (event: React.KeyboardEvent) => {
    const target = event.key === "ArrowLeft" ? prev : event.key === "ArrowRight" ? next : undefined;
    if (!target) return;
    event.preventDefault();
    router.push(href(target), { scroll: false });
  };

  return (
    <nav className="hm-timeline" aria-label="Gameweeks">
      {prev ? (
        <Link className="tl-arrow" href={href(prev)} scroll={false} prefetch={false} aria-label={`Previous gameweek, GW${prev.number}`}>
          {ARROW("M9 2 4 7l5 5")}
        </Link>
      ) : (
        <span className="tl-arrow off" aria-hidden="true">
          {ARROW("M9 2 4 7l5 5")}
        </span>
      )}
      <div className="tl-track" ref={track}>
        <span className="tl-knob" style={{ transform: `translateX(${knob}px)`, width: ITEM }} aria-hidden="true" />
        {entries.map((e) =>
          e.kind === "break" ? (
            <div key={`break-${e.from}`} className="tl-break" style={{ width: BREAK }}>
              <b>Break</b>
              <span>{dateRange(e.from, e.to)}</span>
            </div>
          ) : (
            <Link
              key={e.column}
              href={href(e)}
              scroll={false}
              prefetch={false}
              className="tl-item"
              style={{ width: ITEM }}
              aria-current={e.column === column ? "page" : undefined}
              onKeyDown={onArrow}
            >
              <span className="tl-top">
                <span className={`tl-dot ${e.state}`} aria-hidden="true" />
                GW{e.number}
                {e.state === "next" && <span className="visually-hidden"> (next)</span>}
              </span>
              <span className="tl-date">{e.tbc ? `${dateRange(e.from, e.from)} · TBC` : dateRange(e.from, e.to)}</span>
            </Link>
          ),
        )}
      </div>
      {next ? (
        <Link className="tl-arrow" href={href(next)} scroll={false} prefetch={false} aria-label={`Next gameweek, GW${next.number}`}>
          {ARROW("m5 2 5 5-5 5")}
        </Link>
      ) : (
        <span className="tl-arrow off" aria-hidden="true">
          {ARROW("m5 2 5 5-5 5")}
        </span>
      )}
    </nav>
  );
}
