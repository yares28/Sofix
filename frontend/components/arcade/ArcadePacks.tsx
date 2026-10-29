"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ARCADE_PACKS_VERSION, ARCADE_TIERS_VERSION, readArcadeCollection, readPackOdds, type Arcade, type ArcadeCollection, type ArcadePack } from "../../lib/arcade";
import { ICON, missionGoal, openMany, packRow, packsToFinish, spendGems, STAR_OR_BETTER, type Goal, type PackRow, type TierOdds } from "../../lib/arcadePacks";

const TIERS = ["All", "Bronze", "Silver", "Gold", "Special"] as const;
/** A league pack is titled just "Bronze", "Silver" or "Gold"; anything else (Live Today, Goalkeeper Pack) is special. */
export const tierOf = (title: string) => (["Bronze", "Silver", "Gold"].includes(title.trim()) ? title.trim() : "Special");
const PAGE = 12;
const price = (p: { price: number; currency: string }) => `${p.price.toLocaleString("en-GB")} ${p.currency === "COMMON_GEM" ? "gems" : p.currency === "COMMON_ESSENCE" ? "essence" : p.currency.toLowerCase()}`;
const pct = (x: number) => (x > 0 && x < 0.001 ? "<0.1%" : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
const num = (x: number) => x.toLocaleString("en-GB", { maximumFractionDigits: x < 1 ? 2 : 1 });

type GoalKey = "new" | "icon" | "star" | `mission:${string}`;
const CURRENCIES = ["COMMON_GEM", "COMMON_ESSENCE"] as const;
type Currency = (typeof CURRENCIES)[number];
const UNIT: Record<Currency, string> = { COMMON_GEM: "Gems", COMMON_ESSENCE: "Essence" };

/**
 * Gems and packs (owner, 29 Oct 2026): which packs to buy with your gems for an Icon or a Star, for players you do not have yet, or to
 * finish a collection mission, worked out from the odds Sorare publishes for every slot of every pack, with the maths in view.
 * Read on a click only (a few large answers).
 */
export default function ArcadePacks({ arcade }: { arcade: Arcade }) {
  const step = arcade.board?.steps.find((s) => s.number === arcade.board?.current) ?? arcade.board?.steps[0];
  const packs: ArcadePack[] = useMemo(() => step?.packs ?? [], [step]);
  const [odds, setOdds] = useState<TierOdds | "reading" | "outdated" | "failed" | null>(null);
  const [missions, setMissions] = useState<ArcadeCollection[] | "outdated" | null>(null);
  useEffect(() => { void readArcadeCollection().then(setMissions); }, [arcade]); // once per read
  const [goal, setGoal] = useState<GoalKey>("icon");
  const [tier, setTier] = useState<(typeof TIERS)[number]>("All");
  const [page, setPage] = useState(0);
  const owned = useMemo(() => new Set(arcade.cards.map((c) => c.player)), [arcade.cards]);
  const leagueOf = useMemo(() => new Map(arcade.cards.flatMap((c) => (c.teamSlug && c.league ? [[c.teamSlug, c.league.slug] as const] : []))), [arcade.cards]);
  const open = Array.isArray(missions) ? missions.filter((m) => !m.done && !m.expired) : [];
  const mission = goal.startsWith("mission:") ? open.find((m) => m.id === goal.slice(8)) ?? null : null;

  // The goal as Sorare's odds can count it.
  const goalFor = (pack: ArcadePack): Goal => {
    if (goal === "new") return { label: "players you do not have", need: 1, distinct: true, owned };
    if (goal === "star") return { label: "Star or better", need: 1, distinct: false, tiers: STAR_OR_BETTER, owned };
    if (!mission) return { label: "Icon", need: 1, distinct: false, tiers: ICON, owned };
    return missionGoal(mission, pack.league, owned, leagueOf);
  };

  const tierOdds = odds && typeof odds === "object" ? odds : null;
  const rows: PackRow[] = tierOdds
    ? packs.filter((p) => tierOdds[p.slug]?.length).map((p) => packRow(p, tierOdds[p.slug]!, goalFor(p))).sort((a, b) => (a.perHit ?? Infinity) - (b.perHit ?? Infinity))
    : [];
  const gems = arcade.gems ?? 0;
  const essence = arcade.essence ?? 0;
  // Each budget starts at your wallet and can be changed to look ahead (owner, 29 Oct: no essence yet, or 500 gems, or 50k essence).
  const [budget, setBudget] = useState<Record<Currency, number | null>>({ COMMON_GEM: null, COMMON_ESSENCE: null });
  const budgetOf = (c: string) => (c === "COMMON_GEM" ? budget.COMMON_GEM ?? gems : c === "COMMON_ESSENCE" ? budget.COMMON_ESSENCE ?? essence : 0);
  const listed = (tierOdds ? rows : packs).filter((r) => tier === "All" || tierOf(r.title) === tier);
  const plans = CURRENCIES.map((c) => ({ currency: c, plan: rows.some((r) => r.currency === c) ? spendGems(rows, budgetOf(c), c) : null }));
  const lead = plans.find((p) => p.plan?.buys.length)?.plan ?? null;
  const best = lead?.buys[0] ? rows.find((r) => r.slug === lead.buys[0]!.slug) ?? null : null;
  const finish = mission && best && tierOdds ? packsToFinish(tierOdds[best.slug]!, goalFor(packs.find((p) => p.slug === best.slug)!), Math.floor(budgetOf(best.currency) / best.price)) : null;
  const work = async () => {
    setOdds("reading");
    const read = await readPackOdds(Math.max(0, ...packs.map((p) => p.cards)));
    setOdds(read === null ? "failed" : read === "outdated" ? "outdated" : Object.keys(read.tiers).length ? read.tiers : "outdated");
  };
  const name = (r: { title: string; league: string | null }) => `${r.title}${r.league ? ` · ${arcade.set.leagues.find((l) => l.slug === r.league)?.name ?? r.league}` : ""}`;
  if (!packs.length) return null;
  const pages = Math.max(1, Math.ceil(listed.length / PAGE));
  const at = Math.min(page, pages - 1);
  const label = mission ? mission.title : goal === "new" ? "a player you do not have" : goal === "star" ? "a Star or better" : "an Icon";

  return (
    <section className="arc-gems" aria-labelledby="arc-gems-title">
      <div className="arc-plan-head">
        <h2 id="arc-gems-title">Gems and packs</h2>
        <span className="arc-gems-wallet"><b>{gems.toLocaleString("en-GB")}</b> gems · <b>{essence.toLocaleString("en-GB")}</b> essence</span>
      </div>
      <div className="arc-modes" role="group" aria-label="What to buy for">
        {([["icon", "Icon"], ["star", "Star or better"], ["new", "New players"]] as const).map(([key, text]) => <button key={key} type="button" aria-pressed={goal === key} onClick={() => setGoal(key)}>{text}</button>)}
        {open.map((m) => <button key={m.id} type="button" aria-pressed={goal === `mission:${m.id}`} onClick={() => setGoal(`mission:${m.id}`)}>{m.title} · {m.progress}/{m.target}{m.rewards.length ? ` · ${m.rewards.join(" + ")}` : ""}</button>)}
      </div>
      {missions === "outdated" ? <p className="arc-sub">Collection missions need extension {ARCADE_TIERS_VERSION}: reload it on chrome://extensions.</p> : null}
      <div className="arc-budget" role="group" aria-label="Budget">
        {CURRENCIES.map((c) => (
          <label key={c}>{UNIT[c]} to spend
            <input type="number" inputMode="numeric" min={0} step={c === "COMMON_GEM" ? 10 : 1000} value={budgetOf(c)} onChange={(e) => setBudget({ ...budget, [c]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
          </label>
        ))}
        {budget.COMMON_GEM !== null || budget.COMMON_ESSENCE !== null ? <button type="button" className="arc-small" onClick={() => setBudget({ COMMON_GEM: null, COMMON_ESSENCE: null })}>Back to my wallet</button> : null}
      </div>
      {!rows.length ? (
        <div className="arc-lab-card arc-gems-ask">
          <p>{odds === "reading" ? "Reading Sorare's odds for every slot of every pack (a few seconds)…"
            : odds === "outdated" ? `Tier odds need extension ${ARCADE_TIERS_VERSION} (packs ${ARCADE_PACKS_VERSION}): reload it on chrome://extensions.`
            : odds === "failed" ? "Sorare did not give the odds this time; try again in a minute."
            : `${packs.length} packs on this step. Read Sorare's odds for each slot to see what your gems and essence buy.`}</p>
          <button type="button" className="arc-small" onClick={() => void work()} disabled={odds === "reading"}>Read the odds</button>
        </div>
      ) : (
        <div className="arc-gems-grid">
          {plans.map(({ currency, plan }) => {
            const spend = budgetOf(currency);
            const cheapest = rows.filter((r) => r.currency === currency && r.atLeastOne > 0).sort((a, b) => a.price - b.price)[0] ?? null;
            return (
              <div key={currency} className={`arc-lab-card arc-gems-answer is-${currency === "COMMON_GEM" ? "gems" : "essence"}`}>
                <small>{spend.toLocaleString("en-GB")} {UNIT[currency].toLowerCase()} for {label}</small>
                {plan && plan.buys.length ? (
                  <>
                    <p className="arc-gems-buy">{plan.buys.map((b) => `${b.count} × ${name(b)}`).join(" + ")}</p>
                    <p className="arc-gems-big"><b>{pct(plan.atLeastOne)}</b> at least one{mission ? " card for it" : ""} · <b>{num(plan.expected)}</b> on average</p>
                  </>
                ) : plan === null ? <p className="arc-gems-big">No {UNIT[currency].toLowerCase()} pack on this step.</p>
                  : cheapest ? <p className="arc-gems-big">Not enough for a pack that can give it. One {name(cheapest)} ({price(cheapest)}): <b>{pct(cheapest.atLeastOne)}</b>.</p>
                  : <p className="arc-gems-big">No {UNIT[currency].toLowerCase()} pack can give {label}.</p>}
              </div>
            );
          })}
          {mission ? (
            <div className="arc-lab-card arc-gems-mission">
              {finish ? <p className="arc-sub">The mission needs {Math.max(0, mission.target - mission.progress)} more{mission.rewards.length ? ` for ${mission.rewards.join(" + ")}` : ""}: with {name(best!)}, half the time in {finish.half ?? "200+"} packs, 9 times in 10 in {finish.nine ?? "200+"}; your budget buys {Math.floor(budgetOf(best!.currency) / best!.price)}, which finish it {pct(finish.withinBudget)} of the time.</p> : null}
              <p className="arc-sub">{mission.players.length ? "Counts each listed player you do not have, once." : "Counts each player of its clubs or league you do not have, once: duplicates and special editions of a player you own count for nothing."}</p>
            </div>
          ) : null}
        </div>
      )}
      <div className="arc-lab-card arc-gems-table">
        <div className="arc-modes" role="group" aria-label="Pack type">
          {TIERS.map((t) => { const count = (tierOdds ? rows : packs).filter((r) => t === "All" || tierOf(r.title) === t).length; return <button key={t} type="button" aria-pressed={tier === t} disabled={!count} onClick={() => { setTier(t); setPage(0); }}>{t} ({count})</button>; })}
        </div>
        <ol className="arc-packs-list">
          {listed.slice(at * PAGE, (at + 1) * PAGE).map((p, i) => {
            const r = rows.find((x) => x.slug === p.slug) ?? null;
            const n = p.price > 0 ? Math.floor(budgetOf(p.currency) / p.price) : 0;
            const many = r && tierOdds ? openMany(tierOdds[r.slug]!, goalFor(packs.find((x) => x.slug === r.slug)!), n) : null;
            return (
              <li key={p.slug} className={n === 0 ? "is-off" : undefined} style={{ "--i": i } as CSSProperties}>
                <span>{name(p)}<small>{price(p)}{r ? ` · ${pct(r.atLeastOne)} a pack` : ""}</small></span>
                <span className="arc-packbar" aria-hidden="true"><span style={{ width: `${Math.min(100, (many?.atLeastOne ?? 0) * 100)}%` }} /></span>
                <b title={`At least one in ${n} packs`}>{many ? pct(many.atLeastOne) : "—"}</b>
                <small className="arc-pack-per">{n ? `${n} pack${n === 1 ? "" : "s"}${many ? ` · ${num(many.expected)} on average` : ""}` : "budget buys none"}</small>
              </li>
            );
          })}
        </ol>
        {pages > 1 ? <nav className="arc-pager" aria-label="Pack pages"><button type="button" onClick={() => setPage(at - 1)} disabled={at === 0}>Previous</button><span>Page {at + 1} of {pages}</span><button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages - 1}>Next</button></nav> : null}
        <details className="arc-gems-maths">
          <summary>The maths</summary>
          <p className="arc-sub">A slot&apos;s chance <i>h</i> = Sorare&apos;s odds of the players it counts. One pack gives at least one: 1 − Π(1 − <i>h</i>); <i>n</i> packs: 1 − Π(1 − <i>h</i>)ⁿ; on average <i>n</i>·Σ<i>h</i>, a player counted once when the goal counts each player once. A budget goes to the pack with the most −ln(1 − pack)/price first.</p>
          {best ? <p className="arc-sub">{name(best)}: slots {best.slots.map((h) => pct(h)).join(", ")} → 1 − {best.slots.map((h) => `(1 − ${(h * 100).toFixed(1)}%)`).join("·")} = <b>{pct(best.atLeastOne)}</b> a pack.</p> : null}
        </details>
      </div>
    </section>
  );
}
