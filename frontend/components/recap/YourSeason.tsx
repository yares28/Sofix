"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cannot } from "../../lib/apply";
import { weekWon } from "../../lib/entered";
import { seasonSummary, seasonYear, type SavedWeek } from "../../lib/myWeeks";
import { archiveFinishedWeeks } from "../../lib/myWeeksClient";
import { cashLabel, essenceLabel } from "../../lib/play";
import CardArt from "../cards/CardArt";

export default function YourSeason({ saved, now }: { saved: SavedWeek[] | null; now: string }) {
  const [weeks, setWeeks] = useState(saved ?? []);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState(saved === null ? "Saved rewards are unavailable." : "");
  useEffect(() => {
    let current = true;
    void archiveFinishedWeeks().then((result) => {
      if (!current) return;
      if (!result.unavailable) setWeeks(result.weeks);
      const issue = result.issue;
      setStatus(result.unavailable ? "Rewards could not sync. Showing the saved history."
        : issue ? issue.state === "outdated" ? "Reload the extension to sync rewards." : cannot(issue.state)?.title ?? "Some weeks could not sync."
          : result.pending.length ? "Some finished GWs still need a Sorare read." : "");
    });
    return () => { current = false; };
  }, []);
  const years = [...new Set(weeks.map((w) => seasonYear(w.start)))].sort((a, b) => b - a);
  const year = selected ?? years[0] ?? seasonYear(now);
  const totals = seasonSummary(weeks.filter((w) => seasonYear(w.start) === year));
  const rewarded = [...totals.rewarded].sort((a, b) => b.start.localeCompare(a.start));
  return <section className="hm-tile rc-season" aria-labelledby="your-season-title">
    <div className="rc-th"><h2 id="your-season-title">Your season</h2><Link href="/audit/rewards">Compare with the plan &gt;</Link></div>
    {years.length > 1 ? <label className="rc-season-select">Season<select value={year} onChange={(e) => setSelected(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}/{String(y + 1).slice(-2)}</option>)}</select></label> : <p className="rc-none">{year}/{String(year + 1).slice(-2)}</p>}
    <div className="rc-season-total"><b>{essenceLabel(totals.essence)} Limited essence</b><span>{cashLabel(totals.cash)}{totals.cards ? ` · ${totals.cards} card rewards` : ""}</span><strong>{totals.played} GW played</strong></div>
    {rewarded.length ? <details><summary>Week by week</summary><ul className="rc-reward-weeks">{rewarded.map((week) => {
      const won = weekWon(week.lineups);
      const winners = week.lineups.filter((l) => !l.draft && (l.result?.essence ?? 0) > 0);
      return <li key={week.slug}><details><summary><b>GW{week.number}</b><span>{essenceLabel(won.essence)} essence{won.cash ? ` · ${cashLabel(won.cash)}` : ""}{week.lineups.some((l) => !l.draft && l.result?.card) ? " · Card reward" : ""}</span></summary>
        {winners.map((lineup) => <article className="rc-winner" key={lineup.id}><div><b>{lineup.competition}</b><span>{essenceLabel(lineup.result!.essence)} essence · {Math.round(lineup.result!.score)} pts{lineup.result!.rank ? ` · #${lineup.result!.rank}` : ""}</span></div>
          <ul aria-label="Essence-winning lineup">{lineup.cards.map((c) => <li key={c.slug}><span className="art"><CardArt src={c.picture ?? ""} name={c.name} /></span><span>{c.name}{c.captain ? " · Captain" : ""}</span></li>)}</ul>
        </article>)}
        {year === seasonYear(now) ? <Link href={`/play?gw=${week.number}`}>Open GW{week.number} &gt;</Link> : null}
      </details></li>;
    })}</ul></details> : <p className="rc-none">No rewards recorded for this season yet.</p>}
    {status ? <p className="rc-none" role="status">{status}</p> : null}
  </section>;
}
