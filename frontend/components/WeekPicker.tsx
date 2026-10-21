"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { pageWeeks, weekDates, weekName, type Page, type Week } from "../lib/weeks";
import { COMPETITIONS, type Competition } from "../lib/competitions";

// Pages that count LaLiga rounds. Lineups and Scores show a week's own games, a European midweek's too, so they offer every week.
const BOARD = ["/fixtures", "/difficulty", "/table"];

/** A week's short name: its Sorare game week, else the LaLiga round Sorare has not opened yet. */
const short = (week: Week) => (week.number !== null ? `GW${week.number}` : `R${week.md}`);

/**
 * The app's one gameweek control: it picks a **week**, and every page resolves what it holds — the board its
 * LaLiga round, Play its Sorare gameweek. It is a strip in the bar, no popover: the week shown with its dates, its
 * neighbours as numbers, and the rest of the season a swipe or an arrow away. Design: the "B2" board of the Sofix
 * week picker canvas.
 */
export default function WeekPicker({ weeks, current, now, competition = "PD" }: { weeks: Week[]; current: Week | null; now: Week | null; competition?: Competition }) {
  const router = useRouter();
  const pathname = usePathname();
  const strip = useRef<HTMLDivElement>(null);

  // The week shown sits in the middle of the strip, with its neighbours either side.
  useEffect(() => {
    const box = strip.current;
    const on = box?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (box && on) box.scrollTo({ left: on.offsetLeft - (box.clientWidth - on.clientWidth) / 2 });
  }, [current?.id, pathname]);

  // The strip and the arrows hold the weeks *this page* can show: a board page would otherwise walk through a
  // fortnight of Sorare game weeks holding no LaLiga round and appear to do nothing, and Play would offer one
  // game week twice when it covers a weekend round and a midweek one.
  const play = pathname === "/play";
  const page: Page = BOARD.includes(pathname) ? "board" : play ? "play" : "all";
  const scoped = pageWeeks(weeks, page);

  // Nothing this page can open — Play before Sorare has ever synced — is no bar at all, not an empty one.
  if (!scoped.length || !current) return null;
  // A week asked for that this page does not list (a European week on the board) still shows, in its place.
  const shown = scoped.some((week) => week.id === current.id) ? scoped : [...scoped, current].sort((a, b) => a.from.localeCompare(b.from));

  const go = (week: Week) => {
    // The address as it really is: the board rewrites its own view into it with history.replaceState, which
    // Next's useSearchParams() does not follow, and a week change must not throw the lens or horizon away.
    const next = new URLSearchParams(window.location.search);
    // Always written, even for the week the app is on: each page has its own idea of "no week asked for" —
    // the board opens on the next LaLiga round — so a week you picked has to be said out loud to be kept.
    next.set("w", week.id);
    if (competition !== "PD" || next.has("league")) next.set("end", week.to.slice(0, 10));
    else next.delete("end");
    next.delete("gw"); // the old per-page gameweek; the week replaces it
    if (pathname === "/lineups" || pathname === "/scores") next.delete("m"); // the week names the round: the page opens on its next match
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const here = scoped.findIndex((week) => week.id === current.id);
  const ahead = here >= 0 ? here : scoped.findIndex((week) => week.from > current.from);
  const back = here >= 0 ? scoped[here - 1] : ahead > 0 ? scoped[ahead - 1] : undefined;
  const forward = here >= 0 ? scoped[here + 1] : ahead >= 0 ? scoped[ahead] : undefined;
  const step = (week: Week | undefined) => week && go(week);

  return (
    <div className="wk-bar">
      <div className="wk" role="group" aria-label="Choose gameweek">
        <button type="button" className="wk-step" aria-label="Previous gameweek" disabled={!back} onClick={() => step(back)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M7.5 2 3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="wk-strip" ref={strip} role="radiogroup" aria-label="Week">
          {shown.map((week) => {
            const on = week.id === current.id;
            const name = `${competition === "PD" ? weekName(week) : `${COMPETITIONS[competition]} GW${week.md ?? "–"}`}, ${weekDates(week, page)}`;
            return (
              <button
                key={week.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={name}
                title={name}
                className={`wk-chip ${week.state}`}
                onClick={() => go(week)}
              >
                {on ? (
                  <>
                    <span className={`wk-dot ${week.state}`} />
                    <b>{short(week)}</b>
                    <span className="wk-when">{weekDates(week, page)}</span>
                  </>
                ) : week.number !== null ? (
                  week.number
                ) : (
                  short(week)
                )}
              </button>
            );
          })}
        </div>
        <button type="button" className="wk-step" aria-label="Next gameweek" disabled={!forward} onClick={() => step(forward)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4.5 2 8.5 6l-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {now ? (
        <button type="button" className="wk-today" aria-label="Today" disabled={now.id === current.id} onClick={() => go(now)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="6" cy="6" r="1.6" fill="currentColor" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
