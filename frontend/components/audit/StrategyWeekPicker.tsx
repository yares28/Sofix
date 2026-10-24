"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function StrategyWeekPicker({ weeks, selected }: { weeks: { slug: string; number: number | null }[]; selected: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <div className="st-picker" aria-busy={pending}>
    <label htmlFor="st-week">Gameweek results</label>
    <select id="st-week" name="resultsGw" autoComplete="off" value={selected} onChange={event => {
      const url = new URL(window.location.href);
      url.searchParams.set("resultsGw", event.target.value);
      start(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }));
    }}>
      {weeks.map(week => <option key={week.slug} value={week.slug}>{week.number === null ? week.slug : `GW${week.number}`}</option>)}
    </select>
    <span role="status">{pending ? "Loading results…" : ""}</span>
  </div>;
}
