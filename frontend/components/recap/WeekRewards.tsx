"use client";

import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import Link from "../navigation/NavigationLink";
import { rewardKeys, rewardName, rewardNumber } from "../../lib/playRewards";
import type { WeekRewards } from "../../lib/weekRewards";
import { chanceLabel } from "../../lib/play";

type Own = { summary: WeekRewards; state: "loading" | "ready" | "unavailable" };
const RewardsContext = createContext<{ own: Own | null; setOwn: Dispatch<SetStateAction<Own | null>> } | null>(null);

export function WeekRewardsProvider({ children }: { children: ReactNode }) {
  const [own, setOwn] = useState<Own | null>(null);
  return <RewardsContext.Provider value={{ own, setOwn }}>{children}</RewardsContext.Provider>;
}
export const useWeekRewards = () => useContext(RewardsContext);

function Side({ label, summary, state = "ready", fallback }: { label: string; summary?: WeekRewards; state?: Own["state"]; fallback?: WeekRewards }) {
  const keys = rewardKeys([summary?.expected, summary?.actual.values, fallback?.expected, fallback?.actual.values]).filter((key, _, all) => key !== "card" && !key.startsWith("card:") && (key !== "essence:unknown:unknown" || !all.some(k => k.startsWith("essence:") && k !== key) || (summary?.actual.values[key] ?? 0) > 0 || (summary?.expected[key] ?? 0) > 0));
  const loading = state === "loading";
  const value = (key: string, actual: boolean) => {
    if (loading) return <i className="rc-reward-skeleton" />;
    if (!summary || !summary.total) return "—";
    const n = actual ? summary.actual.values[key] ?? (summary.actual.checked ? 0 : null) : summary.expected[key] ?? (summary.forecastChecked ? 0 : null);
    if (n == null) return "—";
    const partial = actual ? summary.actual.checked < summary.total : summary.forecastChecked < summary.total;
    return <>{rewardNumber(key, n)}{partial ? <small title={`${actual ? summary.actual.checked : summary.forecastChecked}/${summary.total} lineups ${actual ? "checked" : "with forecasts"}`}>+</small> : null}</>;
  };
  return <section className="rc-reward-side" aria-label={`${label} GW rewards`} aria-busy={loading || undefined}>
    <div className="rc-reward-head"><h3>{label}</h3><span title="Prizes at each lineup's projected score">Expected</span><span>{label === "You" ? "Actual" : "Would win"}</span></div>
    <div className="rc-reward-chance" aria-label={`${label} reward chance per lineup`}>
      <span>Reward chance / {summary && summary.chanceRated < summary.total ? "rated " : ""}lineup</span>
      <strong>{loading ? <i className="rc-reward-skeleton" /> : summary?.chance == null ? "—" : summary.chance === 1 ? "100%" : chanceLabel(summary.chance)}</strong>
      {summary && summary.chanceRated > 0 && summary.chanceRated < summary.total ? <small>{summary.chanceRated}/{summary.total} rated</small> : null}
    </div>
    <dl>{keys.map(key => <div key={key} data-reward={key}><dt>{key === "essence:unknown:unknown" ? "Essence" : rewardName(key)}</dt><dd>{value(key, false)}</dd><dd>{value(key, true)}</dd></div>)}</dl>
    <p className="rc-reward-status" aria-live="polite">{loading ? "Checking your lineups…" : state === "unavailable" && !summary?.actual.checked ? "Entries unavailable" : !summary?.total ? label === "You" ? "No entered lineups" : "Plan unavailable" : <>{summary.total} lineup{summary.total === 1 ? "" : "s"} · {summary.actual.checked}/{summary.total} checked</>}</p>
  </section>;
}

export default function RewardsCard({ recommendation, gw, href, hasEntries }: { recommendation: WeekRewards; gw: number | null; href: string; hasEntries: boolean }) {
  const context = useWeekRewards();
  return <section className="hm-tile rc-rewards" aria-labelledby="rc-rewards-h">
    <div className="rc-th"><h2 id="rc-rewards-h">Rewards</h2>{gw ? <span>GW{gw}</span> : null}<Link href={href}>Play ›</Link></div>
    <Side label="You" summary={context?.own?.summary} fallback={recommendation} state={context?.own?.state ?? (hasEntries ? "loading" : "ready")} />
    <Side label="Sofix" summary={recommendation} />
  </section>;
}
