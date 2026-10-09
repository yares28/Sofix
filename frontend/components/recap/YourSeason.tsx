"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cannot } from "../../lib/apply";
import { weekWon } from "../../lib/entered";
import { seasonWeeks, type SavedWeek } from "../../lib/myWeeks";
import { archiveFinishedWeeks } from "../../lib/myWeeksClient";
import { cashLabel, essenceLabel } from "../../lib/play";

export default function YourSeason({ saved, now }: { saved: SavedWeek[] | null; now: string }) {
  const [weeks, setWeeks] = useState(saved ?? []);
  const [unavailable, setUnavailable] = useState(saved === null);
  const [status, setStatus] = useState(saved === null ? "Saved weeks are temporarily unavailable." : "Checking finished weeks.");
  useEffect(() => {
    let current = true;
    void archiveFinishedWeeks().then((result) => {
      if (!current) return;
      if (!result.unavailable) setWeeks(result.weeks);
      setUnavailable(result.unavailable === true);
      const issue = result.issue;
      setStatus(result.unavailable ? "Week storage is temporarily unavailable. Previously saved weeks are kept."
        : issue ? issue.state === "outdated" ? "Reload the Sofix extension to read more weeks." : cannot(issue.state)?.title ?? "Sorare could not read every finished week. Saved weeks are kept."
          : result.pending.length ? "Some finished weeks still need a complete Sorare read in Chrome." : "Every available finished week is saved.");
    });
    return () => { current = false; };
  }, []);
  const season = seasonWeeks(weeks, new Date(now));
  const totals = season.reduce((sum, week) => {
    const won = weekWon(week.lineups);
    return { essence: sum.essence + won.essence, cash: sum.cash + won.cash, lineups: sum.lineups + won.lineups };
  }, { essence: 0, cash: 0, lineups: 0 });
  return <section className="hm-tile rc-season" aria-labelledby="your-season-title">
    <div className="rc-th"><h2 id="your-season-title">Your season</h2><span>Saved from Sorare</span><Link href="/audit/rewards">Compare with the plan &gt;</Link></div>
    {season.length ? <>
      <p className="rc-season-total"><b>{essenceLabel(totals.essence)} essence</b><span>{cashLabel(totals.cash)} · {season.length} finished weeks · {totals.lineups} lineups</span></p>
      <details><summary>Week by week</summary><table><caption className="visually-hidden">Your saved rewards each week</caption>
        <thead><tr><th scope="col">Week</th><th scope="col">Essence</th><th scope="col">Cash</th></tr></thead>
        <tbody>{season.map((week) => { const won = weekWon(week.lineups); return <tr key={week.slug}><th scope="row">GW{week.number}</th><td>{essenceLabel(won.essence)}</td><td>{cashLabel(won.cash)}</td></tr>; })}</tbody>
      </table></details>
    </> : unavailable ? null : <p className="rc-none">No finished weeks saved yet. Open Home in Chrome with your signed-in Sorare tab to keep them here.</p>}
    <p className="rc-none" role="status">{status}</p>
    <p className="rc-none">Saved a day after the week ends, once every lineup has a rank. Cash and essence stay separate.</p>
  </section>;
}
