"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function StrategyWeekPicker({ weeks, selected, sort, options }: { weeks: { slug: string; number: number | null }[]; selected: string; sort: string; options: [string, string][] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function change(key: string, value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    start(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }));
  }
  return <div className="st-picker" aria-busy={pending}>
    <label htmlFor="st-week">Gameweek results</label>
    <select id="st-week" name="resultsGw" autoComplete="off" value={selected} onChange={event => change("resultsGw", event.target.value)}>
      <option value="all">All saved GWs</option>
      {weeks.map(week => <option key={week.slug} value={week.slug}>{week.number === null ? week.slug : `GW${week.number}`}</option>)}
    </select>
    <label htmlFor="st-sort">Rank by</label>
    <select id="st-sort" name="rankBy" autoComplete="off" value={sort} onChange={event => change("rankBy", event.target.value)}>
      {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    <span role="status">{pending ? "Updating results…" : ""}</span>
  </div>;
}
