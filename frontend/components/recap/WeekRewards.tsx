"use client";

import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
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

/** "LaLiga essence · limited" → "LaLiga essence": the rarity is the week's own, the Recap's columns are narrow. */
export const shortReward = (key: string) => (key === "essence:unknown:unknown" ? "Essence" : rewardName(key).replace(/ · .*$/, ""));

/** A summary's number for one reward: what was paid when anything is checked, else what was expected; null when unknown. */
function amount(summary: WeekRewards | undefined, key: string, paid: boolean): number | null {
  if (!summary?.total) return null;
  const n = paid ? summary.actual.values[key] ?? (summary.actual.checked ? 0 : null) : summary.expected[key] ?? (summary.forecastChecked ? 0 : null);
  return n ?? null;
}
const essenceTotal = (summary: WeekRewards | undefined, keys: string[], paid: boolean) =>
  keys.filter((key) => key.startsWith("essence:")).reduce((sum, key) => sum + (amount(summary, key, paid) ?? 0), 0);

/** The rewards that matter to the Recap: no card lines, and the "unknown essence" placeholder only when nothing else names essence. */
function keysOf(...summaries: (WeekRewards | undefined)[]) {
  return rewardKeys(summaries.flatMap((s) => [s?.expected, s?.actual.values]))
    .filter((key, _, all) => key !== "card" && !key.startsWith("card:") && (key !== "essence:unknown:unknown" || !all.some((k) => k.startsWith("essence:") && k !== key)));
}

/**
 * The hero's one number: what you won this GW, largest essence first, or before anything is paid the Sofix plan's expected
 * essence. The other paid rewards sit under it.
 */
/** `fallback`: the number a week with nothing to win or expect still has (a national-team week: how many of your cards play). */
export function HeroNumber({ plan, expectedEssence, hasEntries, fallback = null }: { plan: WeekRewards; expectedEssence: number | null; hasEntries: boolean; fallback?: { n: number; label: string } | null }) {
  const own = useWeekRewards()?.own;
  const mine = own?.summary;
  const paid = Boolean(mine?.actual.checked);
  const keys = keysOf(mine, plan).filter((key) => (amount(mine, key, true) ?? 0) > 0);
  const order = (key: string) => (key.startsWith("essence:") ? 0 : key.startsWith("cash:") ? 1 : 2);
  const won = paid ? keys.sort((a, b) => order(a) - order(b) || (amount(mine, b, true) ?? 0) - (amount(mine, a, true) ?? 0)) : [];
  const [top, ...rest] = won;
  // Until your lineups are read (from the saved copy, then Sorare), a skeleton holds the number's place: no flash of the plan's number.
  if ((own ? own.state === "loading" : hasEntries) && !paid) return <div className="rx-big" aria-busy="true"><i className="rx-big-skel" /></div>;
  if (top) {
    return (
      <div className="rx-big">
        <p className="rx-num"><span className="rx-plus" aria-hidden="true">+</span>{rewardNumber(top, amount(mine, top, true) ?? 0)}</p>
        <p className="rx-num-l"><b>{shortReward(top)} won</b></p>
        {rest.length ? <dl className="rx-mini">{rest.slice(0, 3).map((key) => <div key={key}><dt>{shortReward(key)}</dt><dd>{rewardNumber(key, amount(mine, key, true) ?? 0)}</dd></div>)}</dl> : null}
      </div>
    );
  }
  if (paid) return <div className="rx-big"><p className="rx-num">0</p><p className="rx-num-l"><b>No prize this week</b></p></div>;
  if (expectedEssence === null) return fallback ? <div className="rx-big"><p className="rx-num">{fallback.n}</p><p className="rx-num-l"><b>{fallback.label}</b></p></div> : null;
  return (
    <div className="rx-big">
      <p className="rx-num">{rewardNumber("essence", Math.round(expectedEssence))}</p>
      <p className="rx-num-l"><b>Expected essence</b> · Sofix plan</p>
    </div>
  );
}

/** You against the Sofix plan in one small grid: Rewards % and each reward, the better value of each column lit. */
export function RewardsDuel({ recommendation, hasEntries }: { recommendation: WeekRewards; hasEntries: boolean }) {
  const own = useWeekRewards()?.own;
  const mine = own?.summary;
  const loading = (own?.state ?? (hasEntries ? "loading" : "ready")) === "loading";
  const keys = keysOf(mine, recommendation);
  const youPaid = Boolean(mine?.actual.checked), sofixPaid = Boolean(recommendation.actual.checked);
  const rows = [
    { who: "You", summary: mine, paid: youPaid, count: mine?.total ?? 0, mark: "Y" },
    { who: "Sofix plan", summary: recommendation, paid: sofixPaid, count: recommendation.total, mark: "S" },
  ];
  const best = (key: string | "chance") => {
    const values = rows.map((row) => (key === "chance" ? row.summary?.chance ?? null : amount(row.summary, key, row.paid)));
    if (values.some((v) => v === null) || values[0] === values[1]) return -1;
    return (values[0] as number) > (values[1] as number) ? 0 : 1;
  };
  const youEss = essenceTotal(mine, keys, true), sofixEss = essenceTotal(recommendation, keys, true);
  // Nothing entered and no plan (a national-team week): no grid of dashes.
  if (!loading && !mine?.total && !recommendation.total) return null;
  const verdict = youPaid && sofixPaid
    ? youEss > sofixEss ? "You won more than the Sofix plan would have" : youEss < sofixEss ? "The Sofix plan would have won more" : "You and the Sofix plan won the same essence"
    : null;
  const cell = (key: string, i: number) => {
    const row = rows[i]!;
    const n = key === "chance" ? row.summary?.chance ?? null : amount(row.summary, key, row.paid);
    const text = loading && i === 0 ? <i className="rx-skel" /> : n === null ? "—" : key === "chance" ? chanceLabel(n) : rewardNumber(key, n);
    return <span role="cell" key={`${key}-${i}`} data-reward={key} data-who={row.mark} className={`rx-v${best(key) === i ? " win" : ""}${n === 0 ? " zero" : ""}`}>{text}</span>;
  };
  const columns = ["chance", ...keys];
  const label = (key: string) => (key === "chance" ? "Rewards %" : shortReward(key));
  const who = (row: (typeof rows)[number]) => <><b>{row.who}</b><small>{row.count} Lineup{row.count === 1 ? "" : "s"}{row.paid ? "" : row.summary?.total ? " · expected" : ""}</small></>;
  return (
    <section className="rx-duel" aria-label="You against the Sofix plan">
      {/* A wide screen reads one row per side; a phone one row per reward, so nothing is squeezed. */}
      <div className="rx-cmp" style={{ gridTemplateColumns: `minmax(150px, 1.4fr) repeat(${columns.length}, minmax(0, 1fr))` }} role="table" aria-label="Rewards, you against the Sofix plan">
        <div role="row" className="rx-cmp-row">
          <span role="columnheader" />
          {columns.map((key) => <span key={key} role="columnheader" className="rx-hd">{label(key)}</span>)}
        </div>
        {rows.map((row, i) => (
          <div role="row" className="rx-cmp-row" key={row.who}>
            <span role="rowheader" className="rx-who"><i data-who={row.mark} aria-hidden="true">{row.mark}</i><span>{who(row)}</span></span>
            {columns.map((key) => cell(key, i))}
          </div>
        ))}
      </div>
      <div className="rx-cmp-phone" role="table" aria-label="Rewards, you against the Sofix plan">
        <div role="row" className="rx-pr">
          <span role="columnheader" />
          {rows.map((row) => <span role="columnheader" key={row.who} className="rx-who">{who(row)}</span>)}
        </div>
        {columns.map((key) => (
          <div role="row" className="rx-pr" key={key}>
            <span role="rowheader" className="rx-hd">{label(key)}</span>
            {rows.map((_, i) => cell(key, i))}
          </div>
        ))}
      </div>
      {verdict ? <p className="rx-verdict"><i aria-hidden="true" />{verdict}</p> : null}
    </section>
  );
}
